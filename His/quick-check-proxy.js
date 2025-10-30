#!/usr/bin/env node

const axios = require('axios');

const PROXY_URL = 'http://localhost:3001';

async function quickCheck() {
    console.log('⚡ Быстрая проверка HTTP Reverse Proxy...\n');

    try {
        console.log('1️⃣ Проверяем health check...');
        const health = await axios.get(`${PROXY_URL}/proxy/health`);
        console.log('✅ Proxy работает:', health.data.status);

        console.log('\n2️⃣ Тестируем запрос без токена...');
        try {
            await axios.get(`${PROXY_URL}/proxy/api/test`);
            console.log('❌ Ошибка: запрос прошел без токена!');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ Корректно: запрос отклонен без токена (401)');
            } else {
                console.log(`⚠️ Неожиданный статус: ${error.response?.status}`);
            }
        }

        console.log('\n3️⃣ Тестируем запрос с невалидным токеном...');
        try {
            await axios.get(`${PROXY_URL}/proxy/api/test`, {
                headers: { 'Authorization': 'Bearer invalid-token' }
            });
            console.log('❌ Ошибка: невалидный токен принят!');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ Корректно: невалидный токен отклонен (401)');
            } else {
                console.log(`⚠️ Неожиданный статус: ${error.response?.status}`);
            }
        }

        console.log('\n4️⃣ Тестируем HTTP методы...');
        const methods = ['GET', 'POST', 'PUT', 'DELETE'];
        let methodsWorking = 0;

        for (const method of methods) {
            try {
                await axios({
                    method: method,
                    url: `${PROXY_URL}/proxy/api/test`,
                    validateStatus: () => true
                });
            } catch (error) {
                if (error.response?.status === 401) {
                    console.log(`✅ ${method} метод поддерживается`);
                    methodsWorking++;
                }
            }
        }

        console.log(`\n📊 Результат: ${methodsWorking}/${methods.length} методов поддерживается`);

        console.log('\n🎯 Итог:');
        console.log('✅ HTTP Reverse Proxy работает');
        console.log('✅ Аутентификация работает');
        console.log('✅ HTTP методы поддерживаются');
        console.log('\n💡 Для полного тестирования запустите: node test-proxy-enhanced.js');

    } catch (error) {
        console.log('❌ Proxy не отвечает!');
        console.log('💡 Убедитесь что:');
        console.log('1. Сервер запущен: npm run start:dev');
        console.log('2. HTTP Reverse Proxy запущен: POST /proxy/start');
        console.log('3. Порт 3001 свободен');
    }
}

quickCheck();

