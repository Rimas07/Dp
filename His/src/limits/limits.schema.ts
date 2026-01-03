import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ versionKey: false })
export class DataLimit extends Document {
    @Prop({ required: true, unique: true })
    tenantId: string;
    @Prop({ required: true, default: 1000 })
    maxDocuments: number;
    @Prop({ required: true, default: 51200 }) 
    maxDataSizeKB: number; 
    @Prop({ required: true, default: 1000 })
    monthlyQueries: number; 
}

export const DataLimitSchema = SchemaFactory.createForClass(DataLimit);