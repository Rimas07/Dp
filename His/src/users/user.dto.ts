/* eslint-disable prettier/prettier */
import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export default class UserDto {
  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
    minLength: 2,
    maxLength: 50
  })
  @IsNotEmpty({ message: 'Username is required' })
  @IsString({ message: 'Username must be string' })
  @MinLength(2, { message: 'The name must contain at least 2 characters.' })
  @MaxLength(50, { message: 'The name must not exceed 50 characters.' })
  name: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com'
  })
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Incorrect email format' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 123456,
    minimum: 100000,
    maximum: 999999999
  })
  @Type(() => Number)
  @IsNotEmpty({ message: 'Password is required' })
  @IsInt({ message: 'Password must be a number' })
  @Min(100000, { message: 'The password must be at least 100000.' })
  @Max(999999999, { message: 'The password must not exceed 999999999.' })
  password: number;
}
