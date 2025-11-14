# 🧪 ТЕСТИРОВАНИЕ МЕТРИК - ПОШАГОВАЯ ИНСТРУКЦИЯ

## ЧТО МЫ БУДЕМ ТЕСТИРОВАТЬ:

1. Запустим приложение
2. Проверим что endpoint `/metrics` работает
3. Увеличим счётчик через `/metrics/test`
4. Проверим что значение изменилось

---

## 📝 ШАГ 1: УСТАНОВКА ЗАВИСИМОСТЕЙ

```bash
cd /home/user/Dp/His
npm install
```

**Что произойдёт:**
- npm установит библиотеку `prom-client`
- Это займёт 1-2 минуты

**Что увидите:**
```
added 1 package...
```

---

## 🔨 ШАГ 2: СБОРКА ПРОЕКТА

```bash
npm run build
```

**Что произойдёт:**
- TypeScript скомпилируется в JavaScript
- Создастся папка `dist/`

**Что увидите:**
```
Successfully compiled TypeScript files
```

---

## 🚀 ШАГ 3: ЗАПУСК ПРИЛОЖЕНИЯ

```bash
npm start
```

**Что произойдёт:**
- Приложение запустится на порту 3000
- Вы увидите логи инициализации

**Что увидите в консоли:**
```
📊 [MetricsService] Инициализация метрик...
✅ [MetricsService] Метрики инициализированы
📊 [MetricsService] Создан счётчик: proxy_requests_total
...
Application is running on: http://localhost:3000
```

**ВАЖНО:** Оставьте эту консоль открытой! Приложение работает.

---

## 🧪 ШАГ 4: ПРОВЕРКА ENDPOINT /metrics

**Откройте НОВОЕ окно терминала** (первое оставьте с запущенным приложением)

```bash
curl http://localhost:3000/metrics
```

**Что произойдёт:**
- Отправится GET запрос на /metrics
- Вернётся текст с метриками

**Что должны увидеть:**
```
# HELP proxy_requests_total Total number of proxy requests
# TYPE proxy_requests_total counter
proxy_requests_total 0
```

**Объяснение:**
- Строка 1-2: Описание метрики (для людей)
- Строка 3: Имя метрики и её значение (сейчас 0)

**Если видите это - ВСЁ РАБОТАЕТ!** ✅

---

## 📈 ШАГ 5: УВЕЛИЧЕНИЕ СЧЁТЧИКА

Теперь увеличим счётчик:

```bash
curl http://localhost:3000/metrics/test
```

**Что произойдёт:**
- Вызовется функция incrementRequests()
- Счётчик увеличится на +1

**Что должны увидеть:**
```json
{
  "message": "Counter increased!",
  "hint": "Now go to /metrics to see the new value"
}
```

**В консоли приложения (первое окно) увидите:**
```
📈 [MetricsService] Счётчик увеличен: proxy_requests_total
```

---

## 🔍 ШАГ 6: ПРОВЕРКА ЧТО СЧЁТЧИК УВЕЛИЧИЛСЯ

Снова проверим `/metrics`:

```bash
curl http://localhost:3000/metrics
```

**Что должны увидеть:**
```
# HELP proxy_requests_total Total number of proxy requests
# TYPE proxy_requests_total counter
proxy_requests_total 1
```

**Заметили?** Было `0`, стало `1`! ✅

---

## 🎯 ШАГ 7: УВЕЛИЧИМ ЕЩЁ НЕСКОЛЬКО РАЗ

```bash
# Увеличим счётчик ещё 5 раз
curl http://localhost:3000/metrics/test
curl http://localhost:3000/metrics/test
curl http://localhost:3000/metrics/test
curl http://localhost:3000/metrics/test
curl http://localhost:3000/metrics/test

# Проверим результат
curl http://localhost:3000/metrics
```

**Что должны увидеть:**
```
proxy_requests_total 6
```

**Было:** 1
**Увеличили:** 5 раз
**Стало:** 6

✅ **СЧЁТЧИК РАБОТАЕТ!**

---

## 🌐 ШАГ 8: ПРОВЕРКА В БРАУЗЕРЕ

Можете открыть в браузере:
```
http://localhost:3000/metrics
```

Увидите то же самое, что в curl.

---

## 📊 ШАГ 9: ПРОВЕРКА В SWAGGER

Откройте Swagger:
```
http://localhost:3000/api
```

Найдите группу **Metrics** → там будут:
- `GET /metrics` - метрики
- `GET /metrics/test` - тестовый endpoint

Можете нажать "Try it out" и протестировать прямо в Swagger!

---

## ✅ КРИТЕРИИ УСПЕХА:

Если вы видите:
1. ✅ `/metrics` возвращает текст с `proxy_requests_total 0`
2. ✅ `/metrics/test` увеличивает счётчик
3. ✅ После `/metrics/test` значение в `/metrics` растёт
4. ✅ В консоли видны логи MetricsService

**ТО ВСЁ РАБОТАЕТ ПРАВИЛЬНО!** 🎉

---

## 🎯 ЧТО ДАЛЬШЕ?

Сейчас у вас есть:
- ✅ Рабочий endpoint `/metrics`
- ✅ Один счётчик `proxy_requests_total`
- ✅ Возможность увеличивать счётчик вручную

**Следующие шаги:**

1. **Добавить автоматическое увеличение счётчика** в код прокси
   - Сейчас: увеличиваем вручную через `/metrics/test`
   - Нужно: автоматически при каждом запросе к прокси

2. **Добавить больше метрик**
   - Успешные запросы
   - Ошибки
   - Время выполнения
   - Лимиты

3. **Добавить Prometheus** в Docker
   - Prometheus будет автоматически собирать метрики

4. **Добавить Grafana** в Docker
   - Grafana нарисует графики

---

## 🐛 ВОЗМОЖНЫЕ ПРОБЛЕМЫ:

### Проблема: "Cannot find module 'prom-client'"

**Решение:**
```bash
cd /home/user/Dp/His
npm install
```

### Проблема: "Port 3000 already in use"

**Решение:**
Остановите старое приложение:
```bash
# Найдите процесс
lsof -i :3000

# Убейте процесс
kill -9 [PID]
```

### Проблема: "404 Not Found" на /metrics

**Решение:**
Проверьте что приложение запущено и логи показывают:
```
✅ [MetricsService] Метрики инициализированы
```

---

## 💡 ПОЛЕЗНЫЕ КОМАНДЫ:

```bash
# Посмотреть метрики
curl http://localhost:3000/metrics

# Увеличить счётчик
curl http://localhost:3000/metrics/test

# Посмотреть только значение счётчика
curl http://localhost:3000/metrics | grep proxy_requests_total

# Остановить приложение
Ctrl+C (в окне где запущено npm start)
```

---

**Готовы продолжить?** Скажите когда проверите, и я покажу следующий шаг! 😊
