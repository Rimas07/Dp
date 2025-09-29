/* eslint-disable prettier/prettier */

export default () => ({
    server: {
        port: process.env.PORT || 3000,
        
    },
    database: {
        connectionString: process.env.DB_CONNECTION_STRING || 'mongodb://host.docker.internal:27017/master',
    },
    security: {
        encryptionSecretKey: process.env.ENCRYPTION_KEY,
    },
});