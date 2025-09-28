import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

@Schema()
export class Patient extends Document {
    @Prop({ required: true })
    name: string;
    @Prop({ required: true })
    surname: string;
    @Prop({ required: true })
    age: number;
}
export const PatientSchema = SchemaFactory.createForClass(Patient);