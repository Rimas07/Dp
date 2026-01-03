import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';// schema factory преобразует typescript в mongo file 
import { Document } from 'mongoose';

@Schema()
export class Tenant extends Document { 
    @Prop({ required: true })
    companyName: string;
    @Prop({ required: true })
    tenantId: string;    
}

export const TenantSchema = SchemaFactory.createForClass(Tenant)

/* 
@Prop is an important component in NestJS, needed to save data, for example, name:SsS. It includes the field in the schema. Without it, the field is ignored when saving.
MongoDB won't be able to read it because it doesn't exist.
@Schema() is a template (blueprint) for how documents in MongoDB should look. Without Schema Prop, it won't work. Also, without it, MongoDB won't understand how to work with the data.
export const TenantSchema = SchemaFactory.createForClass(Tenant)
Convert the blueprint into a schema that Mongoose understands.
export class Tenant: The template by which documents will be created.
SchemaFactory.createForClass(): Creates a real Mongoose schema from the class.

*/