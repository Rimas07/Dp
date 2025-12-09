import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export default class UserDto {
/////////////////////////////////////////////Swagger
  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
    minLength: 2,
    maxLength: 50
  })
/////////////////////////////////////////////Swagger
    
  @IsNotEmpty({ message: 'Username is required' })
  @IsString({ message: 'Username must be string' })
  @MinLength(2, { message: 'The name must contain at least 2 characters' })
  @MaxLength(50, { message: 'The name must not exceed 50 characters' })
  name: string;
/////////////////////////////////////////////Swagger
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com'
  })
    /////////////////////////////////////////////Swagger    
    
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Incorrect email format' })
  email: string;

/////////////////////////////////////////////Swagger
  @ApiProperty({
    description: 'User password',
    example: '123456',
    minLength: 1
  })
/////////////////////////////////////////////Swagger    
  
  @IsNotEmpty({ message: 'Password is required' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(128, { message: 'The password must not exceed 128 characters' })
  password: string;
}