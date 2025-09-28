/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */

import { InternalServerErrorException, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { getConnectionToken } from "@nestjs/mongoose";
import { Connection } from "mongoose";


export const tenantConnectionProvider = {
    provide: 'TENANT_CONNECTION',
    scope: Scope.REQUEST,
    useFactory: async (request, connection: Connection) => {
        if (!request.tenantId) {
            throw new InternalServerErrorException(
                'Apply tenant middleware'
            )
        }
        return connection.useDb(`tenant_${request.tenantId}`)
        
    },
    inject: [REQUEST,getConnectionToken()],
}



















// /* eslint-disable prettier/prettier */
// /* eslint-disable @typescript-eslint/require-await */
// /* eslint-disable @typescript-eslint/no-unsafe-member-access */
// /* eslint-disable prettier/prettier */

// import { InternalServerErrorException } from "@nestjs/common";
// import { REQUEST } from "@nestjs/core";
// import { getConnectionToken } from "@nestjs/mongoose";
// import { Connection } from "mongoose";


// export const tenantConnectionProvider = {
//     provide: 'TENANT_CONNECTION',
//     useFactory: async (request, connection: Connection) => {
//         if (!request.tenantId) {
//             throw new InternalServerErrorException(
//                 'Apply tenant middleware'
//             )
//         }
//         return connection.useDb(`tenant_${request.tenantId}`)

//     },
//     inject: [REQUEST, getConnectionToken()],
// }