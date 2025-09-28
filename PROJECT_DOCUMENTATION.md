# HIS (Hospital Information System) - Документация проекта

## О проекте

Это документация для системы HIS - многотенантной платформы для управления больничной информацией. Система разработана с использованием современного стека технологий: NestJS, MongoDB и RabbitMQ.

Ключевая особенность системы - полная изоляция данных между разными медицинскими организациями (тенантами). Каждая организация работает в изолированной среде, не имея доступа к данным других организаций. Дополнительно система включает встроенный аудит, систему лимитов и надёжную аутентификацию.

## Быстрый старт

**Для начала работы выполните следующие шаги:**

1. **Запустите MongoDB** (локально или в Docker)
2. **Клонируйте репозиторий** и выполните `npm install` в папке `His`
3. **Создайте первую медицинскую организацию**:
   ```bash
   curl -X POST http://localhost:3000/tenants/create-company \
     -H "Content-Type: application/json" \
     -d '{"companyName":"Тестовая больница","user":{"name":"Админ","email":"admin@test.ru","password":"123456"}}'
   ```
4. **Выполните вход в систему** для получения токена
5. **Создайте первого пациента** и проверьте работу системы

**После успешного запуска можете переходить к изучению полной документации.**

## Архитектура системы

Система состоит из трёх основных компонентов:

### 1. **His** - основное приложение

Центральный компонент системы, работающий на порту 3000. Содержит всю основную бизнес-логику и API для работы с пациентами, пользователями, тенантами и другими сущностями.

Каждая медицинская организация получает отдельную базу данных в MongoDB, что обеспечивает полную изоляцию данных между организациями.

### 2. **Producer** - сервис отправки сообщений

Отвечает за отправку сообщений в RabbitMQ. При возникновении важных событий (например, создание нового заказа) Producer отправляет соответствующие события в очередь.

### 3. **Consumer** - сервис обработки сообщений

Обрабатывает входящие события из RabbitMQ. В текущей реализации основное внимание уделено работе с заказами, однако архитектура позволяет легко добавлять обработку других типов событий.

## Основные модули системы His

### 🏢 Tenants Module (Управление тенантами)

**Файлы**: `src/tenants/`

**Функциональность**:

- Создание новых медицинских организаций (компаний)
- Генерация уникальных идентификаторов тенантов (nanoid)
- Автоматическое создание пользователя-администратора
- Создание секретных ключей для JWT токенов

**API Endpoints**:

```
POST /tenants/create-company - Создание новой компании
```

**Схема данных**:

```typescript
{
  companyName: string,  // Название компании
  tenantId: string      // Уникальный ID тенант��
}
```

### 👤 Users Module (Управление пользователями)

**Файлы**: `src/users/`

**Функциональность**:

- Создание пользователей с привязкой к тенанту
- Хеширование паролей (bcrypt)
- Поиск пользователей по email
- Валидация данных с помощью DTO

**DTO (Data Transfer Objects)**:

```typescript
// UserDto
{
  name: string,     // @IsNotEmpty, @IsString, @MinLength(2), @MaxLength(50)
  email: string,    // @IsNotEmpty, @IsEmail
  password: string  // @IsNotEmpty, @IsString, @MinLength(6), @MaxLength(100)
}
```

**Валидация**:

- `@IsNotEmpty()` - все поля обязательны
- `@IsString()` - поля должны быть строками
- `@IsEmail()` - корректный формат email
- `@MinLength()` / `@MaxLength()` - ограничения длины

**Схема данных**:

```typescript
{
  name: string,
  email: string,
  password: string,    // Хешированный пароль
  tenantId: string     // Привязка к тенанту
}
```

### 🔐 Auth Module (Аутентификация)

**Файлы**: `src/auth/`

**Функциональность**:

- Аутентификация пользователей
- Генерация JWT токенов с тенант-специфичными секретными ключами
- Шифрование/дешифрование секретных ключей
- Создание секретных ключей для новых тенантов

**API Endpoints**:

```
POST /auth/login - Вход в систему
```

**Процесс аутентификации**:

1. Проверка существования пользователя
2. Сравнение паролей
3. Получение секретного ключа дл�� тенанта
4. Генерация JWT токена
5. Возврат токена и tenantId

