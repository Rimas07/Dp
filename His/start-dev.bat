@echo off
SET RABBITMQ_URL=amqp://hisapp:hisapp123@localhost:5672
SET PORT=3000
SET DB_CONNECTION_STRING=mongodb://127.0.0.1:27017/master
SET ENCRYPTION_KEY=encryption_key

echo Starting HIS Application with correct environment variables...
echo RABBITMQ_URL=%RABBITMQ_URL%
echo PORT=%PORT%
echo.

npm run start:dev
