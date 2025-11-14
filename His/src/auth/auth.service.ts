import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';
import { TenantConnectionService } from 'src/services/tenant-connection.service';
import { encrypt } from 'src/utils/encrypt';
import { Secrets, SecretsSchema } from './secrets.schema';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { decrypt } from 'src/utils/decrypt';
import { LoginCredentialsDto } from './dto/credentials.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
    constructor(
        private configService: ConfigService,
        private tenantConnectionService: TenantConnectionService,
        private usersService: UsersService,
        private jwtService: JwtService,
    ) { }

    async login(credentials: LoginCredentialsDto) {
        //Find if user exists by email
        const { email, password } = credentials;
        const user = await this.usersService.getUserByEmail(email);
        if (!user) {
            throw new UnauthorizedException('Wrong credentials');
        }
        //Compare entered password with existing password
        const passwordMatch = await bcrypt.compare(password.toString(), user.password);
        if (!passwordMatch) {
            throw new UnauthorizedException('Wrong credentials');
        }

        const secretKey = await this.fetchAccessTokenSecretSigningKey(user.tenantId)

        //     // const encryptionKey = this.configService.get<string>('security.encryptionSecretKey');
        //     // if (!encryptionKey) {
        //     //     throw new Error('Encryption key is not configured');
        //     // }


        //     // return secretKey;
        // }

        //     // Generate JWT token
        //     const payload = {
        //         email: user.email,
        //         sub: user._id,
        //         tenantId: user.tenantId
        //     };
        const accessToken = await this.jwtService.sign(
            {
                userId: user._id,
                tenantId: user.tenantId  
            },
            { secret: secretKey, expiresIn: '1h' }
        );
        return { accessToken, tenantId: user.tenantId }
        //     // Return user info and token
        //     return {
        //         tenantId: user.tenantId,
        //         access_token,
        //         user: {
        //             _id: user._id,
        //             email: user.email,
        //             tenantId: user.tenantId
        //         }
        //     };
        // }

    }


    async createSecretKeyForNewTenant(tenantId: string) {
        //Generate Random Secret Key
        const jwtSecret = nanoid(128);

        const encryptionKey = this.configService.get<string>('security.encryptionSecretKey');
        if (!encryptionKey) {
            throw new Error('Encryption key is not configured');
        }

        //Encrypt the Secret Key

        const encryptedSecret = encrypt(
            jwtSecret,
            encryptionKey
        );

        //Get Access to the tenant specific Model
        const SecretsModel = await this.tenantConnectionService.getTenantModel(
            {
                name: Secrets.name,
                schema: SecretsSchema,
            },
            tenantId,
        );

        //     //Store the encrypted secret key
        await SecretsModel.create({ jwtSecret: encryptedSecret });
    }

    async fetchAccessTokenSecretSigningKey(tenantId: string) {
        const SecretsModel = await this.tenantConnectionService.getTenantModel(
            {
                name: Secrets.name,
                schema: SecretsSchema,
            },
            tenantId,
        );
        const secretsDoc = await SecretsModel.findOne();
        const encryptionKey = this.configService.get(`security.encryptionSecretKey`);
        if (!encryptionKey) {
            throw new Error('Encryption secret key is not configured');
        }
        const secretKey = decrypt(
            secretsDoc.jwtSecret,
            encryptionKey
        );
        return secretKey;
    }

    async validateToken(token: string) {
        try {
            const decodedToken = this.jwtService.decode(token) as any;
            if (!decodedToken || !decodedToken.userId) {
                return { success: false, error: 'Invalid token format' };
            }
            const user = await this.usersService.getUserById(decodedToken.userId);
            if (!user) {
                return { success: false, error: 'User not found' };
            }

            const secretKey = await this.fetchAccessTokenSecretSigningKey(user.tenantId);
            const verifiedToken = this.jwtService.verify(token, { secret: secretKey });

            return {
                success: true,
                tenantId: user.tenantId,
                userId: (user._id as any).toString(),
                user: {
                    _id: (user._id as any).toString(),
                    email: user.email,
                    name: user.name,
                    tenantId: user.tenantId
                }
            };
        } catch (error) {
            console.error('JWT validation error:', error.message);
            return {
                success: false,
                error: error.message.includes('expired') ? 'Token expired' : 'Invalid token'
            };
        }
    }


}
