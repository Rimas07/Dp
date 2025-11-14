import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import UserDto from './user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  //  Get user by email
  @Get('email/:email')
  async getUserByEmail(@Param('email') email: string) {
    return this.usersService.getUserByEmail(email);
  }

  //  Get user by ID
  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }

  //  Create new user
  @Post()
  async createUser(@Body() body: { user: UserDto; tenantId: string }) {
    return this.usersService.createUser(body.user, body.tenantId);
  }
}
