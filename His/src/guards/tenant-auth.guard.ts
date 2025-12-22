import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,

} from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AuthService } from 'src/auth/auth.service';
import { UsersService } from 'src/users/users.service';

//Make sure to apply the TenantsMiddleware to any tenant Auth guarded route
@Injectable()
export class TenantAuthenticationGuard implements CanActivate {
    constructor(
        private jwtService: JwtService,
        private authService: AuthService,
        private usersService: UsersService,
        private reflector: Reflector,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check if the route is marked as public
        const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        //Make sure tenant middleware was applied
        if (!request.tenantId) {
            throw new UnauthorizedException('Missing tenant id');
        }

        const tenantId = request.tenantId;

        //Check token validity
        const token = this.extractTokenFromHeader(request);
        if (!token) throw new UnauthorizedException('Missing access token');
        const userId = await this.checkTokenValidity(token, tenantId);


        const payload: any = this.jwtService.decode(token);
        if (payload.tenantId && payload.tenantId !== tenantId) {
            throw new UnauthorizedException('Token tenant mismatch');
        }

        //Attach user data on request
        request.userInfo = {
            id: userId,
        };
        return true;
    }

    private async checkTokenValidity(
        token: string,
        tenantId: string,
    ): Promise<string> {
        try {
            //Get secret from tenant-specific database and decrypt it before verifying
            const secret = await this.authService.fetchAccessTokenSecretSigningKey(
                tenantId,
            );
            const payload = await this.jwtService.verify(token, {
                secret,
                algorithms: ['HS256'],
            });
            return payload.userId;
        } catch (e) {
            throw new UnauthorizedException();
        }
    }

    private extractTokenFromHeader(request: Request): string | undefined {
        return request.headers.authorization?.split(' ')[1];
    }
}