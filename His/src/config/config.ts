/* eslint-disable prettier/prettier */

export default () => {
    console.log('[Config] DEBUG - process.env.RABBITMQ_URL:', process.env.RABBITMQ_URL);
    console.log('[Config] DEBUG - All RabbitMQ env vars:', Object.keys(process.env).filter(k => k.includes('RABBIT')));

    const config = {
        server: {
            port: process.env.PORT || 3000,

        },
        database: {
            connectionString: process.env.DB_CONNECTION_STRING || 'mongodb://host.docker.internal:27017/master',
        },
        security: {
            encryptionSecretKey: process.env.ENCRYPTION_KEY,
            jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
        },
        rabbitmq: {
            url: process.env.RABBITMQ_URL || 'amqp://hisapp:hisapp123@localhost:5672',
            queue: process.env.RABBITMQ_QUEUE || 'audit-queue',
        },
    };

    console.log('[Config] Loading configuration:', {
        rabbitmq: config.rabbitmq,
        database: config.database.connectionString,
        port: config.server.port,
    });

    return config;
};