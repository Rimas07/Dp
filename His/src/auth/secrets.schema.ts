import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ versionKey: false, timestamps: true })
export class Secrets extends Document {
    @Prop({ required: true })
    jwtSecret: string;
}

export const SecretsSchema = SchemaFactory.createForClass(Secrets);


/*
versionKey: false - simplifies the document structure, removes an unnecessary field
WITHOUT this setting:

{
"_id": "123",
"jwtSecret": "encrypted_key",
"__v": 0 It's not needed here since we won't be editing secrets often (if at all)
}
timestamps: true - automatically tracks when the secret was created and updated
@Prop({ required: true })
jwtSecret: string;
Ensures isolation—a token from one company won't work in another.
This is NOT the secret itself, but its encrypted version (via Cryptr). What would happen without this:
All companies would use a single shared JWT secret—that's will be huge breach in sec
*/