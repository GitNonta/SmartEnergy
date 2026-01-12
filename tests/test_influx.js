/**
 * InfluxDB + Backend Test Suite (Node.js)
 * Smart Energy Monitoring System
 * 
 * Usage:
 *   npm install @influxdata/influxdb-client node-fetch
 *   INFLUX_TOKEN=your-token node test_influx.js
 * 
 * Required ENV:
 *   INFLUX_URL    - InfluxDB URL (default: http://127.0.0.1:8086)
 *   INFLUX_ORG    - InfluxDB Organization (default: Ennergy)
 *   INFLUX_TOKEN  - InfluxDB API Token
 *   BACKEND_URL   - Backend URL (default: http://localhost:3001)
 */

const { InfluxDB, Point } = require('@influxdata/influxdb-client');

// Configuration
const config = {
  influxUrl: process.env.INFLUX_URL || 'http://127.0.0.1:8086',
  influxOrg: process.env.INFLUX_ORG || 'Ennergy',
  influxToken: process.env.INFLUX_TOKEN || '',
  rawBucket: 'AI205_raw',
  hourlyBucket: 'AI205_hourly',
  dailyBucket: 'AI205_daily',
  deviceId: 'AI205',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:3001'
};

// Colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

// Test results
let passed = 0;
let failed = 0;

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function testResult(success, name) {
  if (success) {
    log('green', `✅ PASS: ${name}`);
    passed++;
  } else {
    log('red', `❌ FAIL: ${name}`);
    failed++;
  }
}

// ============================================
// TESTS
// ============================================

async function testInfluxHealth() {
  try {
    const response = await fetch(`${config.influxUrl}/health`, {
      headers: { 'Authorization': `Token ${config.influxToken}` }
    });
    const data = await response.json();
    testResult(data.status === 'pass', 'InfluxDB Health Check');
  } catch (error) {
    testResult(false, `InfluxDB Health Check (${error.message})`);
  }
}

async function testWriteRaw() {
  try {
    const client = new InfluxDB({ url: config.influxUrl, token: config.influxToken });
    const writeApi = client.getWriteApi(config.influxOrg, config.rawBucket, 'ns');
    
    const point = new Point('energy_3phase')
      .tag('device_id', config.deviceId)
      .floatField('energy_total', 99999.123 + Math.random())
      .floatField('power_active', 1500 + Math.random() * 500);
    
    writeApi.writePoint(point);
    await writeApi.close();
    
    testResult(true, 'Write to Raw Bucket');
  } catch (error) {
    testResult(false, `Write to Raw Bucket (${error.message})`);
  }
}

async function testQueryRaw() {
  try {
    const client = new InfluxDB({ url: config.influxUrl, token: config.influxToken });
    const queryApi = client.getQueryApi(config.influxOrg);
    
    const query = `from(bucket:"${config.rawBucket}") 
      |> range(start: -5m) 
      |> filter(fn:(r) => r._measurement == "energy_3phase" and r.device_id == "${config.deviceId}") 
      |> last()`;
    
    const rows = [];
    await queryApi.collectRows(query).then(result => rows.push(...result));
    
    testResult(rows.length > 0, `Query Raw Bucket (${rows.length} rows)`);
  } catch (error) {
    testResult(false, `Query Raw Bucket (${error.message})`);
  }
}

async function testQueryHourly() {
  try {
    const client = new InfluxDB({ url: config.influxUrl, token: config.influxToken });
    const queryApi = client.getQueryApi(config.influxOrg);
    
    const query = `from(bucket:"${config.hourlyBucket}") 
      |> range(start: -24h) 
      |> filter(fn:(r) => r._field == "energy_total") 
      |> count()`;
    
    const rows = [];
    await queryApi.collectRows(query).then(result => rows.push(...result));
    
    const count = rows.length > 0 ? rows[0]._value : 0;
    testResult(true, `Query Hourly Bucket (${count} data points)`);
  } catch (error) {
    testResult(false, `Query Hourly Bucket (${error.message})`);
  }
}

