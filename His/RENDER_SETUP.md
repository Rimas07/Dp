# 🚀 Инструкция по использованию MongoDB Proxy на Render.com

## Проблема, которая была решена

Эндпоинт `https://mongodb-proxy-zvw6.onrender.com/mongo/patients` не работал по следующим причинам:

1. **Слишком строгий Rate Limiter** - был установлен лимит в 5 запросов в минуту (сейчас увеличен до 100)
2. **Отсутствие GET endpoint** - прокси принимал только POST запросы
3. **Неправильный путь** - на Render.com отдельный сервер на порту 3001 не запускается

## Исправления

✅ Увеличен rate limiter с 5 до 100 запросов в минуту
✅ Добавлена поддержка GET запросов
✅ Добавлен отдельный GET endpoint в ProxyController

## Как использовать

### Локальная разработка

```bash
# Запускается отдельный HTTP Proxy сервер на порту 3001
http://localhost:3001/mongo/patients
```

### Production (Render.com)

**ВАЖНО:** На Render.com используйте префикс `/proxy/`!

```bash
# GET запрос (для чтения данных)
https://mongodb-proxy-zvw6.onrender.com/proxy/mongo/patients

# POST запрос (для операций с данными)
curl -X POST https://mongodb-proxy-zvw6.onrender.com/proxy/mongo/patients \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: your-tenant-id" \
  -d '{"operation": "find", "filter": {}}'
```

## Требования аутентификации

Прокси требует один из следующих способов аутентификации:

1. **X-Tenant-ID header** (для тестирования):
   ```bash
   curl -H "X-Tenant-ID: your-tenant-id" https://mongodb-proxy-zvw6.onrender.com/proxy/mongo/patients
   ```

2. **JWT токен**:
   ```bash
   curl -H "Authorization: Bearer YOUR_JWT_TOKEN" https://mongodb-proxy-zvw6.onrender.com/proxy/mongo/patients
   ```

## Endpoints

- Health check: `https://mongodb-proxy-zvw6.onrender.com/proxy/health`
- MongoDB proxy (GET): `https://mongodb-proxy-zvw6.onrender.com/proxy/mongo/*path`
- MongoDB proxy (POST): `https://mongodb-proxy-zvw6.onrender.com/proxy/mongo/*path`

## Rate Limits

- Глобальный лимит: 100 запросов в минуту с одного IP
- Лимит по tenant: 50 запросов в минуту

## Примеры использования

### GET запрос для получения всех пациентов

```bash
curl -H "X-Tenant-ID: tenant123" \
     https://mongodb-proxy-zvw6.onrender.com/proxy/mongo/patients
```

### POST запрос для поиска конкретного пациента

```bash
curl -X POST https://mongodb-proxy-zvw6.onrender.com/proxy/mongo/patients \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: tenant123" \
  -d '{
    "operation": "findOne",
    "filter": { "name": "John Doe" }
  }'
```

### POST запрос для создания нового пациента

```bash
curl -X POST https://mongodb-proxy-zvw6.onrender.com/proxy/mongo/patients \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: tenant123" \
  -d '{
    "operation": "insertOne",
    "document": {
      "name": "Jane Smith",
      "age": 30,
      "diagnosis": "Healthy"
    }
  }'
```
