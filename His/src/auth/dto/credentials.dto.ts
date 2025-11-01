import { IsEmail, IsNotEmpty, IsString, MinLength, Matches } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';

export class LoginCredentialsDto {
    @ApiProperty({
        description: 'User email address',
        example: 'admin@hospital1.ru',
    })
    @IsNotEmpty({ message: 'Email required' })
    @IsEmail({}, { message: 'Invalid email' })
    email: string;

    @ApiProperty({
        description: 'User password (min 8 chars, must contain uppercase, lowercase, number and special character)',
        example: 'SecurePass123!',
        minLength: 8,
        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])',
    })
    @IsNotEmpty({ message: 'Password required' })
    @IsString({ message: 'Password must be string' })
    @MinLength(8, { message: 'Password must be at least 8 characters' })
    @Matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/,
        {
            message: 'Password must contain at least: 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (!@#$%^&*)'
        }
    )
    password: string;
}

export class UpdateCredentialsDto extends PartialType(LoginCredentialsDto) { }