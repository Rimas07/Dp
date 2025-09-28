/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable prettier/prettier */
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginCredentialsDto } from './dto/credentials.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticate user and return JWT token'
  })
  @ApiBody({ type: LoginCredentialsDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        access_token: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2N2Y4ZGE4YjQ1MjM0NTY3ODkwYWJjZGUiLCJ0ZW5hbnRJZCI6ImFiYzEyM2RlZjQ1NiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxNzAwMzU5NjAwfQ.example_signature'
        },
        tenantId: {
          type: 'string',
          example: 'abc123def456'
        }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid credentials'
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data'
  })
  async login(@Body() credentials: LoginCredentialsDto) {
    return this.authService.login(credentials)
  }
}