async function testNoDuplicates() {
  try {
    const client = new InfluxDB({ url: config.influxUrl, token: config.influxToken });
    const queryApi = client.getQueryApi(config.influxOrg);
    
    const query = `from(bucket:"${config.hourlyBucket}") 
      |> range(start: -24h) 
      |> filter(fn:(r) => r._field == "energy_total") 
      |> aggregateWindow(every: 1h, fn: count) 
      |> filter(fn:(r) => r._value > 1) 
      |> count()`;
    
    const rows = [];
    await queryApi.collectRows(query).then(result => rows.push(...result));
    
    const dupCount = rows.length > 0 ? rows[0]._value : 0;
    testResult(dupCount === 0, `No Duplicates Check (${dupCount} duplicates)`);
  } catch (error) {
    testResult(false, `No Duplicates Check (${error.message})`);
  }
}

async function testNoNegatives() {
  try {
    const client = new InfluxDB({ url: config.influxUrl, token: config.influxToken });
    const queryApi = client.getQueryApi(config.influxOrg);
    
    const query = `from(bucket:"${config.hourlyBucket}") 
      |> range(start: -7d) 
      |> filter(fn:(r) => r._field == "energy_total") 
      |> filter(fn:(r) => r._value < 0.0) 
      |> count()`;
    
    const rows = [];
    await queryApi.collectRows(query).then(result => rows.push(...result));
    
    const negCount = rows.length > 0 ? rows[0]._value : 0;
    testResult(negCount === 0, `No Negative Values (${negCount} negatives)`);
  } catch (error) {
    testResult(false, `No Negative Values (${error.message})`);
  }
}

async function testBackendHealth() {
  try {
    const response = await fetch(`${config.backendUrl}/health`);
    const data = await response.json();
    testResult(data.success === true || response.ok, 'Backend Health Check');
  } catch (error) {
    testResult(false, `Backend Health Check (${error.message})`);
  }
}

async function testBackendEnergyApi() {
  try {
    const response = await fetch(`${config.backendUrl}/api/energy/state`);
    const data = await response.json();
    testResult(data.success !== undefined, 'Backend Energy State API');
  } catch (error) {
    testResult(false, `Backend Energy State API (${error.message})`);
  }
}

async function testBackendIntegrityApi() {
  try {
    const response = await fetch(`${config.backendUrl}/api/data/integrity-check`);
    const data = await response.json();
    testResult(data.success !== undefined, 'Backend Integrity Check API');
  } catch (error) {
    testResult(false, `Backend Integrity Check API (${error.message})`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('');
  console.log('============================================');
  log('cyan', '🔬 InfluxDB + Backend Test Suite (Node.js)');
  console.log('============================================');
  console.log(`InfluxDB: ${config.influxUrl}`);
  console.log(`Org: ${config.influxOrg}`);
  console.log(`Backend: ${config.backendUrl}`);
  console.log('============================================');
  console.log('');

  if (!config.influxToken) {
    log('red', '❌ ERROR: INFLUX_TOKEN is not set');
    process.exit(1);
  }

  // Run tests
  await testInfluxHealth();
  await testWriteRaw();
  await testQueryRaw();
  await testQueryHourly();
  await testNoDuplicates();
  await testNoNegatives();
  await testBackendHealth();
  await testBackendEnergyApi();
  await testBackendIntegrityApi();

  // Summary
  console.log('');
  console.log('============================================');
  log('cyan', '📊 Test Summary');
  console.log('============================================');
  log('green', `Passed: ${passed}`);
  log('red', `Failed: ${failed}`);
  console.log('');

  if (failed === 0) {
    log('green', '🎉 All tests passed! System is healthy.');
  } else {
    log('yellow', '⚠️ Some tests failed. Check the output above.');
    process.exit(1);
  }
}

main().catch(console.error);
