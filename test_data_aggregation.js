/**
 * Test Script for AI Data Aggregation Feature
 * Tests: /api/summary/statistics endpoint
 */
require('dotenv').config({ path: './backend/.env' });

const influxService = require('./backend/src/services/influxdb');

async function testDataSummary() {
  console.log('========================================');
  console.log('🧪 Testing Data Aggregation Functions');
  console.log('========================================\n');

  // Test 1: Today's data
  console.log('📊 Test 1: getDataSummaryForAI("today")');
  console.log('----------------------------------------');
  try {
    const result = await influxService.getDataSummaryForAI('today', 'AI205');
    if (result.success) {
      console.log('✅ SUCCESS\n');
      console.log('Power:', result.power);
      console.log('Voltage:', result.voltage);
      console.log('Current:', result.current);
      console.log('Power Factor:', result.powerFactor);
      console.log('Energy:', result.energy);
      console.log('Insights:', result.insights);
      console.log('Peak Time:', result.peakTime);
    } else {
      console.log('❌ ERROR:', result.error);
    }
  } catch (error) {
    console.log('❌ EXCEPTION:', error.message);
  }

  console.log('\n========================================');

  // Test 2: Week data
  console.log('📊 Test 2: getDataSummaryForAI("week")');
  console.log('----------------------------------------');
  try {
    const result = await influxService.getDataSummaryForAI('week', 'AI205');
    if (result.success) {
      console.log('✅ SUCCESS');
      console.log('Energy total (7 days):', result.energy.total, result.energy.unit);
      console.log('Power avg:', result.power.avg, result.power.unit);
      console.log('Insights:', result.insights);
    } else {
      console.log('❌ ERROR:', result.error);
    }
  } catch (error) {
    console.log('❌ EXCEPTION:', error.message);
  }

  console.log('\n========================================');
  console.log('🏁 Test Complete');
  console.log('========================================');

  process.exit(0);
}

testDataSummary();
