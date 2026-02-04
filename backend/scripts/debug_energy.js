const influxService = require('../src/services/influxdb');
require('dotenv').config();

const TIMEZONE = process.env.TIMEZONE || 'Asia/Bangkok';

async function debugEnergyData() {
  try {
    console.log('--- Debugging Energy Data ---');
    console.log(`Bucket: ${influxService.buckets.raw}`);
    
    // Check last 10 points
    const query = `
      import "timezone"
      option location = timezone.location(name: "${TIMEZONE}")
      from(bucket: "${influxService.buckets.raw}")
        |> range(start: -1h)
        |> filter(fn: (r) => r["_measurement"] == "energy_data")
        |> filter(fn: (r) => r["_field"] == "energy_total")
        |> limit(n: 10)
    `;
    
    console.log('Querying last 10 points...');
    const rows = await influxService.queryApi.collectRows(query);
    console.log(`Rows: ${rows.length}`);
    if (rows.length > 0) {
      rows.forEach(r => console.log(`${r._time}: ${r._value}`));
    } else {
        console.log('No data found in last 1h.');
    }

    // Check spread for today
    const spreadQuery = `
      import "timezone"
      option location = timezone.location(name: "${TIMEZONE}")
      from(bucket: "${influxService.buckets.raw}")
        |> range(start: today())
        |> filter(fn: (r) => r["_measurement"] == "energy_data")
        |> filter(fn: (r) => r["_field"] == "energy_total")
        |> spread()
    `;
    console.log('Querying spread for today...');
    const spreadRows = await influxService.queryApi.collectRows(spreadQuery);
    if (spreadRows.length > 0) {
        console.log(`Spread today: ${spreadRows[0]._value}`);
    } else {
        console.log('No spread data for today.');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

debugEnergyData();
