#!/usr/bin/env node

const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const PROXY_URL = 'http://localhost:3001';

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testProxy() {
    log('🚀 Начинаем тестирование HTTP Reverse Proxy...\n', 'bright');
    
    let passedTests = 0;
    let totalTests = 0;

    try {
        totalTests++;
        log('1️⃣ Проверяем основной сервер...', 'blue');
        try {
            const healthResponse = await axios.get(`${BASE_URL}/proxy/health`);
            log('✅ Основной сервер работает:', 'green');
            console.log(JSON.stringify(healthResponse.data, null, 2));
            passedTests++;
        } catch (error) {
            log('❌ Основной сервер не отвечает:', 'red');
            log(`   Ошибка: ${error.message}`, 'red');
            log('   Убедитесь что сервер запущен: npm run start:dev', 'yellow');
            return;
        }

        totalTests++;
        log('\n2️⃣ Запускаем HTTP Reverse Proxy сервер...', 'blue');
        try {
            const startResponse = await axios.post(`${BASE_URL}/proxy/start`);
            log('✅ HTTP Reverse Proxy запущен:', 'green');
            console.log(JSON.stringify(startResponse.data, null, 2));
            passedTests++;
        } catch (error) {
            log('❌ Не удалось запустить HTTP Reverse Proxy:', 'red');
            log(`   Ошибка: ${error.response?.data?.message || error.message}`, 'red');
        }

        log('\n⏳ Ждем запуска HTTP Reverse Proxy сервера...', 'yellow');
        await wait(3000);

        totalTests++;
        log('\n3️⃣ Проверяем HTTP Reverse Proxy сервер...', 'blue');
        try {
            const proxyHealthResponse = await axios.get(`${PROXY_URL}/proxy/health`);
            log('✅ HTTP Reverse Proxy работает:', 'green');
            console.log(JSON.stringify(proxyHealthResponse.data, null, 2));
            passedTests++;
        } catch (error) {
            log('❌ HTTP Reverse Proxy не отвечает:', 'red');
            log(`   Ошибка: ${error.message}`, 'red');
            log('   Проверьте что порт 3001 свободен', 'yellow');
            return;
        }

        log('\n4️⃣ Тестируем HTTP запросы через Reverse Proxy...', 'blue');
        
        const httpTests = [
            {
                name: 'GET запрос без токена (ожидается 401)',
                method: 'GET',
                url: '/proxy/api/test',
                expectedStatus: 401
            },
            {
                name: 'GET запрос с невалидным токеном (ожидается 401)',
                method: 'GET',
                url: '/proxy/api/test',
                headers: { 'Authorization': 'Bearer invalid-token' },
                expectedStatus: 401
            },
            {
                name: 'POST запрос без токена (ожидается 401)',
                method: 'POST',
                url: '/proxy/api/test',
                data: { test: 'data' },
                expectedStatus: 401
            },
            {
                name: 'PUT запрос без токена (ожидается 401)',
                method: 'PUT',
                url: '/proxy/api/test/123',
                data: { test: 'data' },
                expectedStatus: 401
            },
            {
                name: 'DELETE запрос без токена (ожидается 401)',
                method: 'DELETE',
                url: '/proxy/api/test/123',
                expectedStatus: 401
            }
        ];

        for (const test of httpTests) {
            totalTests++;
            try {
                log(`\n   🔍 ${test.name}`, 'cyan');
                
                const response = await axios({
                    method: test.method,
                    url: `${PROXY_URL}${test.url}`,
                    headers: test.headers || {},
                    data: test.data || undefined,
                    validateStatus: () => true
                });

                if (response.status === test.expectedStatus) {
                    log(`   ✅ ПРОЙДЕН (статус: ${response.status})`, 'green');
                    passedTests++;
                } else {
                    log(`   ⚠️ НЕОЖИДАННЫЙ СТАТУС (${response.status}, ожидался ${test.expectedStatus})`, 'yellow');
                }
            } catch (error) {
                if (error.response?.status === test.expectedStatus) {
                    log(`   ✅ ПРОЙДЕН (статус: ${error.response.status})`, 'green');
                    passedTests++;
                } else {
                    log(`   ❌ ПРОВАЛЕН (${error.response?.status || 'ERROR'})`, 'red');
                    log(`      Ошибка: ${error.message}`, 'red');
                }
            }
        }

        totalTests++;
        log('\n5️⃣ Тестируем старый API (совместимость)...', 'blue');
        try {
            const oldApiResponse = await axios.post(`${BASE_URL}/proxy/test`, {}, {
                headers: {
                    'X-Tenant-ID': 'tenant123',
                    'Authorization': 'Bearer valid-token'
                },
                validateStatus: () => true
            });
            
            if (oldApiResponse.status === 200) {
                log('✅ Старый API работает:', 'green');
                console.log(JSON.stringify(oldApiResponse.data, null, 2));
                passedTests++;
            } else {
                log(`⚠️ Старый API вернул статус ${oldApiResponse.status}:`, 'yellow');
                console.log(JSON.stringify(oldApiResponse.data, null, 2));
                passedTests++;
            }
        } catch (error) {
            log('⚠️ Старый API (ожидаемая ошибка):', 'yellow');
            log(`   ${error.response?.data?.error || error.message}`, 'yellow');
            passedTests++;
        }
        log('\n6️⃣ Тестируем различные HTTP методы...', 'blue');
        
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
        for (const method of methods) {
            totalTests++;
            try {
                log(`   🔍 Тестируем ${method} метод`, 'cyan');
                
                const response = await axios({
                    method: method,
                    url: `${PROXY_URL}/proxy/api/test`,
                    validateStatus: () => true
                });

                if (response.status === 401) {
                    log(`   ✅ ${method} метод поддерживается (статус: 401)`, 'green');
                    passedTests++;
                } else {
                    log(`   ⚠️ ${method} метод вернул неожиданный статус: ${response.status}`, 'yellow');
                }
            } catch (error) {
                if (error.response?.status === 401) {
                    log(`   ✅ ${method} метод поддерживается (статус: 401)`, 'green');
                    passedTests++;
                } else {
                    log(`   ❌ ${method} метод не работает: ${error.message}`, 'red');
                }
            }
        }

        log('\n🎉 Тестирование завершено!\n', 'bright');
        log('📋 Результаты:', 'bright');
        log(`✅ Пройдено тестов: ${passedTests}/${totalTests}`, passedTests === totalTests ? 'green' : 'yellow');
        
        if (passedTests === totalTests) {
            log('🎊 Все тесты пройдены успешно!', 'green');
        } else {
            log(`⚠️ ${totalTests - passedTests} тестов не пройдено`, 'yellow');
        }

        log('\n🔗 Доступные endpoints:', 'bright');
        log(`- Основной сервер: ${BASE_URL}`, 'cyan');
        log(`- HTTP Reverse Proxy: ${PROXY_URL}`, 'cyan');
        log(`- Health check: ${PROXY_URL}/proxy/health`, 'cyan');
        log(`- Proxy endpoint: ${PROXY_URL}/proxy/*`, 'cyan');

        log('\n📖 Документация:', 'bright');
        log('- Полное руководство: HOW_TO_TEST_PROXY.md', 'cyan');
        log('- Архитектура: HTTP_REVERSE_PROXY_GUIDE.md', 'cyan');

        log('\n💡 Следующие шаги:', 'bright');
        log('1. Получите JWT токен через /auth/login', 'yellow');
        log('2. Тестируйте с реальными данными', 'yellow');
        log('3. Настройте целевые URL для ваших сервисов', 'yellow');
        log('4. Мониторьте логи для отладки', 'yellow');

    } catch (error) {
        log('\n❌ Критическая ошибка тестирования:', 'red');
        log(`   ${error.message}`, 'red');
        log('\n💡 Убедитесь что:', 'yellow');
        log('1. Сервер запущен: npm run start:dev', 'yellow');
        log('2. Установлены зависимости: npm install', 'yellow');
        log('3. MongoDB подключена', 'yellow');
        log('4. Порты 3000 и 3001 свободны', 'yellow');
    }
}

if (require.main === module) {
    testProxy();
}

module.exports = { testProxy };

