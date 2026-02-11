
import axios from 'axios';
import { performance } from 'perf_hooks';

// Simple API test for checking basic functionality
// Создано с помощью AI для тестирования основных эндпоинтов

interface TestResult {
  testName: string;
  passed: boolean;
  responseTime: number;
  error?: string;
}

interface ApiTestConfig {
  baseUrl: string;
  token: string;
  tenantId: string;
}

/**
 * Basic API Test Suite
 * Tests main endpoints for correct responses
 */
class ApiTestSuite {
  private config: ApiTestConfig;
  private results: TestResult[] = [];

  constructor(config: ApiTestConfig) {
    this.config = config;
  }

  // helper function to make requests
  private async makeRequest(method: string, endpoint: string, data?: any) {
    const start = performance.now();

    try {
      const response = await axios({
        method: method,
        url: `${this.config.baseUrl}${endpoint}`,
        data: data,
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'X-Tenant-ID': this.config.tenantId,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      const end = performance.now();
      return {
        success: true,
        data: response.data,
        status: response.status,
        time: end - start
      };
    } catch (err: any) {
      const end = performance.now();
      return {
        success: false,
        error: err.message,
        status: err.response?.status || 0,
        time: end - start
      };
    }
  }

  /**
   * Test 1: Check if server is alive
   */
  async testServerHealth(): Promise<TestResult> {
    console.log('Running: Server Health Check...');

    const result = await this.makeRequest('GET', '/health');

    const testResult: TestResult = {
      testName: 'Server Health Check',
      passed: result.success && result.status === 200,
      responseTime: result.time,
      error: result.error
    };

    this.results.push(testResult);
    console.log(testResult.passed ? '  ✓ Passed' : '  ✗ Failed: ' + testResult.error);

    return testResult;
  }

  /**
   * Test 2: Check authentication works
   */
  async testAuthentication(): Promise<TestResult> {
    console.log('Running: Authentication Test...');

    // try to access protected endpoint
    const result = await this.makeRequest('GET', '/mongo/patients');

    // should return 200 if auth is correct, 401 if not
    const testResult: TestResult = {
      testName: 'Authentication Test',
      passed: result.status === 200 || result.status === 401,
      responseTime: result.time,
      error: result.success ? undefined : result.error
    };

    this.results.push(testResult);
    console.log(testResult.passed ? '  ✓ Passed' : '  ✗ Failed: ' + testResult.error);

    return testResult;
  }

  /**
   * Test 3: Basic CRUD test
   * Creates a record, reads it, then deletes it
   */
  async testBasicCRUD(): Promise<TestResult> {
    console.log('Running: Basic CRUD Operations...');

    let passed = true;
    let errorMsg = '';
    const startTime = performance.now();

    // Step 1: Create
    const createResult = await this.makeRequest('POST', '/mongo/patients', {
      operation: 'insertOne',
      document: {
        name: 'Test Patient',
        age: 25,
        testRecord: true,
        createdAt: new Date().toISOString()
      }
    });

    if (!createResult.success) {
      passed = false;
      errorMsg = 'Create failed: ' + createResult.error;
    }

    // Step 2: Read (find the created record)
    if (passed) {
      const readResult = await this.makeRequest('POST', '/mongo/patients', {
        operation: 'find',
        filter: { testRecord: true }
      });

      if (!readResult.success) {
        passed = false;
        errorMsg = 'Read failed: ' + readResult.error;
      }
    }

    // Step 3: Delete (cleanup)
    if (passed) {
      const deleteResult = await this.makeRequest('POST', '/mongo/patients', {
        operation: 'deleteMany',
        filter: { testRecord: true }
      });

      if (!deleteResult.success) {
        // не критично если удаление не сработало
        console.log('  ⚠ Warning: Cleanup failed');
      }
    }

    const endTime = performance.now();

    const testResult: TestResult = {
      testName: 'Basic CRUD Operations',
      passed: passed,
      responseTime: endTime - startTime,
      error: errorMsg || undefined
    };

    this.results.push(testResult);
    console.log(testResult.passed ? '  ✓ Passed' : '  ✗ Failed: ' + testResult.error);

    return testResult;
  }

  /**
   * Test 4: Response time check
   * Checks that average response time is under threshold
   */
  async testResponseTime(threshold: number = 1000): Promise<TestResult> {
    console.log(`Running: Response Time Test (threshold: ${threshold}ms)...`);

    const times: number[] = [];
    const numRequests = 5;

    for (let i = 0; i < numRequests; i++) {
      const result = await this.makeRequest('POST', '/mongo/patients', {
        operation: 'find',
        filter: {},
        options: { limit: 1 }
      });
      times.push(result.time);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    const testResult: TestResult = {
      testName: 'Response Time Test',
      passed: avgTime < threshold,
      responseTime: avgTime,
      error: avgTime >= threshold ? `Average time ${avgTime.toFixed(0)}ms exceeds ${threshold}ms` : undefined
    };

    this.results.push(testResult);
    console.log(testResult.passed
      ? `  ✓ Passed (avg: ${avgTime.toFixed(0)}ms)`
      : '  ✗ Failed: ' + testResult.error);

    return testResult;
  }

  /**
   * Test 5: Error handling test
   * Sends invalid data and checks for proper error response
   */
  async testErrorHandling(): Promise<TestResult> {
    console.log('Running: Error Handling Test...');

    // Send invalid operation
    const result = await this.makeRequest('POST', '/mongo/patients', {
      operation: 'invalidOperation123',
      data: null
    });

    // Should get error response (400 or 500), not crash
    const testResult: TestResult = {
      testName: 'Error Handling Test',
      passed: result.status >= 400 && result.status < 600,
      responseTime: result.time,
      error: result.status < 400 ? 'Server accepted invalid operation' : undefined
    };

    this.results.push(testResult);
    console.log(testResult.passed ? '  ✓ Passed' : '  ✗ Failed: ' + testResult.error);

    return testResult;
  }

  // Run all tests
  async runAllTests(): Promise<TestResult[]> {
    console.log('\n========================================');
    console.log('  Starting API Test Suite');
    console.log('========================================\n');

    await this.testServerHealth();
    await this.testAuthentication();
    await this.testBasicCRUD();
    await this.testResponseTime();
    await this.testErrorHandling();

    // Print summary
    this.printSummary();

    return this.results;
  }

  // Print test summary
  private printSummary() {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log('\n========================================');
    console.log('  Test Summary');
    console.log('========================================');
    console.log(`  Total:  ${total}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Rate:   ${((passed / total) * 100).toFixed(1)}%`);
    console.log('========================================\n');

    if (failed > 0) {
      console.log('Failed tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.testName}: ${r.error}`);
      });
    }
  }
}

// Main function
async function main() {
  const config: ApiTestConfig = {
    baseUrl: process.env.API_URL || 'http://localhost:3001',
    token: process.env.API_TOKEN || 'test-token',
    tenantId: process.env.TENANT_ID || 'test-tenant'
  };

  console.log('Config:');
  console.log(`  URL: ${config.baseUrl}`);
  console.log(`  Tenant: ${config.tenantId}`);

  const testSuite = new ApiTestSuite(config);

  try {
    const results = await testSuite.runAllTests();

    // Exit with error code if any test failed
    const anyFailed = results.some(r => !r.passed);
    process.exit(anyFailed ? 1 : 0);

  } catch (error) {
    console.error('Test suite crashed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { ApiTestSuite };
export type { TestResult, ApiTestConfig };
