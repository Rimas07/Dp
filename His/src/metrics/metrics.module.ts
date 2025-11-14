/* eslint-disable prettier/prettier */
/**
 * 📊 METRICS MODULE
 *
 * Модуль для системы метрик.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ЧТО ТАКОЕ MODULE В NESTJS:
 * ═══════════════════════════════════════════════════════════════════
 *
 * Module = группа связанных функций
 *
 * Например:
 * - PatientsModule - всё что связано с пациентами
 * - AuthModule - всё что связано с авторизацией
 * - MetricsModule - всё что связано с метриками
 *
 * Каждый модуль содержит:
 * - Controller (endpoints, веб-страницы)
 * - Service (бизнес-логика)
 *
 * ═══════════════════════════════════════════════════════════════════
 * @Global - ЧТО ЭТО ЗНАЧИТ:
 * ═══════════════════════════════════════════════════════════════════
 *
 * @Global означает что MetricsService будет доступен ВЕЗДЕ.
 *
 * Без @Global:
 * - Хотите использовать MetricsService в ProxyService?
 * - Нужно импортировать MetricsModule в ProxyModule
 * - Хотите в LimitsService? Опять импортировать
 * - Хотите в AuthService? Снова импортировать
 *
 * С @Global:
 * - MetricsService доступен везде автоматически
 * - Импортировать не нужно
 *
 * Это удобно для сервисов, которые используются повсюду
 * (например: логирование, метрики, конфигурация)
 *
 */

import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Global() // Делаем сервис доступным везде
@Module({
    controllers: [MetricsController], // Регистрируем контроллер (endpoints)
    providers: [MetricsService],      // Регистрируем сервис (логика)
    exports: [MetricsService]         // Экспортируем чтобы другие модули могли использовать
})
export class MetricsModule {}
