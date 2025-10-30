/**
 * 🧪 Простой скрипт для тестирования HTTP Proxy
 * 
 * Использование:
 * 1. Запустите основной сервер: npm run start:dev
 * 2. Запустите этот скрипт: node test-proxy-simple.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const PROXY_URL = 'http://localhost:3001';

// Функция для красивого вывода
function log(step, message, isError = false) {
    const emoji = isError ? '❌' : '✅';
    const prefix = step ? `${step}. ` : '';
    console.log(`${emoji} ${prefix}${message}`);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testProxy() {
    console.log('\n🚀 ============================================');
    console.log('   ТЕСТИРОВАНИЕ HTTP PROXY');
    console.log('============================================\n');

    try {
        // ШАГ 1: Проверяем основной сервер
        log(1, 'Проверяем основной сервер (порт 3000)...');
        try {
            const health1 = await axios.get(`${BASE_URL}/proxy/health`, { timeout: 5000 });
            log(null, `Основной сервер работает: ${health1.data.status}`, false);
        } catch (error) {
            log(null, 'Основной сервер НЕ работает!', true);
            console.log('\n💡 Убедитесь что сервер запущен: npm run start:dev\n');
            return;
        }

        // ШАГ 2: Запускаем HTTP Proxy
        log(2, 'Запускаем HTTP Proxy сервер...');
        try {
            const start = await axios.post(`${BASE_URL}/proxy/start`, {}, { timeout: 5000 });
            log(null, `HTTP Proxy запущен: ${start.data.message}`, false);
            console.log('   📡 Endpoints:', JSON.stringify(start.data.endpoints, null, 2));
        } catch (error) {
            log(null, `Не удалось запустить HTTP Proxy: ${error.message}`, true);
            return;
        }

        // Ждем запуска
        log(null, 'Ждем 2 секунды для полного запуска...');
        await sleep(2000);

        // ШАГ 3: Проверяем HTTP Proxy
        log(3, 'Проверяем HTTP Proxy сервер (порт 3001)...');
        try {
            const health2 = await axios.get(`${PROXY_URL}/proxy/health`, { timeout: 5000 });
            log(null, `HTTP Proxy работает: ${health2.data.status}`, false);
        } catch (error) {
            log(null, `HTTP Proxy НЕ работает: ${error.message}`, true);
            console.log('\n💡 Проверьте что порт 3001 свободен\n');
            return;
        }

        // ШАГ 4: Тестируем MongoDB запрос через Proxy
        log(4, 'Тестируем MongoDB запрос через Proxy...');
        try {
            const mongoRequest = {
                operation: 'find',
                filter: { name: 'Test Patient' },
                limit: 10
            };

            const mongo = await axios.post(
                `${PROXY_URL}/mongo/patients`,
                mongoRequest,
                {
                    headers: {
                        'Authorization': 'Bearer valid-token',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            log(null, `MongoDB запрос успешен!`, false);
            console.log('   📊 Операция:', mongo.data.operation);
            console.log('   🏢 TenantId:', mongo.data.tenantId || 'N/A');
            console.log('   📦 Документов:', Array.isArray(mongo.data.data) ? mongo.data.data.length : 1);
        } catch (error) {
            if (error.response) {
                log(null, `MongoDB запрос вернул ошибку: ${error.response.status}`, true);
                console.log('   📋 Детали:', JSON.stringify(error.response.data, null, 2));
                
                // Это ожидаемо для теста, так как может не быть реальных данных
                if (error.response.status === 401) {
                    console.log('\n   💡 Подсказка: Проверьте токен авторизации');
                } else if (error.response.status === 403) {
                    console.log('\n   💡 Подсказка: Проверьте tenantId');
                } else if (error.response.status === 429) {
                    console.log('\n   💡 Подсказка: Превышены лимиты данных');
                }
            } else {
                log(null, `MongoDB запрос не выполнен: ${error.message}`, true);
            }
        }

        // ШАГ 5: Тестируем старый API
        log(5, 'Тестируем старый API (совместимость)...');
        try {
            const oldApi = await axios.post(
                `${BASE_URL}/proxy/test`,
                {},
                {
                    headers: {
                        'X-Tenant-ID': 'tenant123',
                        'Authorization': 'Bearer valid-token'
                    },
                    timeout: 5000
                }
            );

            log(null, `Старый API работает: ${oldApi.data.message}`, false);
        } catch (error) {
            if (error.response) {
                log(null, `Старый API вернул ошибку: ${error.response.status}`, true);
                console.log('   📋 Детали:', JSON.stringify(error.response.data, null, 2));
            } else {
                log(null, `Старый API не ответил: ${error.message}`, true);
            }
        }

        // ИТОГИ
        console.log('\n============================================');
        console.log('✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО');
        console.log('============================================\n');

        console.log('📋 Что проверить вручную:');
        console.log('   1. Откройте: http://localhost:3001/proxy/health');
        console.log('   2. Посмотрите логи в терминале где запущен сервер');
        console.log('   3. Попробуйте запрос через Postman или curl');
        console.log('\n📚 Подробная инструкция: HOW_TO_RUN_PROXY.md\n');

    } catch (error) {
        console.log('\n============================================');
        console.log('❌ КРИТИЧЕСКАЯ ОШИБКА');
        console.log('============================================\n');
        console.error('Ошибка:', error.message);
        console.log('\n💡 Убедитесь что:');
        console.log('   1. Основной сервер запущен: npm run start:dev');
        console.log('   2. Установлены зависимости: npm install');
        console.log('   3. MongoDB подключена');
        console.log('   4. Порты 3000 и 3001 свободны\n');
    }
}

// Запускаем тест
if (require.main === module) {
    testProxy();
}

module.exports = { testProxy };

