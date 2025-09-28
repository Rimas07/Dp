/* eslint-disable prettier/prettier */
import { IsNotEmpty, IsString, MinLength, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import UserDto from "src/users/user.dto"
import { ApiProperty } from '@nestjs/swagger';

export default class CreateCompanyDto {
    @ApiProperty({
        description: 'Company name',
        example: 'City Hospital #1',
        minLength: 2,
        maxLength: 100
    })
    @IsNotEmpty({ message: 'Название компании обязательно' })
    @IsString({ message: 'Название компании должно быть строкой' })
    @MinLength(2, { message: 'Название компании должно содержать минимум 2 символа' })
    @MaxLength(100, { message: 'Название компании не должно превышать 100 символов' })
    companyName: string;

    @ApiProperty({
        description: 'Administrator user data',
        type: UserDto
    })
    @ValidateNested()
    @Type(() => UserDto)
    user: UserDto
}