import { IsEmail, IsInt, IsNotEmpty, Min, Max } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class LoginCredentialsDto {
    @ApiProperty({
        description: 'User email address',
        example: 'admin@hospital1.ru',
    })
    @IsNotEmpty({ message: 'Email required' })
    @IsEmail({}, { message: 'invalid email' })
    email: string;

    @ApiProperty({
        description: 'User password',
        example: 123456,
        minimum: 100000,
        maximum: 999999999,
    })
    @Type(() => Number)
    @IsNotEmpty({ message: 'password required' })
    @IsInt({ message: 'Password must be number' })
    @Min(100000, { message: 'Password must be at least 100000' })
    @Max(999999999, { message: 'Password must not exceed 999999999' })
    password: number;
}

export class UpdateCredentialsDto extends PartialType(LoginCredentialsDto) { }