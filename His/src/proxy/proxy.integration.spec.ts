import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';

/**
 * 🧪 INTEGRATION TESTS для Proxy с проверкой Race Conditions
 * 
 * Эти тесты проверяют работу HTTP Proxy сервера в условиях
 * параллельных запросов и race conditions.
 */

describe('Proxy Integration Tests - Race Conditions', () => {
  let app: INestApplication;
  let connection: Connection;
  let baseUrl: string;
  let proxyUrl: string;

  const testTenantId = 'test-tenant-race-' + Date.now();
  const testToken = 'test-token-' + Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    connection = moduleFixture.get<Connection>(getConnectionToken());

    await app.init();

    baseUrl = 'http://localhost:3000';
    proxyUrl = 'http://localhost:3001';

    // Создаем тестового tenant и настраиваем лимиты
    await setupTestTenant();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function setupTestTenant() {
    // Здесь должна быть логика создания тестового tenant
    // Для упрощения используем моки или прямые операции с БД
    const limitsModel = connection.model('DataLimit');
    const usageModel = connection.model('DataUsage');
    const tenantsModel = connection.model('Tenant');

    // Создаем tenant
    await tenantsModel.create({
      tenantId: testTenantId,
      companyName: 'Test Company',
    });

    // Создаем лимиты
    await limitsModel.create({
      tenantId: testTenantId,
      maxDocuments: 100,
      maxDataSizeKB: 1024,
      monthlyQueries: 1000,
    });

    // Инициализируем usage
    await usageModel.create({
      tenantId: testTenantId,
      documentsCount: 0,
      dataSizeKB: 0,
      queriesCount: 0,
    });
  }

  async function cleanupTestData() {
    const limitsModel = connection.model('DataLimit');
    const usageModel = connection.model('DataUsage');
    const tenantsModel = connection.model('Tenant');

    await limitsModel.deleteOne({ tenantId: testTenantId });
    await usageModel.deleteOne({ tenantId: testTenantId });
    await tenantsModel.deleteOne({ tenantId: testTenantId });
  }

  describe('Concurrent Document Creation via Proxy', () => {
    /**
     * 🧪 ТЕСТ: Параллельные запросы на создание документов через Proxy
     * 
     * Проверяет, что Proxy корректно обрабатывает параллельные запросы
     * и атомарные операции предотвращают превышение лимитов.
     */
    it('should handle concurrent document creation requests correctly', async () => {
      // Arrange
      const concurrentRequests = 10;
      const limit = 100;
      const currentUsage = 95; // Осталось 5 документов

      // Устанавливаем текущее использование
      const usageModel = connection.model('DataUsage');
      await usageModel.updateOne(
        { tenantId: testTenantId },
        { documentsCount: currentUsage }
      );

      // Act - отправляем параллельные запросы через Proxy
      const requests = Array(concurrentRequests)
        .fill(0)
        .map((_, index) =>
          request(proxyUrl)
            .post('/mongo/patients')
            .set('Authorization', `Bearer ${testToken}`)
            .set('X-Tenant-ID', testTenantId)
            .send({
              operation: 'insertOne',
              document: {
                name: `Patient ${index}`,
                age: 30,
              },
            })
        );

      const responses = await Promise.allSettled(
        requests.map(req => req.then(res => ({ status: res.status, body: res.body })))
      );

      // Assert
      const successful = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 200
      ).length;
      const failed = responses.filter(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status !== 200)
      ).length;

      // Проверяем, что не все запросы прошли (лимит 100, было 95, осталось 5)
      expect(successful).toBeLessThanOrEqual(5); // Максимум 5 успешных
      expect(failed).toBeGreaterThanOrEqual(5); // Минимум 5 отклоненных

      // Проверяем финальное состояние
      const finalUsage = await usageModel.findOne({ tenantId: testTenantId });
      expect(finalUsage.documentsCount).toBeLessThanOrEqual(limit);
    }, 30000); // Увеличиваем timeout для integration теста

    /**
     * 🧪 ТЕСТ: Граничный случай - запросы на границе лимита
     */
    it('should correctly handle requests at limit boundary', async () => {
      // Arrange
      const limit = 100;
      const currentUsage = 99; // Остался 1 документ

      const usageModel = connection.model('DataUsage');
      await usageModel.updateOne(
        { tenantId: testTenantId },
        { documentsCount: currentUsage }
      );

      // Act - отправляем 2 параллельных запроса
      const request1 = request(proxyUrl)
        .post('/mongo/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Tenant-ID', testTenantId)
        .send({
          operation: 'insertOne',
          document: { name: 'Patient 1', age: 30 },
        });

      const request2 = request(proxyUrl)
        .post('/mongo/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Tenant-ID', testTenantId)
        .send({
          operation: 'insertOne',
          document: { name: 'Patient 2', age: 30 },
        });

      const [response1, response2] = await Promise.allSettled([
        request1.then(r => ({ status: r.status, body: r.body })),
        request2.then(r => ({ status: r.status, body: r.body })),
      ]);

      // Assert
      // Только один запрос должен быть успешным
      const successful = [response1, response2].filter(
        r => r.status === 'fulfilled' && r.value.status === 200
      ).length;

      expect(successful).toBe(1);

      // Проверяем финальное состояние
      const finalUsage = await usageModel.findOne({ tenantId: testTenantId });
      expect(finalUsage.documentsCount).toBeLessThanOrEqual(limit);
    }, 30000);
  });

  describe('Concurrent Data Size Operations via Proxy', () => {
    /**
     * 🧪 ТЕСТ: Параллельные запросы с большим размером данных
     */
    it('should handle concurrent data size operations correctly', async () => {
      // Arrange
      const limit = 1024; // KB
      const currentUsage = 1000; // KB, осталось 24 KB
      const dataSizePerRequest = 20; // KB

      const usageModel = connection.model('DataUsage');
      await usageModel.updateOne(
        { tenantId: testTenantId },
        { dataSizeKB: currentUsage }
      );

      // Act - отправляем параллельные запросы
      const requests = Array(5)
        .fill(0)
        .map((_, index) =>
          request(proxyUrl)
            .post('/mongo/patients')
            .set('Authorization', `Bearer ${testToken}`)
            .set('X-Tenant-ID', testTenantId)
            .send({
              operation: 'insertOne',
              document: {
                name: `Patient ${index}`,
                age: 30,
                largeData: 'x'.repeat(dataSizePerRequest * 1024), // ~20KB данных
              },
            })
        );

      const responses = await Promise.allSettled(
        requests.map(req => req.then(res => ({ status: res.status, body: res.body })))
      );

      // Assert
      // Максимум 1 запрос должен пройти (24 KB осталось, каждый запрос 20 KB)
      const successful = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 200
      ).length;

      expect(successful).toBeLessThanOrEqual(1);

      // Проверяем финальное состояние
      const finalUsage = await usageModel.findOne({ tenantId: testTenantId });
      expect(finalUsage.dataSizeKB).toBeLessThanOrEqual(limit);
    }, 30000);
  });

  describe('Concurrent Query Operations via Proxy', () => {
    /**
     * 🧪 ТЕСТ: Параллельные read запросы (queries limit)
     */
    it('should handle concurrent query operations correctly', async () => {
      // Arrange
      const limit = 1000;
      const currentUsage = 998; // Осталось 2 запроса

      const usageModel = connection.model('DataUsage');
      await usageModel.updateOne(
        { tenantId: testTenantId },
        { queriesCount: currentUsage }
      );

      // Act - отправляем параллельные read запросы
      const requests = Array(5)
        .fill(0)
        .map(() =>
          request(proxyUrl)
            .post('/mongo/patients')
            .set('Authorization', `Bearer ${testToken}`)
            .set('X-Tenant-ID', testTenantId)
            .send({
              operation: 'find',
              filter: {},
            })
        );

      const responses = await Promise.allSettled(
        requests.map(req => req.then(res => ({ status: res.status, body: res.body })))
      );

      // Assert
      // Максимум 2 запроса должны пройти
      const successful = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 200
      ).length;

      expect(successful).toBeLessThanOrEqual(2);
      expect(successful).toBeGreaterThanOrEqual(0);

      // Проверяем финальное состояние
      const finalUsage = await usageModel.findOne({ tenantId: testTenantId });
      expect(finalUsage.queriesCount).toBeLessThanOrEqual(limit);
    }, 30000);
  });

  describe('Proxy Rate Limiting', () => {
    /**
     * 🧪 ТЕСТ: Rate limiting на уровне Proxy
     */
    it('should enforce rate limiting per tenant', async () => {
      // Arrange
      const maxRequestsPerMinute = 50;
      const requestsToSend = 60; // Больше лимита

      // Act - отправляем множество запросов быстро
      const requests = Array(requestsToSend)
        .fill(0)
        .map((_, index) =>
          request(proxyUrl)
            .post('/mongo/patients')
            .set('Authorization', `Bearer ${testToken}`)
            .set('X-Tenant-ID', testTenantId)
            .send({
              operation: 'find',
              filter: {},
            })
        );

      const responses = await Promise.allSettled(
        requests.map(req => req.then(res => ({ status: res.status, body: res.body })))
      );

      // Assert
      // Некоторые запросы должны быть отклонены из-за rate limiting
      const rateLimited = responses.filter(
        r => r.status === 'fulfilled' && r.value.status === 429
      ).length;

      expect(rateLimited).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Proxy Authentication and Tenant Isolation', () => {
    /**
     * 🧪 ТЕСТ: Изоляция tenant через Proxy
     */
    it('should enforce tenant isolation', async () => {
      // Arrange
      const tenant1Id = testTenantId;
      const tenant2Id = 'another-tenant-' + Date.now();

      // Act - запрос от другого tenant
      const response = await request(proxyUrl)
        .post('/mongo/patients')
        .set('Authorization', `Bearer ${testToken}`)
        .set('X-Tenant-ID', tenant2Id)
        .send({
          operation: 'find',
          filter: {},
        });

      // Assert
      // Должна быть ошибка, так как tenant не существует или нет доступа
      expect([401, 403, 404]).toContain(response.status);
    });

    /**
     * 🧪 ТЕСТ: Проверка аутентификации через Proxy
     */
    it('should require valid authentication', async () => {
      // Act - запрос без токена
      const response = await request(proxyUrl)
        .post('/mongo/patients')
        .set('X-Tenant-ID', testTenantId)
        .send({
          operation: 'find',
          filter: {},
        });

      // Assert
      expect(response.status).toBe(401);
    });
  });
});




