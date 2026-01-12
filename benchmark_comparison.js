/**
 * Comparative Test: Raw Data vs Aggregated Data
 * Measures: Response size, Query time, Token estimation
 */
require('dotenv').config({ path: './backend/.env' });

const influxService = require('./backend/src/services/influxdb');

// Token estimation (rough: 1 token ≈ 4 characters for English, 2 for Thai)
function estimateTokens(obj) {
  const str = JSON.stringify(obj);
  return Math.ceil(str.length / 3.5);
}

async function runBenchmark() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║       📊 COMPARATIVE TEST: Raw Data vs Aggregated Data           ║');
  console.log('║                Smart Energy Monitoring System                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('');

  const results = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  // ========================================
  // Test 1: Today's Data
  // ========================================
  console.log('┌──────────────────────────────────────────────────────────────────┐');
  console.log('│ Test 1: TODAY\'s Data Comparison                                  │');
  console.log('└──────────────────────────────────────────────────────────────────┘');

  // Raw data approach (simulated by querying hourly data)
  console.log('\n📥 Method A: Raw Data Query...');
  const rawStartTime = Date.now();
  let rawData = null;
  try {
    rawData = await influxService.queryDailyConsumption('AI205');
  } catch (e) {
    rawData = { error: e.message };
  }
  const rawQueryTime = Date.now() - rawStartTime;
  const rawSize = JSON.stringify(rawData).length;
  const rawTokens = estimateTokens(rawData);

  console.log(`   ⏱  Query Time: ${rawQueryTime}ms`);
  console.log(`   📦 Response Size: ${rawSize} bytes`);
  console.log(`   🎫 Est. Tokens: ${rawTokens}`);

  // Aggregated data approach
  console.log('\n📊 Method B: Aggregated Data (getDataSummaryForAI)...');
  const aggStartTime = Date.now();
  let aggData = null;
  try {
    aggData = await influxService.getDataSummaryForAI('today', 'AI205');
  } catch (e) {
    aggData = { error: e.message };
  }
  const aggQueryTime = Date.now() - aggStartTime;
  const aggSize = JSON.stringify(aggData).length;
  const aggTokens = estimateTokens(aggData);

  console.log(`   ⏱  Query Time: ${aggQueryTime}ms`);
  console.log(`   📦 Response Size: ${aggSize} bytes`);
  console.log(`   🎫 Est. Tokens: ${aggTokens}`);

  // Comparison
  const sizeReduction = ((rawSize - aggSize) / rawSize * 100).toFixed(1);
  const tokenReduction = ((rawTokens - aggTokens) / rawTokens * 100).toFixed(1);
  const speedup = (rawQueryTime / aggQueryTime).toFixed(2);

  console.log('\n📈 Comparison:');
  console.log(`   Size Reduction: ${sizeReduction}% (${rawSize} → ${aggSize} bytes)`);
  console.log(`   Token Reduction: ${tokenReduction}% (${rawTokens} → ${aggTokens} tokens)`);
  console.log(`   Speed: ${speedup}x ${aggQueryTime < rawQueryTime ? 'faster' : 'slower'}`);

  results.tests.push({
    name: 'Today\'s Data',
    raw: { queryTimeMs: rawQueryTime, sizeBytes: rawSize, tokens: rawTokens },
    aggregated: { queryTimeMs: aggQueryTime, sizeBytes: aggSize, tokens: aggTokens },
    comparison: { sizeReductionPct: parseFloat(sizeReduction), tokenReductionPct: parseFloat(tokenReduction), speedup: parseFloat(speedup) }
  });

  // ========================================
  // Test 2: Weekly Data
  // ========================================
  console.log('\n┌──────────────────────────────────────────────────────────────────┐');
  console.log('│ Test 2: WEEKLY Data Comparison                                   │');
  console.log('└──────────────────────────────────────────────────────────────────┘');

  // Raw weekly (using range summary with all chart data)
  console.log('\n📥 Method A: Raw Data Query (7 days)...');
  const rawWeekStart = Date.now();
  let rawWeekData = null;
  try {
    rawWeekData = await influxService.getRangeSummary('AI205', '-7d', 'now()', 'hour', 4.0);
  } catch (e) {
    rawWeekData = { error: e.message };
  }
  const rawWeekTime = Date.now() - rawWeekStart;
  const rawWeekSize = JSON.stringify(rawWeekData).length;
  const rawWeekTokens = estimateTokens(rawWeekData);

  console.log(`   ⏱  Query Time: ${rawWeekTime}ms`);
  console.log(`   📦 Response Size: ${rawWeekSize} bytes`);
  console.log(`   🎫 Est. Tokens: ${rawWeekTokens}`);
  console.log(`   📊 Chart Data Points: ${rawWeekData?.chartDataCount || 0}`);

  // Aggregated weekly
  console.log('\n📊 Method B: Aggregated Data (week)...');
  const aggWeekStart = Date.now();
  let aggWeekData = null;
  try {
    aggWeekData = await influxService.getDataSummaryForAI('week', 'AI205');
  } catch (e) {
    aggWeekData = { error: e.message };
  }
  const aggWeekTime = Date.now() - aggWeekStart;
  const aggWeekSize = JSON.stringify(aggWeekData).length;
  const aggWeekTokens = estimateTokens(aggWeekData);

  console.log(`   ⏱  Query Time: ${aggWeekTime}ms`);
  console.log(`   📦 Response Size: ${aggWeekSize} bytes`);
  console.log(`   🎫 Est. Tokens: ${aggWeekTokens}`);

  const weekSizeReduction = ((rawWeekSize - aggWeekSize) / rawWeekSize * 100).toFixed(1);
  const weekTokenReduction = ((rawWeekTokens - aggWeekTokens) / rawWeekTokens * 100).toFixed(1);
  const weekSpeedup = (rawWeekTime / aggWeekTime).toFixed(2);

  console.log('\n📈 Comparison:');
  console.log(`   Size Reduction: ${weekSizeReduction}% (${rawWeekSize} → ${aggWeekSize} bytes)`);
  console.log(`   Token Reduction: ${weekTokenReduction}% (${rawWeekTokens} → ${aggWeekTokens} tokens)`);
  console.log(`   Speed: ${weekSpeedup}x ${aggWeekTime < rawWeekTime ? 'faster' : 'slower'}`);

  results.tests.push({
    name: 'Weekly Data',
    raw: { queryTimeMs: rawWeekTime, sizeBytes: rawWeekSize, tokens: rawWeekTokens },
    aggregated: { queryTimeMs: aggWeekTime, sizeBytes: aggWeekSize, tokens: aggWeekTokens },
    comparison: { sizeReductionPct: parseFloat(weekSizeReduction), tokenReductionPct: parseFloat(weekTokenReduction), speedup: parseFloat(weekSpeedup) }
  });

  // ========================================
  // Summary
  // ========================================
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                        📋 TEST SUMMARY                           ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  console.log('║ Metric              │ Today        │ Weekly       │ Avg          ║');
  console.log('╠══════════════════════════════════════════════════════════════════╣');
  
  const avgSizeReduction = ((parseFloat(sizeReduction) + parseFloat(weekSizeReduction)) / 2).toFixed(1);
  const avgTokenReduction = ((parseFloat(tokenReduction) + parseFloat(weekTokenReduction)) / 2).toFixed(1);
  const avgSpeedup = ((parseFloat(speedup) + parseFloat(weekSpeedup)) / 2).toFixed(2);
  
  console.log(`║ Size Reduction      │ ${sizeReduction.padStart(10)}% │ ${weekSizeReduction.padStart(10)}% │ ${avgSizeReduction.padStart(10)}% ║`);
  console.log(`║ Token Reduction     │ ${tokenReduction.padStart(10)}% │ ${weekTokenReduction.padStart(10)}% │ ${avgTokenReduction.padStart(10)}% ║`);
  console.log(`║ Query Speedup       │ ${speedup.padStart(10)}x │ ${weekSpeedup.padStart(10)}x │ ${avgSpeedup.padStart(10)}x ║`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  console.log('\n✅ Benchmark complete!\n');

  // Save results to file
  const fs = require('fs');
  const reportPath = './benchmark_results.json';
  results.summary = {
    avgSizeReductionPct: parseFloat(avgSizeReduction),
    avgTokenReductionPct: parseFloat(avgTokenReduction),
    avgSpeedup: parseFloat(avgSpeedup)
  };
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📁 Results saved to: ${reportPath}`);

  process.exit(0);
}

runBenchmark().catch(err => {
  console.error('❌ Benchmark failed:', err);
  process.exit(1);
});
