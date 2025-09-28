/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { User } from "./users.schema";
import * as bcrypt from 'bcrypt'

import { Model } from "mongoose";
import UserDto from "./user.dto";


@Injectable()
export class UsersService {
    constructor(@InjectModel(User.name) private UserModel: Model<User>) { }


    async getUserByEmail(email: string) {
        return this.UserModel.findOne({ email })
    }

    async createUser(user: UserDto, tenantId: string) {
        user.password = await bcrypt.hash(user.password.toString(), 10)
        return this.UserModel.create({ ...user, tenantId })
    }

}