import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 🔐 LOGIN CREDENTIALS DTO
 * 
 * ✅ УПРОЩЕННАЯ ВЕРСИЯ для учебного проекта
 * 
 * Требования:
 * - Email (валидный формат)
 * - Password (минимум 6 символов)
 * 
 * Примеры валидных паролей:
 * ✅ "123456"
 * ✅ "password"
 * ✅ "admin123"
 * ✅ "qwerty"
 */
export class LoginCredentialsDto {
    @ApiProperty({
        description: 'User email address',
        example: 'admin@hospital1.ru',
    })
    @IsNotEmpty({ message: 'Email required' })
    @IsEmail({}, { message: 'Invalid email' })
    email: string;

    @ApiProperty({
        description: 'User password (minimum 6 characters)',
        example: '123456',
        minLength: 6,
    })
    @IsNotEmpty({ message: 'Password required' })
    @IsString({ message: 'Password must be string' })
    @MinLength(6, { message: 'Password must be at least 6 characters' })
    password: string;
}

export class UpdateCredentialsDto extends PartialType(LoginCredentialsDto) { }