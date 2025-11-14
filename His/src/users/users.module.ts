import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { User, UserSchema } from "./users.schema";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [// array of modules that can be imported

    MongooseModule.forFeature([// method for registering models (Mongoose) in this Scope
      {

        name: User.name,// we get the model name from the class (User)
        schema: UserSchema// import schema
      },
    ]),
  ],
  controllers: [UsersController],// will create an instance of the controller and configure HTTP requests without it, HTTP endpoints from UsersController will not be available.
  providers: [UsersService],
  exports: [UsersService]//  UsersService can be used in other modules, for example, AuthModule
})

export class UsersModule { }// allows  to use this module in other modules
//MongooseModule provides the forFeature() method for registering MongoDB schemas in the module. What will happen without this: You won't be able to register the User schema and use it in services.