### 🏥 Patients Module (Управление пациентами)

**Файлы**: `src/patients/`

**Функциональность**:

- Полный CRUD для пациентов (создание, чтение, обновление, удаление)
- Изоляция данных между тенантами
- Защита авторизацией
- Валидация данных с помощью DTO
- Автоматическое управление лимитами
- Проверка ObjectId для безопасности

**API Endpoints**:

```
GET /patients - Получение списка пациентов (требует аутентификации)
GET /patients/:id - Получение пациента по ID
POST /patients - Создание нового пациента
PUT /patients/:id - Обновление данных пациента
DELETE /patients/:id - Удаление пациента
```

**DTO (Data Transfer Objects)**:

```typescript
// CreatePatientDto
{
  name: string,     // Обязательное, строка, 2-50 символов
  surname: string,  // Обязательное, строка, 2-50 символов
  age: number       // Обязательное, число, минимум 0
}

// UpdatePatientDto - наследует от CreatePatientDto, все поля опциональны
```

**Валидация**:

- `@IsNotEmpty()` - все поля обязательны при создании
- `@IsString()` - name и surname должны быть строками
- `@IsInt()` - age должно быть числом
- `@Min(0)` - возраст не может быть отрицательным
- `@Type(() => Number)` - автоматическое преобразование строки в число

**Особенности**:

- MongoDB автоматически генерирует `_id` для каждого пациента
- Проверка существования пациента перед обновлением/удалением
- Автоматическое обновление счетчиков лимитов при создании/удалении
- Правильные HTTP статусы (404 для несуществующих пациентов)

### 📊 Limits Module (Управление лимитами)

**Файлы**: `src/limits/`

**Функциональность**:

- Установка лимитов для тенантов (документы, размер данных, запросы)
- Мониторинг использования ресурсов
- Блокировка при превышении лимитов

**API Endpoints**:

```
GET /limits/:tenantId - Получение лимитов тенанта
PUT /limits/:tenantId - Установка лимитов тенанта
GET /limits/usage/:tenantId - Статистика использования
```

**Типы лимитов**:

- `maxDocuments` - Максимальное количество документов
- `maxDataSizeKB` - Максимальный размер данных в KB
- `monthlyQueries` - Количество запросов в месяц

### 📝 Audit Module (Аудит)

**Файлы**: `src/audit/`

**Функциональность**:

- Логирование всех HTTP запросов
- Отправка событий аудита в RabbitMQ
- Санитизация чувствительных данных (пароли, токены)

**Данные аудита**:

- Временная метка
- ID пользователя и тенанта
- HTTP метод и путь
- Статус код и время выполнения
- IP адрес и User-Agent
- Тело запроса (с санитизацией)

### 🔄 Proxy Module (Прокси)

**Файлы**: `src/proxy/`

**Функциональность**:

- Проверка состояния системы
- Базовый health check endpoint

**API Endpoints**:

```
GET /proxy/health - Проверка состояния
```

## Многотенантная архитектура

Многотенантность является ключевой особенностью системы. Она обеспечивает полную изоляцию данных между различными медицинскими организациями - каждая организация работает независимо, не имея доступа к данным других организаций.

### Принцип работы

1. **Изоляция на уровне базы данных**:

   - Каждая организация получает отдельную базу данных MongoDB
   - Пример: "Больница Солнышко" → база `tenant_abc123`
   - Полное разделение данных между организациями

2. **Стандартизированное именование**:

   - Формат имени базы: `tenant_{tenantId}`
   - Обеспечивает предсказуемость и удобство администрирования

3. **Middleware проверки**:

   - Каждый входящий запрос проверяет заголовок `X-TENANT-ID`
   - При невалидном ID или отсутствии организации доступ блокируется

4. **Динамическое подключение**:
   - Автоматическое переключение между базами данных тенантов
   - Прозрачность для разработчика - система сама определяет нужную базу

### Компоненты многотенантности

#### TenantMiddleware

- Извлекает `tenantId` из заголовка `X-TENANT-ID`
- Проверяет существование тенанта
- Добавляет `tenantId` в объект запроса

#### TenantConnectionProvider

