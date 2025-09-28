# 🔐 Swagger Authentication Guide

## 🚀 Пошаговое руководство по аутентификации в Swagger

### **Шаг 1: Создание компании**

1. Откройте Swagger UI: `http://localhost:3000/api`
2. Перейдите в раздел **Tenants**
3. Нажмите на `POST /tenants/create-company`
4. Нажмите `Try it out`
5. Вставьте JSON:

```json
{
  "companyName": "Test Hospital",
  "user": {
    "name": "Admin User",
    "email": "admin@test.com",
    "password": 123456
  }
}
```

6. Нажмите `Execute`
7. **Скопируйте `tenantId` из ответа** (например: `"tenantId": "abc123def456"`)

### **Шаг 2: Вход в систему**

1. Перейдите в раздел **Authentication**
2. Нажмите на `POST /auth/login`
3. Нажмите `Try it out`
4. Вставьте JSON:

```json
{
  "email": "admin@test.com",
  "password": 123456
}
```

5. Нажмите `Execute`
6. **Скопируйте `access_token` из ответа**

### **Шаг 3: Авторизация в Swagger**

1. Нажмите кнопку **🔒 Authorize** в верхней части страницы
2. В поле `bearer` введите токен в формате:
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   **БЕЗ** слова "Bearer" - только сам токен!
3. Нажмите `Authorize`
4. Закройте окно авторизации

### **Шаг 4: Тестирование защищённых endpoints**

Теперь все защищённые endpoints будут работать:

#### **Получение пациентов:**

1. Перейдите в раздел **Patients**
2. Нажмите `GET /patients`
3. Нажмите `Try it out`
4. **ВАЖНО**: Добавьте заголовок `X-TENANT-ID`:
   - В поле `X-TENANT-ID` введите ваш `tenantId` (например: `abc123def456`)
5. Нажмите `Execute`

#### **Создание пациента:**

1. Нажмите `POST /patients`
2. Нажмите `Try it out`
3. Добавьте заголовок `X-TENANT-ID` с вашим tenantId
4. Вставьте JSON:

```json
{
  "name": "John",
  "surname": "Doe",
  "age": 30
}
```

5. Нажмите `Execute`

## 🔧 Решение проблем

### **Ошибка "Missing access token":**

- ✅ Убедитесь, что вы авторизовались (нажали Authorize)
- ✅ Проверьте, что вводите токен БЕЗ слова "Bearer"
- ✅ Убедитесь, что токен не истёк (JWT токены живут 10 часов)

### **Ошибка "X-TENANT-ID is not provided":**

- ✅ Добавьте заголовок `X-TENANT-ID` в запрос
- ✅ Используйте правильный tenantId из ответа создания компании

### **Ошибка "tenant does not exist":**

- ✅ Убедитесь, что используете правильный tenantId
- ✅ Проверьте, что компания была создана успешно

### **Ошибка "Wrong credentials":**

- ✅ Проверьте email и пароль
- ✅ Убедитесь, что пользователь существует

## 📋 Примеры успешных запросов

### **1. Создание компании:**

```http
POST /tenants/create-company
Content-Type: application/json

{
  "companyName": "City Hospital #1",
  "user": {
    "name": "Ivan Petrov",
    "email": "admin@hospital1.ru",
    "password": 123456
  }
}
```

**Ответ:**

```json
{
  "companyName": "City Hospital #1",
  "tenantId": "abc123def456",
  "_id": "...",
  "__v": 0
}
```

### **2. Вход в систему:**

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@hospital1.ru",
  "password": 123456
}
```

**Ответ:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tenantId": "abc123def456"
}
```

### **3. Получение пациентов:**

```http
GET /patients
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-TENANT-ID: abc123def456
```

### **4. Создание пациента:**

```http
POST /patients
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-TENANT-ID: abc123def456
Content-Type: application/json

{
  "name": "John",
  "surname": "Doe",
  "age": 30
}
```

## 🎯 Быстрая проверка

1. **Создайте компанию** → получите `tenantId`
2. **Войдите в систему** → получите `access_token`
3. **Авторизуйтесь в Swagger** → вставьте токен
4. **Добавьте заголовок X-TENANT-ID** → вставьте tenantId
5. **Тестируйте API** → всё должно работать!

## 🔒 Безопасность

- ✅ JWT токены автоматически истекают через 10 часов
- ✅ Каждый тенант имеет свой секретный ключ
- ✅ Пароли хешируются с bcrypt
- ✅ Валидация на всех уровнях

Теперь вы можете полноценно тестировать API через Swagger! 🚀
