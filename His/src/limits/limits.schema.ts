import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ versionKey: false })
export class DataLimit extends Document {
    @Prop({ required: true, unique: true })
    tenantId: string;

    @Prop({ required: true, default: 1000 })
    maxDocuments: number; // Макс. количество документов

    @Prop({ required: true, default: 51200 }) // 50 MB в KB
    maxDataSizeKB: number; // Макс. объем данных в KB

    @Prop({ required: true, default: 1000 })
    monthlyQueries: number; // Макс. запросов в месяц
}

export const DataLimitSchema = SchemaFactory.createForClass(DataLimit);