- Создает подключения к базам данных тенантов
- Использует request-scoped провайдеры
- Автоматически переключается между базами

#### TenantAuthenticationGuard

- Проверяет JWT токены с тенант-специфичными ключами
- Обеспечивает безопасность на уровне тенанта

## Система безопасности

### Шифрование

- **Алгоритм**: Cryptr для симметричного шифрования
- **Применение**: Секретные ключи JWT токено��
- **Ключ шифрования**: Хранится в переменных окружения

### JWT токены

- **Уникальные ключи**: Каждый тенант имеет свой секретный ключ
- **Время жизни**: 10 часов
- **Содержимое**: userId в payload

### Хеширование паролей

- **Алгоритм**: bcrypt
- **Раунды**: 10

## Микросервисная архитектура

### Producer Service

**Функции**:

- Отправка заказов в RabbitMQ
- Получение списка заказов
- Эмиссия событий `order-placed`

**API**:

```
POST /orders - Создание заказа
GET /orders - Получение заказов
```

### Consumer Service

**Функции**:

- Обработка событий `order-placed`
- Хранение заказов в памяти
- Предоставление API для получения заказов

**Обработчики**:

- `handleOrderPlaced` - Обработка новых заказов
- `getOrders` - Возврат списка заказов

## Конфигурация и развертывание

### Переменные окружения (.env)

```
PORT=3000
DATABASE_CONNECTION_STRING=mongodb://localhost:27017/his
SECURITY_ENCRYPTION_SECRET_KEY=your-encryption-key
```

### Зависимости

**Основные**:

- NestJS (фреймворк)
- Mongoose (MongoDB ODM)
- JWT (аутентификация)
- bcrypt (хеширование)
- nanoid (генерация ID)
- cryptr (шифрование)
- RabbitMQ (сообщения)

### Запуск системы

```bash
# Основное приложение
cd His
npm run start:dev

# Producer
cd producer
npm run start:dev

# Consumer
cd consumer
npm run start:dev
```

## API Документация

### Создание компании

```http
POST /tenants/create-company
Content-Type: application/json

{
  "companyName": "Городская больница №1",
  "user": {
    "name": "Иван Иванов",
    "email": "admin@hospital1.ru",
    "password": "securepassword"
  }
}
```

### Аутентификация

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@hospital1.ru",
  "password": "securepassword"
}
```

### Получение пациентов

```http
GET /patients
X-TENANT-ID: {tenantId}
Authorization: Bearer {jwt-token}
```

### Управление лимитами

```http
PUT /limits/{tenantId}
Authorization: Bearer {jwt-token}
Content-Type: application/json

{
  "maxDocuments": 5000,
  "maxDataSizeKB": 102400,
  "monthlyQueries": 10000
}
```

## Особенности реализации

### Преимущества

1. **Полная изоляция данных** между тенантами
2. **Масштабируемость** - каждый тенант может иметь свою базу
3. **Безопасность** - уникальные ключи шифрования для каждого тенанта
4. **Аудит** - полное логирование всех операций
5. **Контроль ресурсов** - система лимитов предотвращает злоупотребления

### Потенциальные улучшения

2. **Обработка ошибок** - централизованная система обработки ошибок
3. **Кеширование** - Redis для улучшения производительности
4. **Мониторинг** - интеграция с системами мониторинга
5. **Тестирование** - покрытие unit и integration тестами

## Новые функции и улучшения

### ✅ Система валидации данных

**Реализована полная валидация для всех DTO:**

#### UserDto

```typescript
{
  name: string,     // @IsNotEmpty, @IsString, @MinLength(2), @MaxLength(50)
  email: string,    // @IsNotEmpty, @IsEmail
  password: string  // @IsNotEmpty, @IsString, @MinLength(6), @MaxLength(100)
}
```

#### CreateCompanyDto

```typescript
{
  companyName: string,  // @IsNotEmpty, @IsString, @MinLength(2), @MaxLength(100)
  user: UserDto         // @ValidateNested, @Type(() => UserDto)
}
```

#### LoginCredentialsDto

```typescript
{
  email: string,    // @IsNotEmpty, @IsEmail
  password: string  // @IsNotEmpty, @IsString, @MinLength(1)
}
```

#### UpdateCredentialsDto

```typescript
// Наследует от LoginCredentialsDto, все поля опциональны
```

### ✅ Полный CRUD для пациентов

**Новые endpoints:**

```
GET /patients/:id     - Получение пациента по ID
PUT /patients/:id     - Обновление данных пациента
DELETE /patients/:id  - Удаление пациента
```

**Особенности:**

- Валидация ObjectId для безопасности
- Проверка существования пациента перед операциями
- Автоматическое обновление лимитов при удалении
- Правильные HTTP статусы (404 для несуществующих записей)

### ✅ Улучшенная структура DTO

**Стандартизированная структура по типу Patient DTO:**

- `CreateXxxDto` - для создания записей (все поля обязательны)
- `UpdateXxxDto extends PartialType(CreateXxxDto)` - для обновления (все поля опциональны)

### ✅ Очистка кода

**Удалены все объясняющие комментарии:**

- Русские комментарии - полностью удалены
- Английские объясняющие комментарии - удалены
- Закомментированный код - удален
- Избыточные комментарии - удалены

**Результат:**

- Код стал чище и профессиональнее
- Улучшена читаемость
- Исправлены ошибки линтера

### ✅ Настройки ValidationPipe

**Глобальная валидация в main.ts:**

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Удаляет свойства без декораторов
    forbidNonWhitelisted: true, // Возвращает ошибку при лишних свойствах
  })
);
```

