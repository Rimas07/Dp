import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose"
import { Document } from "mongoose";

@Schema()
export class User extends Document {      //Create a Mongoose schema from the User class
    @Prop({ required: true })// True необзо
    name: string
    @Prop({ required: true, })
    email: string
    @Prop({ required: true })
    password: string
    @Prop({ required: true })
    tenantId: string 
}  
//field linking a user to a company
//In a multi-tenant architecture, each user belongs to a specific company.
//without tenant ID, everything would be in one pile
export const UserSchema = SchemaFactory.createForClass(User);// converts the class to a Mongoose schema

