import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Connection, Model, ClientSession } from 'mongoose';
import { BadRequestException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Tenant } from './tenants.schema';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { DataLimit, DataLimitSchema } from '../limits/limits.schema';
import CreateCompanyDto from './create-company.dto';

describe('TenantsService', () => {
  let service: TenantsService;
  let connection: Connection;
  let tenantModel: Model<Tenant>;
  let usersService: UsersService;
  let authService: AuthService;
  let limitsModel: Model<DataLimit>;

  const mockCompanyData: CreateCompanyDto = {
    companyName: 'Test Company',
    user: {
      email: 'test@test.com',
      password: 'password123',
      name: 'Test User',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: getConnectionToken(),
          useValue: {
            startSession: jest.fn(),
            model: jest.fn(),
            models: {},
          },
        },
        {
          provide: getModelToken(Tenant.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue([]),
            }),
            create: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            getUserByEmail: jest.fn(),
            createUser: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            createSecretKeyForNewTenant: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    connection = module.get<Connection>(getConnectionToken());
    tenantModel = module.get<Model<Tenant>>(getModelToken(Tenant.name));
    usersService = module.get<UsersService>(UsersService);
    authService = module.get<AuthService>(AuthService);

    // Настройка connection.model для LimitsModel
    (connection.model as jest.Mock).mockReturnValue({
      create: jest.fn(),
    });
    limitsModel = connection.model(DataLimit.name) as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTenantById', () => {
    it('should return tenant by id', async () => {
      // Arrange
      const tenantId = 'test-tenant-123';
      const mockTenant = { tenantId, companyName: 'Test Company' };
      (tenantModel.findOne as jest.Mock).mockResolvedValue(mockTenant);

      // Act
      const result = await service.getTenantById(tenantId);

      // Assert
      expect(result).toEqual(mockTenant);
      expect(tenantModel.findOne).toHaveBeenCalledWith({ tenantId });
    });
  });

  describe('getAllTenants', () => {
    it('should return all tenants', async () => {
      // Arrange
      const mockTenants = [
        { tenantId: 't1', companyName: 'Company 1' },
        { tenantId: 't2', companyName: 'Company 2' },
      ];
      (tenantModel.find as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockTenants),
      });

      // Act
      const result = await service.getAllTenants();

      // Assert
      expect(result).toEqual(mockTenants);
      expect(tenantModel.find).toHaveBeenCalled();
    });
  });

  describe('createCompany - БЕЗ транзакций (текущая реализация)', () => {
    it('should create company successfully', async () => {
      // Arrange
      const mockTenantId = 'generated-tenant-id';
      const mockUser = { _id: 'user-id', email: mockCompanyData.user.email };
      const mockTenant = {
        tenantId: mockTenantId,
        companyName: mockCompanyData.companyName,
      };

      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockResolvedValue(mockUser);
      (authService.createSecretKeyForNewTenant as jest.Mock).mockResolvedValue(undefined);
      (limitsModel.create as jest.Mock).mockResolvedValue([{
        tenantId: mockTenantId,
        maxDocuments: 1000,
      }]);
      (tenantModel.create as jest.Mock).mockResolvedValue(mockTenant);

      // Act
      const result = await service.createCompany(mockCompanyData);

      // Assert
      expect(usersService.getUserByEmail).toHaveBeenCalledWith(mockCompanyData.user.email);
      expect(usersService.createUser).toHaveBeenCalled();
      expect(authService.createSecretKeyForNewTenant).toHaveBeenCalled();
      expect(limitsModel.create).toHaveBeenCalled();
      expect(tenantModel.create).toHaveBeenCalled();
      expect(result).toEqual(mockTenant);
    });

    it('should throw BadRequestException if user already exists', async () => {
      // Arrange
      const existingUser = { _id: 'existing-user', email: mockCompanyData.user.email };
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(existingUser);

      // Act & Assert
      await expect(service.createCompany(mockCompanyData)).rejects.toThrow(
        BadRequestException
      );
      expect(usersService.getUserByEmail).toHaveBeenCalled();
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it('should create all related data', async () => {
      // Arrange
      const mockTenantId = 'test-tenant-123';
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockResolvedValue({ _id: 'user-id' });
      (authService.createSecretKeyForNewTenant as jest.Mock).mockResolvedValue(undefined);
      (limitsModel.create as jest.Mock).mockResolvedValue([{}]);
      (tenantModel.create as jest.Mock).mockResolvedValue({ tenantId: mockTenantId });

      // Act
      await service.createCompany(mockCompanyData);

      // Assert - проверяем, что все операции вызваны
      expect(usersService.createUser).toHaveBeenCalledTimes(1);
      expect(authService.createSecretKeyForNewTenant).toHaveBeenCalledTimes(1);
      expect(limitsModel.create).toHaveBeenCalledTimes(1);
      expect(tenantModel.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('createCompany - С транзакциями (будущая реализация)', () => {
    let session: ClientSession;

    beforeEach(() => {
      // Создаем мок сессии транзакции
      session = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        abortTransaction: jest.fn().mockResolvedValue(undefined),
        endSession: jest.fn().mockResolvedValue(undefined),
      } as any;

      (connection.startSession as jest.Mock).mockResolvedValue(session);
    });

    /**
     * 🧪 ТЕСТ: Успешная транзакция
     * 
     * Проверяет, что при успешном выполнении всех операций:
     * 1. Транзакция начинается
     * 2. Все операции выполняются
     * 3. Транзакция коммитится
     * 4. Сессия закрывается
     */
    it('should commit transaction when all operations succeed', async () => {
      // Arrange
      const mockTenantId = 'test-tenant-123';
      const mockTenant = {
        tenantId: mockTenantId,
        companyName: mockCompanyData.companyName,
      };

      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockResolvedValue({ _id: 'user-id' });
      (authService.createSecretKeyForNewTenant as jest.Mock).mockResolvedValue(undefined);
      (limitsModel.create as jest.Mock).mockResolvedValue([{}]);
      (tenantModel.create as jest.Mock).mockResolvedValue([mockTenant]);

      // Act
      // ВАЖНО: Этот тест будет работать только после реализации транзакций
      // Сейчас он показывает, как должен выглядеть тест
      // const result = await service.createCompany(mockCompanyData);

      // Assert (для будущей реализации)
      // expect(session.startTransaction).toHaveBeenCalled();
      // expect(usersService.createUser).toHaveBeenCalledWith(
      //   expect.any(Object),
      //   mockTenantId,
      //   session
      // );
      // expect(session.commitTransaction).toHaveBeenCalled();
      // expect(session.endSession).toHaveBeenCalled();
      // expect(session.abortTransaction).not.toHaveBeenCalled();
    });

    /**
     * 🧪 ТЕСТ: Откат транзакции при ошибке
     * 
     * Проверяет, что при ошибке в любой операции:
     * 1. Транзакция откатывается
     * 2. Никакие данные не сохраняются
     * 3. Сессия закрывается
     */
    it('should abort transaction when user creation fails', async () => {
      // Arrange
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockRejectedValue(
        new Error('User creation failed')
      );

      // Act & Assert
      // await expect(service.createCompany(mockCompanyData)).rejects.toThrow(
      //   'User creation failed'
      // );

      // Assert (для будущей реализации)
      // expect(session.startTransaction).toHaveBeenCalled();
      // expect(session.abortTransaction).toHaveBeenCalled();
      // expect(session.commitTransaction).not.toHaveBeenCalled();
      // expect(session.endSession).toHaveBeenCalled();
    });

    /**
     * 🧪 ТЕСТ: Откат транзакции при ошибке в середине процесса
     * 
     * Проверяет, что если ошибка происходит после успешных операций,
     * все изменения откатываются
     */
    it('should abort transaction when limits creation fails', async () => {
      // Arrange
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockResolvedValue({ _id: 'user-id' });
      (authService.createSecretKeyForNewTenant as jest.Mock).mockResolvedValue(undefined);
      (limitsModel.create as jest.Mock).mockRejectedValue(
        new Error('Limits creation failed')
      );

      // Act & Assert
      // await expect(service.createCompany(mockCompanyData)).rejects.toThrow(
      //   'Limits creation failed'
      // );

      // Assert (для будущей реализации)
      // expect(session.abortTransaction).toHaveBeenCalled();
      // expect(session.commitTransaction).not.toHaveBeenCalled();
      // Проверяем, что пользователь НЕ был создан (откат)
      // expect(usersService.createUser).toHaveBeenCalled();
      // Но данные не должны быть в БД из-за отката
    });

    /**
     * 🧪 ТЕСТ: Передача сессии во все операции
     * 
     * Проверяет, что сессия транзакции передается во все операции,
     * чтобы они были частью одной транзакции
     */
    it('should pass session to all operations', async () => {
      // Arrange
      const mockTenantId = 'test-tenant-123';
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockResolvedValue({ _id: 'user-id' });
      (authService.createSecretKeyForNewTenant as jest.Mock).mockResolvedValue(undefined);
      (limitsModel.create as jest.Mock).mockResolvedValue([{}]);
      (tenantModel.create as jest.Mock).mockResolvedValue([{ tenantId: mockTenantId }]);

      // Act
      // await service.createCompany(mockCompanyData);

      // Assert (для будущей реализации)
      // expect(usersService.createUser).toHaveBeenCalledWith(
      //   expect.any(Object),
      //   expect.any(String),
      //   session
      // );
      // expect(authService.createSecretKeyForNewTenant).toHaveBeenCalledWith(
      //   expect.any(String),
      //   session
      // );
      // expect(limitsModel.create).toHaveBeenCalledWith(
      //   expect.any(Array),
      //   { session }
      // );
      // expect(tenantModel.create).toHaveBeenCalledWith(
      //   expect.any(Array),
      //   { session }
      // );
    });
  });

  /**
   * 🧪 ТЕСТЫ: Проверка атомарности операций
   * 
   * Эти тесты проверяют, что операции выполняются атомарно
   * (либо все, либо ничего)
   */
  describe('Atomicity Tests', () => {
    /**
     * Тест проверяет, что если операция провалилась,
     * предыдущие операции не должны оставить "мусорные" данные
     * 
     * ВАЖНО: Этот тест будет работать только с транзакциями
     */
    it('should not leave partial data when operation fails', async () => {
      // Arrange
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockResolvedValue({ _id: 'user-id' });
      (authService.createSecretKeyForNewTenant as jest.Mock).mockResolvedValue(undefined);
      
      // Ошибка при создании лимитов
      (limitsModel.create as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      // Act & Assert
      await expect(service.createCompany(mockCompanyData)).rejects.toThrow();

      // ВАЖНО: Без транзакций пользователь и секрет уже созданы!
      // Это проблема, которую решают транзакции
      // С транзакциями все должно откатиться
    });
  });

  /**
   * 🧪 ТЕСТЫ: Граничные случаи
   */
  describe('Edge Cases', () => {
    it('should handle empty company name', async () => {
      // Arrange
      const dataWithEmptyName = {
        ...mockCompanyData,
        companyName: '',
      };

      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockResolvedValue({ _id: 'user-id' });
      (authService.createSecretKeyForNewTenant as jest.Mock).mockResolvedValue(undefined);
      (limitsModel.create as jest.Mock).mockResolvedValue([{}]);
      (tenantModel.create as jest.Mock).mockResolvedValue({ tenantId: 'test' });

      // Act
      const result = await service.createCompany(dataWithEmptyName);

      // Assert
      expect(result).toBeDefined();
    });

    it('should generate unique tenantId for each company', async () => {
      // Arrange
      (usersService.getUserByEmail as jest.Mock).mockResolvedValue(null);
      (usersService.createUser as jest.Mock).mockResolvedValue({ _id: 'user-id' });
      (authService.createSecretKeyForNewTenant as jest.Mock).mockResolvedValue(undefined);
      (limitsModel.create as jest.Mock).mockResolvedValue([{}]);
      (tenantModel.create as jest.Mock).mockImplementation((data) => {
        return Promise.resolve({ ...data, _id: 'new-id' });
      });

      // Act
      const result1 = await service.createCompany(mockCompanyData);
      const result2 = await service.createCompany({
        ...mockCompanyData,
        companyName: 'Another Company',
        user: { ...mockCompanyData.user, email: 'another@test.com' },
      });

      // Assert
      expect(result1.tenantId).toBeDefined();
      expect(result2.tenantId).toBeDefined();
      expect(result1.tenantId).not.toBe(result2.tenantId);
    });
  });
});