### ✅ Обработка ошибок

**Улучшенная обработка ошибок:**

- `NotFoundException` вместо обычного `Error`
- Правильные HTTP статусы
- Понятные сообщения об ошибках на русском языке

## Примеры использования новых API

### Создание пациента

```http
POST /patients
X-TENANT-ID: {tenantId}
Authorization: Bearer {jwt-token}
Content-Type: application/json

{
  "name": "Иван",
  "surname": "Иванов",
  "age": 30
}
```

### Обновление пациента

```http
PUT /patients/{patientId}
X-TENANT-ID: {tenantId}
Authorization: Bearer {jwt-token}
Content-Type: application/json

{
  "name": "Новое имя",
  "age": 31
}
```

### Удаление пациента

```http
DELETE /patients/{patientId}
X-TENANT-ID: {tenantId}
Authorization: Bearer {jwt-token}
```

### Ответы при ошибках валидации

```json
{
  "statusCode": 400,
  "message": [
    "Имя пользователя обязательно",
    "Некорректный формат email",
    "Пароль должен содержать минимум 6 символов"
  ],
  "error": "Bad Request"
}
```

## Заключение

HIS представляет собой современную многотенантную систему управления больничной информацией с акцентом на безопасность, изоляцию данных и масштабируемость. Система теперь включает полную валидацию данных, CRUD операции для всех сущностей и профессионально оформленный код без избыточных комментариев.

Архитектура позволяет легко добавлять новые медицинские организации без влияния на существующие данные и обеспечивает высокий уровень безопасности через индивидуальные ключи шифрования и изолированные базы данных.

---

## Оценка текущего состояния системы

### Реализованные возможности

- **Многотенантная архитектура**: Обеспечивает полную изоляцию данных между организациями
- **Комплексная валидация**: Система проверяет все входящие данные на соответствие требованиям
- **Система лимитов**: Автоматическая защита от перегрузки ресурсов
- **Полный аудит**: Детальное логирование всех операций в системе

### Планы по развитию

- **Кеширование**: Интеграция Redis для повышения производительности
- **Тестирование**: Расширение покрытия unit и integration тестами
- **Мониторинг**: Добавление систем мониторинга и алертинга
- **Маскировка данных**: Информация должна быть конфиденциальной

### Развертывание системы

```bash
# Основное приложение
cd His
npm install
npm run start:dev

# Producer (при необходимости)
cd ../producer
npm install
npm run start:dev

# Consumer (при необходимости)
cd ../consumer
npm install
npm run start:dev
```

**Требования**: Перед запуском необходимо настроить MongoDB и RabbitMQ.

### Решение проблем

