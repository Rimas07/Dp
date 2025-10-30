FROM node:18-alpine

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Устанавливаем переменные окружения
ENV NODE_ENV=production

# Запускаем микросервис
CMD ["npm", "run", "start:prod"]

