import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types'; //PartialType нужен для Update операций: копирует DTO и делает все поля опциональными, чтобы не писать новый класс вручную.
import { ApiProperty } from '@nestjs/swagger';





export class LoginCredentialsDto {
    @ApiProperty({
        description: 'User email address',
        example: 'admin@hospital1.ru',
    })// for swag descript
    @IsNotEmpty({ message: 'Email required' })// valid/ checks if email is not empty 
    @IsEmail({}, { message: 'Invalid email' })// valid/ email must contain @ otherwise will not proceed
    email: string;

    @ApiProperty({
        description: 'User password (minimum 6 characters)',
        example: '123456',
        minLength: 6,
    })// for swag descript
    @IsNotEmpty({ message: 'Password required' })// valid/ checks if pass is not empty 
    @IsString({ message: 'Password must be string' })// valid/ checks if pass is string
    @MinLength(6, { message: 'Password must be at least 6 characters' })// valid/ checks if pass contains min 6 char otherwise will not proceed
    password: string;
}

export class UpdateCredentialsDto extends PartialType(LoginCredentialsDto) { }

// при логине все поля обязательно но при Update они опциональны