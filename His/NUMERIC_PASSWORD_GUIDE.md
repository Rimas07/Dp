# Руководство по числовым паролям

## 🔢 Изменения в системе паролей

### ✅ Что изменилось:

#### **1. UserDto - числовой пароль**

```typescript
@ApiProperty({
  description: 'User password',
  example: 123456,
  minimum: 100000,
  maximum: 999999999
})
@Type(() => Number)
@IsNotEmpty({ message: 'Password is required' })
@IsInt({ message: 'Password must be a number' })
@Min(100000, { message: 'The password must be at least 100000.' })
@Max(999999999, { message: 'The password must not exceed 999999999.' })
password: number;
```

#### **2. LoginCredentialsDto - числовой пароль**

```typescript
@ApiProperty({
  description: 'User password',
  example: 123456,
  minimum: 100000,
  maximum: 999999999,
})
@Type(() => Number)
@IsNotEmpty({ message: 'password required' })
@IsInt({ message: 'Password must be number' })
@Min(100000, { message: 'Password must be at least 100000' })
@Max(999999999, { message: 'Password must not exceed 999999999' })
password: number;
```

#### **3. Обновлённая валидация**

- ✅ `@IsInt()` - проверка, что это число
- ✅ `@Min(100000)` - минимум 6 цифр (100000)
- ✅ `@Max(999999999)` - максимум 9 цифр (999999999)
- ✅ `@Type(() => Number)` - автоматическое преобразование строки в число

#### **4. Обновлённые сервисы**

**UsersService:**

```typescript
async createUser(user: UserDto, tenantId: string) {
  user.password = await bcrypt.hash(user.password.toString(), 10)
  return this.UserModel.create({ ...user, tenantId })
}
```

**AuthService:**

```typescript
const passwordMatch = await bcrypt.compare(password.toString(), user.password);
```

## 📝 Примеры использования

### **Создание компании с числовым паролем**

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

### **Вход в систему с числовым паролем**

```json
{
  "email": "admin@test.com",
  "password": 123456
}
```

## 🔧 Валидация

### **Правильные пароли:**

- ✅ `123456` - 6 цифр
- ✅ `1234567` - 7 цифр
- ✅ `12345678` - 8 цифр
- ✅ `123456789` - 9 цифр

### **Неправильные пароли:**

- ❌ `12345` - меньше 6 цифр
- ❌ `1234567890` - больше 9 цифр
- ❌ `"123456"` - строка (будет преобразована в число)
- ❌ `abc123` - содержит буквы

## 🎯 Преимущества числовых паролей

1. **Простота ввода** - только цифры
2. **Быстрый набор** - особенно на мобильных устройствах
3. **Меньше ошибок** - нет путаницы с регистром букв
4. **Совместимость** - работает с PIN-кодами и цифровыми клавиатурами

## 🔒 Безопасность

- ✅ Пароли по-прежнему хешируются с bcrypt
- ✅ Минимум 6 цифр обеспечивает достаточную сложность
- ✅ Валидация на уровне DTO предотвращает некорректные данные
- ✅ Автоматическое преобразование типов

## 🚀 Тестирование в Swagger

1. Откройте `http://localhost:3000/api`
2. В разделе **Tenants** создайте компанию с числовым паролем
3. В разделе **Authentication** войдите с числовым паролем
4. Проверьте, что валидация работает корректно

## ⚠️ Важные замечания

1. **Конвертация типов** - `@Type(() => Number)` автоматически преобразует строки в числа
2. **Хеширование** - числовые пароли конвертируются в строки перед хешированием
3. **Валидация** - используйте `@Min()` и `@Max()` вместо `@MinLength()` и `@MaxLength()` для чисел
4. **Swagger** - примеры показывают числовые значения, а не строки

Теперь ваша система поддерживает числовые пароли с полной валидацией и безопасностью! 🎉
