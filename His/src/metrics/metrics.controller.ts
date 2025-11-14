/* eslint-disable prettier/prettier */
/**
 * 📊 METRICS CONTROLLER
 *
 * Контроллер создаёт endpoint (веб-страницу) для метрик.
 *
 * ═══════════════════════════════════════════════════════════════════
 * ЧТО ТАКОЕ ENDPOINT ПРОСТЫМИ СЛОВАМИ:
 * ═══════════════════════════════════════════════════════════════════
 *
 * Endpoint = веб-страница = URL
 *
 * Например:
 * - http://localhost:3000/api - главная страница API
 * - http://localhost:3000/patients - список пациентов
 * - http://localhost:3000/metrics - МЕТРИКИ (это создаём сейчас)
 *
 * Когда кто-то (Prometheus) заходит на http://localhost:3000/metrics
 * → Вызывается функция getMetrics()
 * → Возвращается текст с цифрами
 *
 * ═══════════════════════════════════════════════════════════════════
 * КАК PROMETHEUS ИСПОЛЬЗУЕТ ЭТОТ ENDPOINT:
 * ═══════════════════════════════════════════════════════════════════
 *
 * 15:00:00 → Prometheus: GET http://your-app:3000/metrics
 *            Ответ: "proxy_requests_total 100"
 *            Prometheus сохраняет: [15:00:00, 100]
 *
 * 15:00:15 → Prometheus: GET http://your-app:3000/metrics
 *            Ответ: "proxy_requests_total 105"
 *            Prometheus сохраняет: [15:00:15, 105]
 *
 * 15:00:30 → Prometheus: GET http://your-app:3000/metrics
 *            Ответ: "proxy_requests_total 112"
 *            Prometheus сохраняет: [15:00:30, 112]
 *
 * И так далее каждые 15 секунд...
 *
 */

import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@Controller('metrics') // Путь: /metrics
@ApiTags('Metrics') // Группа в Swagger документации
export class MetricsController {
    constructor(private readonly metricsService: MetricsService) {}

    /**
     * ═══════════════════════════════════════════════════════════════════
     * GET /metrics - ГЛАВНЫЙ ENDPOINT ДЛЯ PROMETHEUS
     * ═══════════════════════════════════════════════════════════════════
     *
     * Когда Prometheus заходит на http://localhost:3000/metrics
     * → Вызывается эта функция
     * → Возвращается текст с метриками
     *
     * ВАЖНО: Формат ответа - ТЕКСТ, а не JSON!
     *
     * Обычно API возвращают JSON:
     * { "requests": 100 }
     *
     * Но Prometheus хочет текст:
     * proxy_requests_total 100
     *
     */
    @Get() // GET /metrics
    @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    @ApiOperation({
        summary: 'Get Prometheus metrics',
        description: 'Этот endpoint возвращает метрики в формате Prometheus. ' +
                     'Prometheus заходит сюда каждые 15 секунд чтобы собрать данные.'
    })
    @ApiResponse({
        status: 200,
        description: 'Метрики в текстовом формате',
        content: {
            'text/plain': {
                example: `# HELP proxy_requests_total Total number of proxy requests
# TYPE proxy_requests_total counter
proxy_requests_total 542`
            }
        }
    })
    async getMetrics(): Promise<string> {
        // Просто вызываем метод из сервиса
        return this.metricsService.getMetrics();
    }

    /**
     * ═══════════════════════════════════════════════════════════════════
     * GET /metrics/test - ДЛЯ ТЕСТИРОВАНИЯ (не для Prometheus)
     * ═══════════════════════════════════════════════════════════════════
     *
     * Этот endpoint создан для вас, чтобы проверить что счётчик работает.
     *
     * Вызов:
     * curl http://localhost:3000/metrics/test
     *
     * Что произойдёт:
     * 1. Счётчик увеличится на +1
     * 2. Вернётся сообщение "Counter increased!"
     * 3. Если теперь зайти на /metrics - увидите увеличенное значение
     *
     */
    @Get('test')
    @ApiOperation({
        summary: 'Test metrics (увеличить счётчик)',
        description: 'Увеличивает счётчик запросов на +1 для тестирования'
    })
    testMetrics() {
        // Увеличиваем счётчик
        this.metricsService.incrementRequests();

        return {
            message: 'Counter increased!',
            hint: 'Now go to /metrics to see the new value'
        };
    }
}
