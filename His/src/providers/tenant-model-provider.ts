import { Scope } from '@nestjs/common';
import { Connection } from 'mongoose';
import { Patient, PatientSchema } from 'src/patients/patient.schema';

export const tenantModels = {
    PatientModel: {
        provide: 'PATIENT_MODEL',
        scope: Scope.REQUEST,
        useFactory: async (tenantConnection: Connection) => {
            return tenantConnection.model(
                Patient.name,
                PatientSchema
      )
    
        },
        inject: ["TENANT_CONNECTION"]
    },
};

// PatientModule: {
//     provide: 'PATIENT_MODEL',
//         useFactory: async (request, connection: Connection) => {

//             if (!request.tenantId) {
//                 throw new InternalServerErrorException(
//                     'make sure apply middle'
//                 );
//             }
//             return connection.useDb(`Patient_${request.tenantId}`);
//         },
//             inject: [REQUEST, getConnectionToken()]
// },
// };

// if (!request) {
//     throw new InternalServerErrorException(
//         'Request object is undefined - make sure provider is request-scoped'
//     );
// }

//     useFactory: async (tenantConnection: Connection) => {
//       return tenantConnection.model(Patient.name, PatientSchema);
//     },
//     inject: ['TENANT_CONNECTION'],
//   },
// };

// scope: Scope.REQUEST, // ✅ ADD THIS - Makes provider request-scoped
// useFactory: async (request, connection: Connection) => {
//     // ✅ ADD NULL CHECK - Check if request exists first
//     if (!request) {
//         throw new InternalServerErrorException(
//             'Request object is undefined - make sure provider is request-scoped'
//         );
//     }

//     if (!request.tenantId) {
//         throw new InternalServerErrorException(
//             'make sure apply middle'
//         );
//     }
//     return connection.useDb(`Patient_${request.tenantId}`);
// },
// inject: [REQUEST, getConnectionToken()]
// import { Inject, InternalServerErrorException, Scope } from '@nestjs/common';
// import { REQUEST } from '@nestjs/core';
// import { getConnectionToken } from '@nestjs/mongoose';
// import { PatientsModule } from 'src/patients/patients.module';