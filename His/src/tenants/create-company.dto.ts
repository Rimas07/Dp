import { IsNotEmpty, IsString, MinLength, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer'; 
import UserDto from "src/users/user.dto"
import { ApiProperty } from '@nestjs/swagger';//Api doc 
export default class CreateCompanyDto {
      ///////////////////////////////////// Swagger 
    @ApiProperty({
        description: 'Company name',
        example: 'City Hospital #1',
        minLength: 2,
        maxLength: 100// swagger descritpion
    })
      ////////////////////////////////////////    
    @IsNotEmpty({ message: 'Company name is mandatory' }) 
    @IsString({ message: 'Company name must be string' })
    @MinLength(2, { message: 'The company name must contain at least 2 characters.' })
    @MaxLength(15, { message: 'No more than 15 characters' })
    companyName: string;
   
    ///////////////////////////////////// Swagger   
    @ApiProperty({
        description: 'Administrator user data',
        type: UserDto
    })
    ///////////////////////////////////// Swagger       
    @ValidateNested()
    @Type(() => UserDto)
    user: UserDto
}
/* 
import { IsNotEmpty, IsString, MinLength, MaxLength, ValidateNested } from 'class-validator';
Import validators, in other words, they check if: Not empty, is a string, and have a min and max length.
////
import { Type } from 'class-transformer'; Converts Jsoon to a class
class-transformer - converts a regular JS object into a class instance
// JSON arrives via API:
{
"companyName": "Hospital",
"user": { ← this is a plain object (not a class!)
"email": "admin@test.com",
"password": "12345"
}
}
// @Type converts to:
{
"companyName": "Hospital",
"user": new UserDto({ ← this is now a class instance!
email: "admin@test.com",
password: "12345"
})

/*
1) comp name must not be empty, otherwise it will not proceed. Be a string, otherwise it will not proceed. This means if user typer is 123, true, or {}, it will return an error.
must contain at least 2 symbols, name must contain a maximum of 10.
If these validators weren't there, we would have to write them manually.
example
if (!companyName) { 
throw new Error('Company name is mandatory');
}
if (typeof companyName !== 'string') { 
throw new Error('Company name must be string');
}
if (companyName.length < 2) { 
throw new Error('Too short');
}
// and so on...
@ValidateNested()// goes inside the User dto

What happens in the end:
1. JSON arrives
2. @Type(() => UserDto) → CONVERT into new UserDto()
3. @ValidateNested() → GO INSIDE and VALIDATE

So, first we convert the JSON into a class, and only then does validation occur.
Without @Type() → @ValidateNested() won't work
Without @ValidateNested() → nested fields won't be validated
user → turns into new UserDto()
json{
  "companyName": "Клиника",
  "user": {
    "email": "a@b.c",
    "password": "123456"
  }
}
At this point: user is just an object { email: "...", password: "..." }
STEP 2: @Type(() => UserDto) — CONVERT
tsuser: new UserDto({
email: "a@b.c",
password: "123456"
})
Now: user is an INSTANCE of a CLASS with validators!
STEP 3: @ValidateNested() — CHECK
ts// NestJS goes inside new UserDto()
→ Sees @IsEmail() on email → OK!
→ Sees @MinLength(6) on password → OK!



*/
