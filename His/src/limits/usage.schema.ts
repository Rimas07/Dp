import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ versionKey: false, timestamps: true })
export class DataUsage extends Document {
    @Prop({ required: true, index: true })
    tenantId: string;

    @Prop({ required: true, default: 0 })
    documentsCount: number; 

    @Prop({ required: true, default: 0 })
    dataSizeKB: number; 

    @Prop({ required: true, default: 0 })
    queriesCount: number; 
}

export const DataUsageSchema = SchemaFactory.createForClass(DataUsage);