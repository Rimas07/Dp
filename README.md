HIS - Heatlh Information System

 Tech Stack

- Backend: NestJS, Express, TypeScript
- Database: MongoDB (Mongoose)
- Authentication: JWT, bcrypt
- Monitoring: Prometheus, Grafana
- API Documentation: Swagger/OpenAPI
- Security: Rate limiting, Multi-tenancy

 Requirements

- Node.js 18+
- Docker & Docker Compose

 Quick Start

 With Docker

```bash
cd His
docker-compose up -d
```

App will be available at `http://localhost:3000`

 With Monitoring (Prometheus + Grafana)

```bash
cd His
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

- App: `http://localhost:3000`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3002` (admin/admin)

 Local Development

```bash
cd His
npm install
npm run dev
```

 Environment Variables

Create `.env` file in `His/` folder:

```env
PORT=3000
DB_CONNECTION_STRING=mongodb://localhost:27017/his
ENCRYPTION_KEY=your-secret-key

```

 API Documentation

Swagger UI available at `http://localhost:3000/api`

 Available Scripts

```bash
npm run dev
npm run build
npm run start:prod
npm run test
```

---

## Развертывание Frontend на Render.com

### Подготовка

Файлы для развертывания frontend уже созданы в корне проекта:
- `frontend-package.json` - package.json для frontend
- `frontend-server.js` - Express сервер для обслуживания HTML

### Шаг 1: Развертывание Backend (если еще не сделано)

1. Зайдите на [Render.com](https://render.com)
2. Создайте **Web Service** для backend:
   - Root Directory: `His`
   - Build Command: `npm install`
   - Start Command: `npm run start:prod`

3. Добавьте переменные окружения из вашего `.env`
4. **Скопируйте URL** backend (например: `https://his-backend.onrender.com`)

### Шаг 2: Обновите API URL в Frontend

В файле `His/src/frontend.html` строка 699, замените:
```javascript
const API_BASE_URL = 'http://localhost:3000';
```

На:
```javascript
const API_BASE_URL = 'https://your-backend-name.onrender.com';
```

### Шаг 3: Развертывание Frontend

1. На Render.com создайте новый **Web Service**
2. Подключите ваш GitHub репозиторий
3. Настройте параметры:
   - **Name**: `his-frontend`
   - **Root Directory**: `.` (корень)
   - **Environment**: `Node`
   - **Build Command**: `cp frontend-package.json package.json && npm install`
   - **Start Command**: `node frontend-server.js`

4. Нажмите "Create Web Service"

### Шаг 4: Настройка CORS

В backend (`His/src/main.ts`) добавьте URL frontend в CORS:

```typescript
app.enableCors({
  origin: [
    'https://his-frontend.onrender.com', // URL вашего frontend
    'http://localhost:3001',
  ],
  credentials: true,
});
```

### Готово!

Ваш frontend будет доступен по адресу: `https://his-frontend.onrender.com`

### Альтернатива: Простое статическое размещение

Для простого HTML файла можно также использовать:
- **Netlify** (drag & drop файла frontend.html)
- **Vercel**
- **GitHub Pages**

Просто не забудьте обновить `API_BASE_URL` на адрес вашего backend.
