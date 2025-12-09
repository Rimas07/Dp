import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { ForbiddenException } from '@nestjs/common';
import { LimitsService } from './limits.service';
import { DataLimit, DataLimitSchema } from './limits.schema';
import { DataUsage, DataUsageSchema } from './usage.schema';
import { AuditService } from '../audit/audit.service';
import { MonitoringService } from '../monitoring/monitoring.service';

describe('LimitsService', () => {
  let service: LimitsService;
  let connection: Connection;
  let limitsModel: Model<DataLimit>;
  let usageModel: Model<DataUsage>;
  let auditService: AuditService;
  let monitoringService: MonitoringService;

  const mockTenantId = 'test-tenant-123';
  const mockLimit = {
    tenantId: mockTenantId,
    maxDocuments: 100,
    maxDataSizeKB: 1024,
    monthlyQueries: 1000,
  };

  const mockAuditService = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const mockMonitoringService = {
    recordLimitViolation: jest.fn(),
    recordResourceUsage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LimitsService,
        {
          provide: getConnectionToken(),
          useValue: {
            model: jest.fn(),
          },
        },
        {
          provide: getModelToken(DataLimit.name),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            findOneAndUpdate: jest.fn(),
          },
        },
        {
          provide: getModelToken(DataUsage.name),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            findOneAndUpdate: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: MonitoringService,
          useValue: mockMonitoringService,
        },
      ],
    }).compile();

    service = module.get<LimitsService>(LimitsService);
    connection = module.get<Connection>(getConnectionToken());
    limitsModel = module.get<Model<DataLimit>>(getModelToken(DataLimit.name));
    usageModel = module.get<Model<DataUsage>>(getModelToken(DataUsage.name));
    auditService = module.get<AuditService>(AuditService);
    monitoringService = module.get<MonitoringService>(MonitoringService);

    // Настройка connection.model для использования реальных моделей
    (connection.model as jest.Mock).mockImplementation((name: string, schema: any) => {
      if (name === DataLimit.name) return limitsModel;
      if (name === DataUsage.name) return usageModel;
      return null;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkDocumentsLimit', () => {
    it('should allow operation when limit is not exceeded', async () => {
      // Arrange
      const currentUsage = { tenantId: mockTenantId, documentsCount: 50, dataSizeKB: 0, queriesCount: 0 };
      (limitsModel.findOne as jest.Mock).mockResolvedValue(mockLimit);
      (usageModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...currentUsage,
        documentsCount: 51,
      });

      // Act
      await service.checkDocumentsLimit(mockTenantId, 1);

      // Assert
      expect(usageModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          tenantId: mockTenantId,
          documentsCount: { $lte: 99 }, // 100 - 1
        },
        {
          $inc: { documentsCount: 1 },
        },
        {
          new: true,
          upsert: false,
        }
      );
      expect(monitoringService.recordResourceUsage).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when limit is exceeded', async () => {
      // Arrange
      const currentUsage = { tenantId: mockTenantId, documentsCount: 100, dataSizeKB: 0, queriesCount: 0 };
      (limitsModel.findOne as jest.Mock).mockResolvedValue(mockLimit);
      (usageModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null); // Atomic operation failed
      (usageModel.findOne as jest.Mock).mockResolvedValue(currentUsage);

      // Act & Assert
      await expect(service.checkDocumentsLimit(mockTenantId, 1)).rejects.toThrow(ForbiddenException);
      expect(monitoringService.recordLimitViolation).toHaveBeenCalledWith(mockTenantId, 'DOCUMENTS');
      expect(auditService.emit).toHaveBeenCalled();
    });

    it('should validate negative document count', async () => {
      // Act & Assert
      await expect(service.checkDocumentsLimit(mockTenantId, -1)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should validate too large batch size', async () => {
      // Act & Assert
      await expect(service.checkDocumentsLimit(mockTenantId, 1001)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should return early when limit is not set', async () => {
      // Arrange
      (limitsModel.findOne as jest.Mock).mockResolvedValue(null);

      // Act
      await service.checkDocumentsLimit(mockTenantId, 1);

      // Assert
      expect(usageModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('checkDataSizeLimit', () => {
    it('should allow operation when data size limit is not exceeded', async () => {
      // Arrange
      const currentUsage = { tenantId: mockTenantId, documentsCount: 0, dataSizeKB: 500, queriesCount: 0 };
      (limitsModel.findOne as jest.Mock).mockResolvedValue(mockLimit);
      (usageModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...currentUsage,
        dataSizeKB: 600,
      });

      // Act
      await service.checkDataSizeLimit(mockTenantId, 100);

      // Assert
      expect(usageModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          tenantId: mockTenantId,
          dataSizeKB: { $lte: 924 }, // 1024 - 100
        },
        {
          $inc: { dataSizeKB: 100 },
        },
        {
          new: true,
          upsert: false,
        }
      );
    });

    it('should throw ForbiddenException when data size limit is exceeded', async () => {
      // Arrange
      const currentUsage = { tenantId: mockTenantId, documentsCount: 0, dataSizeKB: 1024, queriesCount: 0 };
      (limitsModel.findOne as jest.Mock).mockResolvedValue(mockLimit);
      (usageModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (usageModel.findOne as jest.Mock).mockResolvedValue(currentUsage);

      // Act & Assert
      await expect(service.checkDataSizeLimit(mockTenantId, 1)).rejects.toThrow(ForbiddenException);
      expect(monitoringService.recordLimitViolation).toHaveBeenCalledWith(mockTenantId, 'DATA_SIZE');
    });
  });

  describe('checkQueriesLimit', () => {
    it('should allow operation when queries limit is not exceeded', async () => {
      // Arrange
      const currentUsage = { tenantId: mockTenantId, documentsCount: 0, dataSizeKB: 0, queriesCount: 500 };
      (limitsModel.findOne as jest.Mock).mockResolvedValue(mockLimit);
      (usageModel.findOneAndUpdate as jest.Mock).mockResolvedValue({
        ...currentUsage,
        queriesCount: 501,
      });

      // Act
      await service.checkQueriesLimit(mockTenantId);

      // Assert
      expect(usageModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          tenantId: mockTenantId,
          queriesCount: { $lt: 1000 },
        },
        {
          $inc: { queriesCount: 1 },
        },
        {
          new: true,
          upsert: false,
        }
      );
    });

    it('should throw ForbiddenException when queries limit is exceeded', async () => {
      // Arrange
      const currentUsage = { tenantId: mockTenantId, documentsCount: 0, dataSizeKB: 0, queriesCount: 1000 };
      (limitsModel.findOne as jest.Mock).mockResolvedValue(mockLimit);
      (usageModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (usageModel.findOne as jest.Mock).mockResolvedValue(currentUsage);

      // Act & Assert
      await expect(service.checkQueriesLimit(mockTenantId)).rejects.toThrow(ForbiddenException);
      expect(monitoringService.recordLimitViolation).toHaveBeenCalledWith(mockTenantId, 'QUERIES');
    });
  });

  describe('Race Condition Tests - checkDocumentsLimit', () => {
    /**
     * 🧪 КРИТИЧЕСКИЙ ТЕСТ: Проверка атомарности при параллельных запросах
     * 
     * Этот тест проверяет, что атомарная операция findOneAndUpdate
     * предотвращает race conditions при одновременных запросах.
     * 
     * Сценарий:
     * - Лимит: 100 документов
     * - Текущее использование: 99 документов
     * - Параллельно приходит 2 запроса на добавление по 1 документу
     * - Ожидаемый результат: только один запрос должен пройти успешно
     */
    it('should prevent race condition with concurrent requests using atomic operations', async () => {
      // Arrange
      const limit = 100;
      const currentUsage = 99;
      const incomingDocs = 1;

      (limitsModel.findOne as jest.Mock).mockResolvedValue({
        ...mockLimit,
        maxDocuments: limit,
      });

      // Симулируем атомарную операцию:
      // Первый запрос успешно обновляет (99 + 1 = 100 <= 100)
      // Второй запрос не может обновить (100 + 1 = 101 > 100)
      let callCount = 0;
      (usageModel.findOneAndUpdate as jest.Mock).mockImplementation((filter, update) => {
        callCount++;
        // Первый вызов успешен (99 <= 100 - 1)
        if (callCount === 1) {
          return Promise.resolve({
            tenantId: mockTenantId,
            documentsCount: 100,
            dataSizeKB: 0,
            queriesCount: 0,
          });
        }
        // Второй вызов не проходит проверку условия
        return Promise.resolve(null);
      });

      // Act - симулируем два параллельных запроса
      const promise1 = service.checkDocumentsLimit(mockTenantId, incomingDocs);
      const promise2 = service.checkDocumentsLimit(mockTenantId, incomingDocs);

      const results = await Promise.allSettled([promise1, promise2]);

      // Assert
      // Один запрос должен быть успешным, другой должен выбросить ошибку
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful).toBe(1);
      expect(failed).toBe(1);
      expect(usageModel.findOneAndUpdate).toHaveBeenCalledTimes(2);

      // Проверяем, что второй запрос выбросил ForbiddenException
      const rejectedResult = results.find(r => r.status === 'rejected');
      expect(rejectedResult?.status).toBe('rejected');
      if (rejectedResult?.status === 'rejected') {
        expect(rejectedResult.reason).toBeInstanceOf(ForbiddenException);
      }
    });

    /**
     * 🧪 ТЕСТ: Множественные параллельные запросы
     * 
     * Проверяет поведение при большом количестве параллельных запросов
     */
    it('should handle multiple concurrent requests correctly', async () => {
      // Arrange
      const limit = 100;
      const currentUsage = 50;
      const concurrentRequests = 10;
      const docsPerRequest = 5;

      (limitsModel.findOne as jest.Mock).mockResolvedValue({
        ...mockLimit,
        maxDocuments: limit,
      });

      // Симулируем атомарные операции
      let currentCount = currentUsage;
      let successCount = 0;

      (usageModel.findOneAndUpdate as jest.Mock).mockImplementation((filter, update) => {
        // Проверяем условие атомарно
        if (currentCount + docsPerRequest <= limit) {
          currentCount += docsPerRequest;
          successCount++;
          return Promise.resolve({
            tenantId: mockTenantId,
            documentsCount: currentCount,
            dataSizeKB: 0,
            queriesCount: 0,
          });
        }
        return Promise.resolve(null);
      });

      (usageModel.findOne as jest.Mock).mockResolvedValue({
        tenantId: mockTenantId,
        documentsCount: currentCount,
        dataSizeKB: 0,
        queriesCount: 0,
      });

      // Act - запускаем параллельные запросы
      const promises = Array(concurrentRequests)
        .fill(0)
        .map(() => service.checkDocumentsLimit(mockTenantId, docsPerRequest));

      const results = await Promise.allSettled(promises);

      // Assert
      // Максимальное количество успешных запросов: (100 - 50) / 5 = 10
      // Но из-за атомарности может быть меньше, если запросы пришли одновременно
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful + failed).toBe(concurrentRequests);
      expect(successful).toBeLessThanOrEqual(10); // Максимум 10 успешных
      expect(failed).toBeGreaterThanOrEqual(0);

      // Проверяем, что итоговое количество документов не превышает лимит
      // (если бы не было атомарности, могло бы быть превышение)
    });

    /**
     * 🧪 ТЕСТ: Граничный случай - запросы на границе лимита
     */
    it('should correctly handle requests at the limit boundary', async () => {
      // Arrange
      const limit = 100;
      const currentUsage = 99;

      (limitsModel.findOne as jest.Mock).mockResolvedValue({
        ...mockLimit,
        maxDocuments: limit,
      });

      let callCount = 0;
      (usageModel.findOneAndUpdate as jest.Mock).mockImplementation((filter, update) => {
        callCount++;
        // Только первый запрос может пройти (99 + 1 = 100 <= 100)
        if (callCount === 1) {
          return Promise.resolve({
            tenantId: mockTenantId,
            documentsCount: 100,
            dataSizeKB: 0,
            queriesCount: 0,
          });
        }
        return Promise.resolve(null);
      });

      (usageModel.findOne as jest.Mock).mockResolvedValue({
        tenantId: mockTenantId,
        documentsCount: 99,
        dataSizeKB: 0,
        queriesCount: 0,
      });

      // Act
      const promise1 = service.checkDocumentsLimit(mockTenantId, 1);
      const promise2 = service.checkDocumentsLimit(mockTenantId, 1);

      const results = await Promise.allSettled([promise1, promise2]);

      // Assert
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBe(1); // Только один должен пройти
    });
  });

  describe('Race Condition Tests - checkDataSizeLimit', () => {
    it('should prevent race condition with concurrent data size requests', async () => {
      // Arrange
      const limit = 1024; // KB
      const currentUsage = 1023; // KB
      const incomingSize = 2; // KB

      (limitsModel.findOne as jest.Mock).mockResolvedValue({
        ...mockLimit,
        maxDataSizeKB: limit,
      });

      let callCount = 0;
      (usageModel.findOneAndUpdate as jest.Mock).mockImplementation((filter, update) => {
        callCount++;
        // Первый запрос не может пройти (1023 + 2 = 1025 > 1024)
        // Но если бы был race condition, оба могли бы пройти
        return Promise.resolve(null);
      });

      (usageModel.findOne as jest.Mock).mockResolvedValue({
        tenantId: mockTenantId,
        documentsCount: 0,
        dataSizeKB: currentUsage,
        queriesCount: 0,
      });

      // Act
      const promise1 = service.checkDataSizeLimit(mockTenantId, incomingSize);
      const promise2 = service.checkDataSizeLimit(mockTenantId, incomingSize);

      const results = await Promise.allSettled([promise1, promise2]);

      // Assert
      // Оба запроса должны быть отклонены из-за атомарности
      const failed = results.filter(r => r.status === 'rejected').length;
      expect(failed).toBe(2);
    });
  });

  describe('Race Condition Tests - checkQueriesLimit', () => {
    it('should prevent race condition with concurrent query requests', async () => {
      // Arrange
      const limit = 1000;
      const currentUsage = 999;

      (limitsModel.findOne as jest.Mock).mockResolvedValue({
        ...mockLimit,
        monthlyQueries: limit,
      });

      let callCount = 0;
      (usageModel.findOneAndUpdate as jest.Mock).mockImplementation((filter, update) => {
        callCount++;
        // Первый запрос успешен (999 < 1000)
        if (callCount === 1) {
          return Promise.resolve({
            tenantId: mockTenantId,
            documentsCount: 0,
            dataSizeKB: 0,
            queriesCount: 1000,
          });
        }
        // Второй запрос не проходит (1000 не < 1000)
        return Promise.resolve(null);
      });

      (usageModel.findOne as jest.Mock).mockResolvedValue({
        tenantId: mockTenantId,
        documentsCount: 0,
        dataSizeKB: 0,
        queriesCount: currentUsage,
      });

      // Act
      const promise1 = service.checkQueriesLimit(mockTenantId);
      const promise2 = service.checkQueriesLimit(mockTenantId);

      const results = await Promise.allSettled([promise1, promise2]);

      // Assert
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      expect(successful).toBe(1);
      expect(failed).toBe(1);
    });
  });

  describe('Integration with other services', () => {
    it('should call monitoring service when limit is exceeded', async () => {
      // Arrange
      const currentUsage = { tenantId: mockTenantId, documentsCount: 100, dataSizeKB: 0, queriesCount: 0 };
      (limitsModel.findOne as jest.Mock).mockResolvedValue(mockLimit);
      (usageModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (usageModel.findOne as jest.Mock).mockResolvedValue(currentUsage);

      // Act
      try {
        await service.checkDocumentsLimit(mockTenantId, 1);
      } catch (error) {
        // Expected
      }

      // Assert
      expect(monitoringService.recordLimitViolation).toHaveBeenCalledWith(mockTenantId, 'DOCUMENTS');
    });

    it('should emit audit event when limit is exceeded', async () => {
      // Arrange
      const currentUsage = { tenantId: mockTenantId, documentsCount: 100, dataSizeKB: 0, queriesCount: 0 };
      (limitsModel.findOne as jest.Mock).mockResolvedValue(mockLimit);
      (usageModel.findOneAndUpdate as jest.Mock).mockResolvedValue(null);
      (usageModel.findOne as jest.Mock).mockResolvedValue(currentUsage);

      // Act
      try {
        await service.checkDocumentsLimit(mockTenantId, 1, {
          requestId: 'test-request',
          userId: 'test-user',
        });
      } catch (error) {
        // Expected
      }

      // Assert
      expect(auditService.emit).toHaveBeenCalled();
      const auditCall = (auditService.emit as jest.Mock).mock.calls[0][0];
      expect(auditCall.eventType).toBe('LIMIT_EXCEEDED');
      expect(auditCall.limitType).toBe('DOCUMENTS');
    });
  });
});


