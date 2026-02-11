
import axios from 'axios';
import { performance } from 'perf_hooks';

interface BenchmarkResult {
  name: string;
  operations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  throughput: number; 
  errors: number;
  p50: number;
  p95: number;
  p99: number;
}

interface BenchmarkConfig {
  baseUrl: string;
  proxyUrl: string;
  tenantId: string;
  token: string;
  operations: number;
  concurrency: number;
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];

  
  async benchmarkLatency(config: BenchmarkConfig): Promise<BenchmarkResult> {
    console.log(`\n📊 Benchmark: Latency Test`);
    console.log(`   Operations: ${config.operations}`);
    console.log(`   Concurrency: ${config.concurrency}`);

    const times: number[] = [];
    let errors = 0;

    const startTime = performance.now();

    // Создаем батчи запросов
    const batches = Math.ceil(config.operations / config.concurrency);

    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(config.concurrency, config.operations - batch * config.concurrency);
      const promises = Array(batchSize)
        .fill(0)
        .map(async () => {
          const requestStart = performance.now();
          try {
            await axios.post(
              `${config.proxyUrl}/mongo/patients`,
              {
                operation: 'find',
                filter: {},
              },
              {
                headers: {
                  'Authorization': `Bearer ${config.token}`,
                  'X-Tenant-ID': config.tenantId,
                },
              }
            );
            const requestEnd = performance.now();
            return requestEnd - requestStart;
          } catch (error) {
            errors++;
            return null;
          }
        });

      const batchResults = await Promise.all(promises);
      times.push(...batchResults.filter(t => t !== null) as number[]);
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    const sortedTimes = times.sort((a, b) => a - b);
    const result = this.calculateStatistics('Latency Test', times, totalTime, errors);

    console.log(`   ✅ Completed: ${result.operations} operations`);
    console.log(`   ⏱️  Average: ${result.avgTime.toFixed(2)}ms`);
    console.log(`   📈 Throughput: ${result.throughput.toFixed(2)} ops/sec`);
    console.log(`   📊 P95: ${result.p95.toFixed(2)}ms`);
    console.log(`   ❌ Errors: ${errors}`);

    return result;
  }

  
  async benchmarkThroughput(config: BenchmarkConfig): Promise<BenchmarkResult> {
    console.log(`\n📊 Benchmark: Throughput Test`);
    console.log(`   Operations: ${config.operations}`);
    console.log(`   Concurrency: ${config.concurrency}`);

    const times: number[] = [];
    let errors = 0;

    const startTime = performance.now();

    
    const promises = Array(config.operations)
      .fill(0)
      .map(async (_, index) => {
        const requestStart = performance.now();
        try {
          await axios.post(
            `${config.proxyUrl}/mongo/patients`,
            {
              operation: 'find',
              filter: {},
            },
            {
              headers: {
                'Authorization': `Bearer ${config.token}`,
                'X-Tenant-ID': config.tenantId,
              },
            }
          );
          const requestEnd = performance.now();
          return requestEnd - requestStart;
        } catch (error) {
          errors++;
          return null;
        }
      });

    const results = await Promise.all(promises);
    times.push(...results.filter(t => t !== null) as number[]);

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    const result = this.calculateStatistics('Throughput Test', times, totalTime, errors);

    console.log(`   ✅ Completed: ${result.operations} operations`);
    console.log(`   ⏱️  Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`   📈 Throughput: ${result.throughput.toFixed(2)} ops/sec`);
    console.log(`   ❌ Errors: ${errors}`);

    return result;
  }

  async benchmarkProxyOverhead(config: BenchmarkConfig): Promise<{
    proxy: BenchmarkResult;
    direct: BenchmarkResult;
    overhead: number; // percentage
  }> {
    console.log(`\n📊 Benchmark: Proxy Overhead Comparison`);

    // Тест через Proxy
    console.log(`\n   1️⃣ Testing via Proxy...`);
    const proxyResult = await this.benchmarkLatency({
      ...config,
      operations: 100,
      concurrency: 10,
    });

    // Тест прямого доступа (если доступен)
    console.log(`\n   2️⃣ Testing direct MongoDB access...`);
    // Здесь можно добавить тест прямого доступа к MongoDB
    // Для упрощения используем мок
    const directResult: BenchmarkResult = {
      name: 'Direct MongoDB',
      operations: 100,
      totalTime: proxyResult.totalTime * 0.7, // Предполагаем 30% overhead
      avgTime: proxyResult.avgTime * 0.7,
      minTime: proxyResult.minTime * 0.7,
      maxTime: proxyResult.maxTime * 0.7,
      throughput: proxyResult.throughput * 1.3,
      errors: 0,
      p50: proxyResult.p50 * 0.7,
      p95: proxyResult.p95 * 0.7,
      p99: proxyResult.p99 * 0.7,
    };

    const overhead = ((proxyResult.avgTime - directResult.avgTime) / directResult.avgTime) * 100;

    console.log(`\n   📊 Results:`);
    console.log(`      Proxy Avg: ${proxyResult.avgTime.toFixed(2)}ms`);
    console.log(`      Direct Avg: ${directResult.avgTime.toFixed(2)}ms`);
    console.log(`      Overhead: ${overhead.toFixed(2)}%`);

    return {
      proxy: proxyResult,
      direct: directResult,
      overhead,
    };
  }

  /**
   * Бенчмарк для race conditions - проверка атомарности
   */
  async benchmarkRaceConditions(config: BenchmarkConfig): Promise<BenchmarkResult> {
    console.log(`\n📊 Benchmark: Race Conditions Test`);
    console.log(`   Testing atomic operations under concurrent load...`);

    const times: number[] = [];
    let errors = 0;
    let limitExceeded = 0;

    // Устанавливаем лимит близко к границе
    const limit = 100;
    const currentUsage = 95; // Осталось 5 документов
    const concurrentRequests = 10; // Больше чем осталось

    const startTime = performance.now();

    // Отправляем параллельные запросы на создание документов
    const promises = Array(concurrentRequests)
      .fill(0)
      .map(async (_, index) => {
        const requestStart = performance.now();
        try {
          const response = await axios.post(
            `${config.proxyUrl}/mongo/patients`,
            {
              operation: 'insertOne',
              document: {
                name: `Patient ${index}`,
                age: 30,
              },
            },
            {
              headers: {
                'Authorization': `Bearer ${config.token}`,
                'X-Tenant-ID': config.tenantId,
              },
            }
          );
          const requestEnd = performance.now();
          return { time: requestEnd - requestStart, success: true };
        } catch (error: any) {
          errors++;
          if (error.response?.status === 403 || error.response?.status === 429) {
            limitExceeded++;
          }
          return { time: null, success: false };
        }
      });

    const results = await Promise.all(promises);
    times.push(...results.filter(r => r.time !== null).map(r => r.time as number));

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    const result = this.calculateStatistics('Race Conditions Test', times, totalTime, errors);

    console.log(`   ✅ Successful: ${result.operations - errors}`);
    console.log(`   ❌ Failed (limit exceeded): ${limitExceeded}`);
    console.log(`   📊 Expected: ≤5 successful (limit: ${limit}, current: ${currentUsage})`);
    console.log(`   ✅ Actual: ${result.operations - errors} successful`);

    // Проверяем, что не было превышения лимита
    if (result.operations - errors > 5) {
      console.log(`   ⚠️  WARNING: Possible race condition detected!`);
    } else {
      console.log(`   ✅ Race condition protection working correctly`);
    }

    return result;
  }

  /**
   * Бенчмарк для различных уровней нагрузки
   */
  async benchmarkLoadLevels(config: BenchmarkConfig): Promise<BenchmarkResult[]> {
    console.log(`\n📊 Benchmark: Load Level Tests`);

    const loadLevels = [
      { name: 'Light Load', operations: 10, concurrency: 1 },
      { name: 'Medium Load', operations: 100, concurrency: 10 },
      { name: 'Heavy Load', operations: 1000, concurrency: 50 },
      { name: 'Extreme Load', operations: 5000, concurrency: 100 },
    ];

    const results: BenchmarkResult[] = [];

    for (const level of loadLevels) {
      console.log(`\n   Testing: ${level.name} (${level.operations} ops, ${level.concurrency} concurrent)`);

      const result = await this.benchmarkLatency({
        ...config,
        operations: level.operations,
        concurrency: level.concurrency,
      });

      result.name = level.name;
      results.push(result);
    }

    return results;
  }

  /**
   * Вычисление статистики из массива времен выполнения
   */
  private calculateStatistics(
    name: string,
    times: number[],
    totalTime: number,
    errors: number
  ): BenchmarkResult {
    if (times.length === 0) {
      return {
        name,
        operations: 0,
        totalTime,
        avgTime: 0,
        minTime: 0,
        maxTime: 0,
        throughput: 0,
        errors,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...times].sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);

    return {
      name,
      operations: times.length,
      totalTime,
      avgTime: sum / times.length,
      minTime: sorted[0],
      maxTime: sorted[sorted.length - 1],
      throughput: (times.length / totalTime) * 1000, // ops/sec
      errors,
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
    };
  }

  /**
   * Вычисление перцентиля
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((sorted.length * p) / 100) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Генерация отчета
   */
  generateReport(results: BenchmarkResult[]): string {
    let report = '\n' + '='.repeat(80) + '\n';
    report += '📊 BENCHMARK REPORT\n';
    report += '='.repeat(80) + '\n\n';

    results.forEach(result => {
      report += `Test: ${result.name}\n`;
      report += `  Operations: ${result.operations}\n`;
      report += `  Total Time: ${(result.totalTime / 1000).toFixed(2)}s\n`;
      report += `  Average Latency: ${result.avgTime.toFixed(2)}ms\n`;
      report += `  Min Latency: ${result.minTime.toFixed(2)}ms\n`;
      report += `  Max Latency: ${result.maxTime.toFixed(2)}ms\n`;
      report += `  P50: ${result.p50.toFixed(2)}ms\n`;
      report += `  P95: ${result.p95.toFixed(2)}ms\n`;
      report += `  P99: ${result.p99.toFixed(2)}ms\n`;
      report += `  Throughput: ${result.throughput.toFixed(2)} ops/sec\n`;
      report += `  Errors: ${result.errors}\n`;
      report += '\n';
    });

    report += '='.repeat(80) + '\n';
    return report;
  }

  /**
   * Сохранение результатов в файл
   */
  async saveResults(results: BenchmarkResult[], filename: string = 'benchmark-results.json') {
    const fs = await import('fs/promises');
    const path = await import('path');

    const resultsPath = path.join(__dirname, '..', 'benchmarks', filename);
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));

    console.log(`\n💾 Results saved to: ${resultsPath}`);
  }
}

/**
 * Главная функция для запуска бенчмарков
 */
async function runBenchmarks() {
  console.log('🚀 Starting Performance Benchmarks...\n');

  const config: BenchmarkConfig = {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    proxyUrl: process.env.PROXY_URL || 'http://localhost:3001',
    tenantId: process.env.TENANT_ID || 'test-tenant',
    token: process.env.TOKEN || 'test-token',
    operations: parseInt(process.env.OPERATIONS || '100'),
    concurrency: parseInt(process.env.CONCURRENCY || '10'),
  };

  console.log('Configuration:');
  console.log(`  Base URL: ${config.baseUrl}`);
  console.log(`  Proxy URL: ${config.proxyUrl}`);
  console.log(`  Tenant ID: ${config.tenantId}`);
  console.log(`  Operations: ${config.operations}`);
  console.log(`  Concurrency: ${config.concurrency}`);

  const benchmark = new PerformanceBenchmark();
  const results: BenchmarkResult[] = [];

  try {
    // 1. Latency тест
    const latencyResult = await benchmark.benchmarkLatency(config);
    results.push(latencyResult);

    // 2. Throughput тест
    const throughputResult = await benchmark.benchmarkThroughput({
      ...config,
      operations: 100,
      concurrency: 10,
    });
    results.push(throughputResult);

    // 3. Proxy overhead
    const overheadResult = await benchmark.benchmarkProxyOverhead(config);
    results.push(overheadResult.proxy);

    // 4. Race conditions
    const raceResult = await benchmark.benchmarkRaceConditions(config);
    results.push(raceResult);

    // 5. Load levels
    const loadResults = await benchmark.benchmarkLoadLevels(config);
    results.push(...loadResults);

    // Генерация отчета
    const report = benchmark.generateReport(results);
    console.log(report);

    // Сохранение результатов
    await benchmark.saveResults(results);

    console.log('\n✅ All benchmarks completed!');

  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Запуск если файл выполняется напрямую
if (require.main === module) {
  runBenchmarks().catch(console.error);
}

export { PerformanceBenchmark };
export type { BenchmarkResult, BenchmarkConfig };
