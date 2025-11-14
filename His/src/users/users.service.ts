import { Injectable } from "@nestjs/common";// to mark classes as a provider/which can be injected into other classes
import { InjectModel } from "@nestjs/mongoose";// Allows to get access to the User model from MongoDB in the service constructor
import { User } from "./users.schema";// import User schema
import * as bcrypt from 'bcrypt'// library for password hashing

import { Model } from "mongoose";// needed so TS understands that User is a Mongoose model with all its methods
import UserDto from "./user.dto";


@Injectable()
export class UsersService {// Create a service class for working with users
    constructor(@InjectModel(User.name) private UserModel: Model<User>) { }


    async getUserByEmail(email: string) {
        return this.UserModel.findOne({ email })
    }// asynchronous function waits for response from database, takes email as parameter// searches by email and returns user with given email

    async getUserById(userId: string) {
        return this.UserModel.findById(userId)
    }// allows to find User info  by id

    async createUser(user: UserDto, tenantId: string) {// Принимает info from user and T/id company
        user.password = await bcrypt.hash(user.password.toString(), 10)// пароль в строку(Bcrypt работает только со строками), создает хеш пароля с cost factor = 10
        return this.UserModel.create({ ...user, tenantId })
    }

}/* Берем пароль
Преобразуем в строку 
Хешируем  это асинхронная операция
Ждем результата (await)
Сохраняем хеш в user.password*/