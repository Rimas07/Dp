  import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
  import { PartialType } from '@nestjs/mapped-types';
  import { Type } from 'class-transformer';
  import { ApiProperty } from '@nestjs/swagger';

  export class CreatePatientDto {
    @ApiProperty({
      description: 'Patient first name',
      example: 'John',

    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
      description: 'Patient last name',
      example: 'Doe',

    })
    @IsString()
    @IsNotEmpty()
    surname: string;

    @ApiProperty({
      description: 'Patient age',
      example: 30,
      minimum: 0,

    })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    age: number;
  }

  export class UpdatePatientDto extends PartialType(CreatePatientDto) { }