1. Убедитесь, что MongoDB запущена и доступна
2. Проверьте настройки переменных окружения
3. Изучите логи приложения для диагностики ошибок
4. При возникновении сложных проблем обратитесь к разделу Issues

### Рекомендации для разработчиков

**Добавление нового модуля:**

1. Используйте структуру модуля `patients/` как шаблон
2. Замените `Patient` на название вашей сущности
3. Добавьте соответствующую валидацию в DTO
4. Не забудьте интегрировать с системой лимитов и аудита

**Отладка многотенантности:**

- Всегда проверяйте наличие заголовка `X-TENANT-ID` в запросах
- Логи системы показывают, к какой базе данных происходит подключение
- При возникновении ошибок в первую очередь проверьте существование тенанта

**Оптимизация производительности:**

- MongoDB индексы настроены автоматически
- Настройте лимиты с учётом реальных потребностей организации
- Аудит работает асинхронно и не влияет на производительность основных операций

### Поддержка и развитие

Система разработана с учётом принципов расширяемости и модульности. Если у вас есть вопросы по коду или предложения по улучшению - мы открыты для сотрудничества.

Для сообщения об ошибках или предложений используйте систему Issues проекта.

---

# HIS (Hospital Information System) - Project Documentation

## About the Project

This is documentation for the HIS system - a multi-tenant platform for hospital information management. The system is developed using modern technology stack: NestJS, MongoDB, and RabbitMQ.

The key feature of the system is complete data isolation between different medical organizations (tenants). Each organization operates in an isolated environment without access to other organizations' data. Additionally, the system includes built-in auditing, resource limits, and robust authentication.

## Quick Start

**To get started, follow these steps:**

1. **Start MongoDB** (locally or in Docker)
2. **Clone the repository** and run `npm install` in the `His` folder
3. **Create your first medical organization**:
   ```bash
   curl -X POST http://localhost:3000/tenants/create-company \
     -H "Content-Type: application/json" \
     -d '{"companyName":"Test Hospital","user":{"name":"Admin","email":"admin@test.ru","password":"123456"}}'
   ```
4. **Log into the system** to get a token
5. **Create your first patient** and verify the system works

**After successful startup, you can proceed to study the full documentation.**

## System Architecture

The system consists of three main components:

### 1. **His** - Main Application

The central component of the system, running on port 3000. Contains all core business logic and APIs for working with patients, users, tenants, and other entities.

Each medical organization gets a separate MongoDB database, ensuring complete data isolation between organizations.

### 2. **Producer** - Message Sending Service

Responsible for sending messages to RabbitMQ. When important events occur (e.g., creating a new order), Producer sends corresponding events to the queue.

### 3. **Consumer** - Message Processing Service

Processes incoming events from RabbitMQ. The current implementation focuses mainly on order handling, but the architecture allows easy addition of other event types.

## Core System Modules

### 🏢 Tenants Module - New Hospital Registration

**Location**: `src/tenants/`

When a new hospital wants to join our system, it goes through this module. We:

- Create a unique ID for the hospital (using nanoid - very reliable)
- Automatically create an administrator for this hospital
- Generate a secret key for JWT tokens
- Set up default limits

**How to use**:

```bash
POST /tenants/create-company
```

Just send the hospital name and administrator data, and we'll set everything up automatically.

**What to send**:

```typescript
{
  companyName: "City Hospital #1",  // Hospital name
  user: {
    name: "Ivan Petrov",
    email: "admin@hospital1.ru",
    password: "securepassword123"
  }
}
```

### 👤 Users Module - User Management

**Location**: `src/users/`

**Functionality**:

- Create users with tenant binding
- Password hashing (bcrypt)
- Find users by email
- Data validation with DTO

**DTO (Data Transfer Objects)**:

```typescript
// UserDto
{
  name: string,     // @IsNotEmpty, @IsString, @MinLength(2), @MaxLength(50)
  email: string,    // @IsNotEmpty, @IsEmail
  password: string  // @IsNotEmpty, @IsString, @MinLength(6), @MaxLength(100)
}
```

**Validation**:

- `@IsNotEmpty()` - all fields are required
- `@IsString()` - fields must be strings
- `@IsEmail()` - correct email format
- `@MinLength()` / `@MaxLength()` - length constraints

