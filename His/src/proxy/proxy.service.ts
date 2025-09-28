/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';

@Injectable()
export class ProxyService {
    health() {
        return { status: 'ok' };
    }
}// to do make siple proxy which will have components lke auth limits





