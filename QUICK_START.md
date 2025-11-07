# 🚀 БЫСТРЫЙ СТАРТ - ПРОВЕРКА RABBITMQ

## ✅ ЧТО БЫЛО ИСПРАВЛЕНО:

1. **RabbitMQ конфигурация** - теперь использует правильный URL для Docker
2. **Consumer** - запускается автоматически (убран profiles)
3. **Health checks** - RabbitMQ проверяется перед запуском зависимых сервисов
4. **Переменные окружения** - добавлены .env файлы

---

## 📋 КАК ПРОВЕРИТЬ:

### 1. Скопируйте .env файлы:

```bash
cd /home/user/Dp/His
cp .env.example .env

cd /home/user/Dp/consumer
cp .env.example .env
```

### 2. Запустите Docker:

```bash
cd /home/user/Dp/His

# Остановить старые контейнеры
docker-compose down

# Запустить всё заново
docker-compose up --build
```

### 3. Проверьте что все запущены:

```bash
docker-compose ps
```

Должны быть запущены (status: Up):
- ✅ his-app (порт 3000)
- ✅ mongodb (порт 27017)
- ✅ rabbitmq (порты 5672, 15672)
- ✅ **consumer** (новое! раньше не запускался)

### 4. Проверьте логи Consumer:

```bash
docker-compose logs consumer | tail -20
```

Должны увидеть:
```
✅ [Consumer] Successfully connected to RabbitMQ and listening for messages...
```

### 5. Откройте RabbitMQ Management UI:

Браузер: **http://localhost:15672**
- Login: `admin`
- Password: `admin123`

Проверьте:
- **Queues** → должна быть очередь `audit-queue`
- **Connections** → должны быть подключения от `his-app` и `consumer`

### 6. Проверьте работу Audit:

```bash
# Отправьте тестовый запрос к API
curl -X GET http://localhost:3000/api

# Проверьте что Consumer получил событие
docker-compose logs consumer | grep "AUDIT"
```

Должны увидеть JSON логи типа:
```
[AUDIT] {"timestamp":"2025-11-07T...", "level":"info", ...}
```

---

## ✅ КРИТЕРИИ УСПЕХА:

Если вы видите:
1. ✅ Consumer запущен
2. ✅ В логах Consumer: "Successfully connected to RabbitMQ"
3. ✅ В RabbitMQ UI видна очередь `audit-queue`
4. ✅ При запросе к API появляются логи `[AUDIT]`

**ТО RABBITMQ РАБОТАЕТ ПРАВИЛЬНО!** 🎉

---

## 🐛 ВОЗМОЖНЫЕ ПРОБЛЕМЫ:

### Consumer не запускается:

```bash
# Проверьте логи
docker-compose logs consumer

# Пересоберите consumer
docker-compose up --build consumer
```

### "Connection refused" в логах:

```bash
# Проверьте что RabbitMQ запущен
docker-compose logs rabbitmq | grep "started TCP listener"

# Перезапустите всё
docker-compose restart
```

### Очередь пустая в RabbitMQ UI:

```bash
# Проверьте что his-app подключен к RabbitMQ
docker-compose logs his-app | grep -i rabbit

# Отправьте тестовый запрос
curl http://localhost:3000/api
```

---

## 📊 СЛЕДУЮЩИЕ ШАГИ:

После проверки RabbitMQ переходим к:

### **ШАГ 2: Добавление метрик** (2-3 часа)
- Создание MetricsService
- Endpoint `/metrics`
- Счётчики запросов и лимитов

### **ШАГ 3: Написание тестов** (5-7 часов)
- Unit тесты (limits, proxy, auth)
- E2E тесты (API endpoints)

### **ШАГ 4: Оптимизация Docker** (1 час)
- Multi-stage build
- Alpine образ
- Уменьшение размера

### **ШАГ 5: Документация** (2 часа)
- README.md
- Архитектурные диаграммы
- Примеры API

---

## 💡 ПОЛЕЗНЫЕ КОМАНДЫ:

```bash
# Посмотреть все логи
docker-compose logs -f

# Посмотреть логи конкретного сервиса
docker-compose logs -f consumer
docker-compose logs -f his-app
docker-compose logs -f rabbitmq

# Перезапустить сервис
docker-compose restart consumer

# Остановить всё
docker-compose down

# Удалить volumes (очистить БД)
docker-compose down -v

# Пересобрать всё с нуля
docker-compose down --rmi all
docker-compose up --build
```

---

## ❓ ВОПРОСЫ?

Смотрите полную инструкцию: `STEP_BY_STEP_GUIDE.md`

**Готовы к следующему шагу? Дайте знать!** 🚀