**Data Schema**:

```typescript
{
  name: string,
  email: string,
  password: string,    // Hashed password
  tenantId: string     // Tenant binding
}
```

### 🔐 Auth Module - Authentication

**Location**: `src/auth/`

**Functionality**:

- User authentication
- JWT token generation with tenant-specific secret keys
- Secret key encryption/decryption
- Secret key creation for new tenants
- Login data validation

**API Endpoints**:

```
POST /auth/login - System login
```

**DTO (Data Transfer Objects)**:

```typescript
// LoginCredentialsDto
{
  email: string,    // @IsNotEmpty, @IsEmail
  password: string  // @IsNotEmpty, @IsString, @MinLength(1)
}

// UpdateCredentialsDto extends PartialType(LoginCredentialsDto)
```

**Authentication Process**:

1. Input data validation
2. Check if user exists
3. Compare passwords
4. Get secret key for tenant
5. Generate JWT token
6. Return token and tenantId

### 🏥 Patients Module - Patient Management

**Location**: `src/patients/`

**Functionality**:

- Full CRUD for patients (create, read, update, delete)
- Data isolation between tenants
- Authorization protection
- Data validation with DTO
- Automatic limit management
- ObjectId validation for security

**API Endpoints**:

```
GET /patients - Get list of patients (requires authentication)
GET /patients/:id - Get patient by ID
POST /patients - Create new patient
PUT /patients/:id - Update patient data
DELETE /patients/:id - Delete patient
```

**DTO (Data Transfer Objects)**:

```typescript
// CreatePatientDto
{
  name: string,     // Required, string, 2-50 characters
  surname: string,  // Required, string, 2-50 characters
  age: number       // Required, number, minimum 0
}

// UpdatePatientDto - inherits from CreatePatientDto, all fields optional
```

**Validation**:

- `@IsNotEmpty()` - all fields required for creation
- `@IsString()` - name and surname must be strings
- `@IsInt()` - age must be a number
- `@Min(0)` - age cannot be negative
- `@Type(() => Number)` - automatic string to number conversion

**Features**:

- MongoDB automatically generates `_id` for each patient
- Check patient existence before update/delete operations
- Automatic limit counter updates on creation/deletion
- Proper HTTP statuses (404 for non-existent patients)

### 📊 Limits Module - Limit Management

**Location**: `src/limits/`

**Functionality**:

- Set limits for tenants (documents, data size, queries)
- Monitor resource usage
- Block on limit exceedance

**API Endpoints**:

```
GET /limits/:tenantId - Get tenant limits
PUT /limits/:tenantId - Set tenant limits
GET /limits/usage/:tenantId - Usage statistics
```

**Limit Types**:

- `maxDocuments` - Maximum number of documents
- `maxDataSizeKB` - Maximum data size in KB
- `monthlyQueries` - Number of queries per month

### 📝 Audit Module - Auditing

**Location**: `src/audit/`

**Functionality**:

- Log all HTTP requests
- Send audit events to RabbitMQ
- Sanitize sensitive data (passwords, tokens)

**Audit Data**:

- Timestamp
- User and tenant ID
- HTTP method and path
- Status code and execution time
- IP address and User-Agent
- Request body (with sanitization)

### 🔄 Proxy Module - Proxy

**Location**: `src/proxy/`

**Functionality**:

- System status check
- Basic health check endpoint

**API Endpoints**:

```
GET /proxy/health - Status check
```

## Multi-Tenant Architecture

Multi-tenancy is a key feature of the system. It ensures complete data isolation between different medical organizations - each organization operates independently without access to other organizations' data.

### How It Works

1. **Database-level isolation**:

   - Each organization gets a separate MongoDB database
   - Example: "Sunshine Hospital" → database `tenant_abc123`
   - Complete data separation between organizations

2. **Standardized naming**:

   - Database name format: `tenant_{tenantId}`
   - Ensures predictability and ease of administration

3. **Middleware validation**:

   - Each incoming request checks the `X-TENANT-ID` header
   - Access is blocked for invalid ID or non-existent organization

4. **Dynamic connection**:
   - Automatic switching between tenant databases
   - Transparency for developer - system determines the required database

