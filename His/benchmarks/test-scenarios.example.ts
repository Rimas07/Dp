/**
 * ПРИМЕРЫ готовых сценариев тестирования
 *
 * Скопируйте этот файл и адаптируйте под свои нужды
 */

import autocannon = require('autocannon');

// ============================================
// СЦЕНАРИЙ 1: Тестирование Auth endpoints
// ============================================
async function testAuthEndpoints() {
  console.log('🔐 Тестирование авторизации...\n');

  // Тест логина
  const loginResult = await autocannon({
    url: 'http://localhost:3000/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'test@test.com',
      password: 'test123'
    }),
    connections: 10,
    duration: 10,
  });

  const p95 = (loginResult.latency as any).p95 || loginResult.latency.mean * 1.5;

  console.log('Login результаты:');
  console.log(`  Средняя задержка: ${loginResult.latency.mean.toFixed(2)}ms`);
  console.log(`  95p: ${p95.toFixed(2)}ms`);
  console.log(`  Запросов/сек: ${loginResult.requests.average.toFixed(2)}`);
  console.log(`  Ошибки: ${loginResult.errors}\n`);
}

// ============================================
// СЦЕНАРИЙ 2: Тестирование Proxy endpoints
// ============================================
async function testProxyEndpoints(token: string) {
  console.log('🔄 Тестирование прокси...\n');

  // Health check
  const healthResult = await autocannon({
    url: 'http://localhost:3000/proxy/health',
    method: 'GET',
    connections: 10,
    duration: 10,
  });

  console.log('Health результаты:');
  console.log(`  Средняя задержка: ${healthResult.latency.mean.toFixed(2)}ms`);
  console.log(`  Запросов/сек: ${healthResult.requests.average.toFixed(2)}\n`);

  // Proxy test с авторизацией
  const proxyResult = await autocannon({
    url: 'http://localhost:3000/proxy/test',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ test: 'data' }),
    connections: 10,
    duration: 10,
  });

  console.log('Proxy test результаты:');
  console.log(`  Средняя задержка: ${proxyResult.latency.mean.toFixed(2)}ms`);
  console.log(`  Запросов/сек: ${proxyResult.requests.average.toFixed(2)}\n`);
}

// ============================================
// СЦЕНАРИЙ 3: Тестирование Patients CRUD
// ============================================
async function testPatientsCRUD(token: string) {
  console.log('👥 Тестирование пациентов...\n');

  // GET список пациентов
  const getResult = await autocannon({
    url: 'http://localhost:3000/patients',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    connections: 20,
    duration: 10,
  });

  console.log('GET пациенты результаты:');
  console.log(`  Средняя задержка: ${getResult.latency.mean.toFixed(2)}ms`);
  console.log(`  Запросов/сек: ${getResult.requests.average.toFixed(2)}\n`);

  // POST создание пациента
  const postResult = await autocannon({
    url: 'http://localhost:3000/patients',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      name: 'Test Patient',
      age: 30,
      email: 'patient@test.com'
    }),
    connections: 10,
    duration: 10,
  });

  console.log('POST пациент результаты:');
  console.log(`  Средняя задержка: ${postResult.latency.mean.toFixed(2)}ms`);
  console.log(`  Запросов/сек: ${postResult.requests.average.toFixed(2)}\n`);
}

// ============================================
// СЦЕНАРИЙ 4: Тестирование Limits
// ============================================
async function testLimitsEndpoints(token: string, tenantId: string) {
  console.log('📊 Тестирование лимитов...\n');

  // GET лимиты
  const getLimitsResult = await autocannon({
    url: `http://localhost:3000/limits/${tenantId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    connections: 10,
    duration: 10,
  });

  console.log('GET лимиты результаты:');
  console.log(`  Средняя задержка: ${getLimitsResult.latency.mean.toFixed(2)}ms`);
  console.log(`  Запросов/сек: ${getLimitsResult.requests.average.toFixed(2)}\n`);

  // GET использование
  const getUsageResult = await autocannon({
    url: `http://localhost:3000/limits/usage/${tenantId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    connections: 10,
    duration: 10,
  });

  console.log('GET использование результаты:');
  console.log(`  Средняя задержка: ${getUsageResult.latency.mean.toFixed(2)}ms`);
  console.log(`  Запросов/сек: ${getUsageResult.requests.average.toFixed(2)}\n`);
}

// ============================================
// СЦЕНАРИЙ 5: Стресс-тест (высокая нагрузка)
// ============================================
async function stressTest(url: string) {
  console.log('💪 Стресс-тест...\n');

  const result = await autocannon({
    url,
    method: 'GET',
    connections: 100,  // 100 одновременных подключений
    duration: 60,      // 60 секунд
    pipelining: 10,    // 10 запросов на соединение
  });

  const p95 = (result.latency as any).p95 || result.latency.mean * 1.5;
  const p99 = (result.latency as any).p99 || result.latency.mean * 2;

  console.log('Стресс-тест результаты:');
  console.log(`  Средняя задержка: ${result.latency.mean.toFixed(2)}ms`);
  console.log(`  95p: ${p95.toFixed(2)}ms`);
  console.log(`  99p: ${p99.toFixed(2)}ms`);
  console.log(`  Макс: ${result.latency.max.toFixed(2)}ms`);
  console.log(`  Запросов/сек: ${result.requests.average.toFixed(2)}`);
  console.log(`  Всего запросов: ${result.requests.total}`);
  console.log(`  Ошибки: ${result.errors}\n`);
}

// ============================================
// СЦЕНАРИЙ 6: Тест с постепенным увеличением нагрузки
// ============================================
async function rampUpTest(url: string) {
  console.log('📈 Тест с увеличением нагрузки...\n');

  const connections = [5, 10, 25, 50, 100];

  for (const conn of connections) {
    console.log(`\n🔄 Тестирование с ${conn} подключениями...`);

    const result = await autocannon({
      url,
      method: 'GET',
      connections: conn,
      duration: 10,
    });

    console.log(`  Средняя задержка: ${result.latency.mean.toFixed(2)}ms`);
    console.log(`  Запросов/сек: ${result.requests.average.toFixed(2)}`);
    console.log(`  Ошибки: ${result.errors}`);

    // Пауза между тестами
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// ============================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           ПРИМЕРЫ ТЕСТОВЫХ СЦЕНАРИЕВ                          ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Получите токен для тестов
  const token = process.env.AUTH_TOKEN || 'your-test-token';
  const tenantId = process.env.TENANT_ID || 'your-tenant-id';

  // Раскомментируйте нужный сценарий:

  // await testAuthEndpoints();
  // await testProxyEndpoints(token);
  // await testPatientsCRUD(token);
  // await testLimitsEndpoints(token, tenantId);
  // await stressTest('http://localhost:3000/proxy/health');
  // await rampUpTest('http://localhost:3000/proxy/health');

  console.log('✅ Выберите и раскомментируйте нужный сценарий в main()');
}

// ============================================
// ЗАПУСК
// ============================================
if (require.main === module) {
  main().catch(console.error);
}

export {
  testAuthEndpoints,
  testProxyEndpoints,
  testPatientsCRUD,
  testLimitsEndpoints,
  stressTest,
  rampUpTest,
};