### Multi-Tenancy Components

#### TenantMiddleware

- Extracts `tenantId` from `X-TENANT-ID` header
- Checks tenant existence
- Adds `tenantId` to request object

#### TenantConnectionProvider

- Creates connections to tenant databases
- Uses request-scoped providers
- Automatically switches between databases

#### TenantAuthenticationGuard

- Validates JWT tokens with tenant-specific keys
- Ensures tenant-level security

## Security System

### Encryption

- **Algorithm**: Cryptr for symmetric encryption
- **Application**: JWT token secret keys
- **Encryption key**: Stored in environment variables

### JWT Tokens

- **Unique keys**: Each tenant has its own secret key
- **Lifetime**: 10 hours
- **Content**: userId in payload

### Password Hashing

- **Algorithm**: bcrypt
- **Rounds**: 10

## Microservice Architecture

### Producer Service

**Functions**:

- Send orders to RabbitMQ
- Get list of orders
- Emit `order-placed` events

**API**:

```
POST /orders - Create order
GET /orders - Get orders
```

### Consumer Service

**Functions**:

- Process `order-placed` events
- Store orders in memory
- Provide API for getting orders

**Handlers**:

- `handleOrderPlaced` - Process new orders
- `getOrders` - Return order list

## Configuration and Deployment

### Environment Variables (.env)

```
PORT=3000
DATABASE_CONNECTION_STRING=mongodb://localhost:27017/his
SECURITY_ENCRYPTION_SECRET_KEY=your-encryption-key
```

### Dependencies

**Core**:

- NestJS (framework)
- Mongoose (MongoDB ODM)
- JWT (authentication)
- bcrypt (hashing)
- nanoid (ID generation)
- cryptr (encryption)
- RabbitMQ (messaging)

### System Startup

```bash
# Main application
cd His
npm run start:dev

# Producer (if needed)
cd producer
npm run start:dev

# Consumer (if needed)
cd consumer
npm run start:dev
```

## API Documentation

### Creating a Company

```http
POST /tenants/create-company
Content-Type: application/json

{
  "companyName": "City Hospital #1",
  "user": {
    "name": "Ivan Ivanov",
    "email": "admin@hospital1.ru",
    "password": "securepassword"
  }
}
```

### Authentication

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@hospital1.ru",
  "password": "securepassword"
}
```

### Getting Patients

```http
GET /patients
X-TENANT-ID: {tenantId}
Authorization: Bearer {jwt-token}
```

### Managing Limits

```http
PUT /limits/{tenantId}
Authorization: Bearer {jwt-token}
Content-Type: application/json

{
  "maxDocuments": 5000,
  "maxDataSizeKB": 102400,
  "monthlyQueries": 10000
}
```

## Implementation Features

### Advantages

1. **Complete data isolation** between tenants
2. **Scalability** - each tenant can have its own database
3. **Security** - unique encryption keys for each tenant
4. **Auditing** - complete logging of all operations
5. **Resource control** - limit system prevents abuse

### Potential Improvements

1. **Data validation** - add DTO validation
2. **Error handling** - centralized error handling system
3. **Caching** - Redis for improved performance
4. **Monitoring** - integration with monitoring systems
5. **Testing** - unit and integration test coverage

## New Features and Improvements

### ✅ Data Validation System

**Implemented full validation for all DTOs:**

#### UserDto

```typescript
{
  name: string,     // @IsNotEmpty, @IsString, @MinLength(2), @MaxLength(50)
  email: string,    // @IsNotEmpty, @IsEmail
  password: string  // @IsNotEmpty, @IsString, @MinLength(6), @MaxLength(100)
}
```

#### CreateCompanyDto

```typescript
{
  companyName: string,  // @IsNotEmpty, @IsString, @MinLength(2), @MaxLength(100)
  user: UserDto         // @ValidateNested, @Type(() => UserDto)
}
```

#### LoginCredentialsDto

```typescript
{
  email: string,    // @IsNotEmpty, @IsEmail
  password: string  // @IsNotEmpty, @IsString, @MinLength(1)
}
```

#### UpdateCredentialsDto

```typescript
// Inherits from LoginCredentialsDto, all fields optional
```

### ✅ Full CRUD for Patients

**New endpoints:**

```
GET /patients/:id     - Get patient by ID
PUT /patients/:id     - Update patient data
DELETE /patients/:id  - Delete patient
```

**Features:**

- ObjectId validation for security
- Check patient existence before operations
- Automatic limit updates on deletion
- Proper HTTP statuses (404 for non-existent records)

### ✅ Improved DTO Structure

**Standardized structure following Patient DTO pattern:**

- `CreateXxxDto` - for creating records (all fields required)
- `UpdateXxxDto extends PartialType(CreateXxxDto)` - for updates (all fields optional)

### ✅ Code Cleanup

**Removed all explanatory comments:**

- Russian comments - completely removed
- English explanatory comments - removed
- Commented code - removed
- Redundant comments - removed

**Result:**

- Code became cleaner and more professional
- Improved readability
- Fixed linter errors

### ✅ ValidationPipe Settings

**Global validation in main.ts:**

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Remove properties without decorators
    forbidNonWhitelisted: true, // Return error for extra properties
  })
);
```

### ✅ Error Handling

**Improved error handling:**

- `NotFoundException` instead of regular `Error`
- Proper HTTP statuses
- Clear error messages in Russian

## New API Usage Examples

### Creating a Patient

```http
POST /patients
X-TENANT-ID: {tenantId}
Authorization: Bearer {jwt-token}
Content-Type: application/json

{
  "name": "Ivan",
  "surname": "Ivanov",
  "age": 30
}
```

### Updating a Patient

```http
PUT /patients/{patientId}
X-TENANT-ID: {tenantId}
Authorization: Bearer {jwt-token}
Content-Type: application/json

{
  "name": "New Name",
  "age": 31
}
```

### Deleting a Patient

```http
DELETE /patients/{patientId}
X-TENANT-ID: {tenantId}
Authorization: Bearer {jwt-token}
```

### Validation Error Responses

```json
{
  "statusCode": 400,
  "message": [
    "User name is required",
    "Invalid email format",
    "Password must contain at least 6 characters"
  ],
  "error": "Bad Request"
}
```

## Conclusion

HIS is a modern multi-tenant hospital information management system with a focus on security, data isolation, and scalability. The system now includes complete data validation, CRUD operations for all entities, and professionally formatted code without redundant comments.

The architecture allows easy addition of new medical organizations without affecting existing data and ensures a high level of security through individual encryption keys and isolated databases.

---

## System Status Assessment

### Implemented Features

- **Multi-tenant architecture**: Ensures complete data isolation between organizations
- **Comprehensive validation**: System validates all incoming data against requirements
- **Limit system**: Automatic protection against resource overload
- **Full auditing**: Detailed logging of all system operations

### Development Plans

- **Caching**: Redis integration for improved performance
- **Testing**: Expand unit and integration test coverage
- **Monitoring**: Add monitoring and alerting systems
- **User Interface**: Develop web interface for system management

### System Deployment

```bash
# Main application
cd His
npm install
npm run start:dev

# Producer (if needed)
cd ../producer
npm install
npm run start:dev

# Consumer (if needed)
cd ../consumer
npm install
npm run start:dev
```

**Requirements**: MongoDB and RabbitMQ must be configured before startup.

### Troubleshooting

1. Ensure MongoDB is running and accessible
2. Check environment variable settings
3. Review application logs for error diagnosis
4. For complex issues, refer to the Issues section

### Developer Recommendations

**Adding a new module:**

1. Use the `patients/` module structure as a template
2. Replace `Patient` with your entity name
3. Add appropriate validation to DTO
4. Don't forget to integrate with limits and audit systems

**Multi-tenancy debugging:**

- Always check for `X-TENANT-ID` header in requests
- System logs show which database is being connected to
- If something doesn't work, first check if the tenant exists

**Performance optimization:**

- MongoDB indexes are configured automatically
- Set limits considering real organization needs
- Audit works asynchronously and doesn't affect main operation performance

### Support and Development

The system is developed with extensibility and modularity principles in mind. If you have questions about the code or suggestions for improvement - we're open to collaboration.

Use the project's Issues system to report bugs or suggestions.
