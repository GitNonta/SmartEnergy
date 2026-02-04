const influxService = require('../src/services/influxdb');
require('dotenv').config();

async function checkValues() {
  try {
    console.log('--- Checking Energy Values ---');
    const query = `
      import "timezone"
      from(bucket: "${influxService.buckets.raw}")
        |> range(start: -1h)
        |> filter(fn: (r) => r["_measurement"] == "energy_3phase")
        |> filter(fn: (r) => r["_field"] == "energy_total" or r["_field"] == "energy_total_kwh")
        |> limit(n: 5)
    `;
    
    const rows = await influxService.queryApi.collectRows(query);
    rows.forEach(r => console.log(`${r._time} [${r._field}]: ${r._value}`));
    
    // Check spread for today with energy_3phase
    const spreadQuery = `
      import "timezone"
      option location = timezone.location(name: "Asia/Bangkok")
      from(bucket: "${influxService.buckets.raw}")
        |> range(start: today())
        |> filter(fn: (r) => r["_measurement"] == "energy_3phase")
        |> filter(fn: (r) => r["_field"] == "energy_total")
        |> spread()
    `;
    const spreadRows = await influxService.queryApi.collectRows(spreadQuery);
    if (spreadRows.length > 0) console.log(`Spread today (energy_total): ${spreadRows[0]._value}`);
    else console.log('No spread today for energy_total');

  } catch (error) {
    console.error('Error:', error);
  }
}

checkValues();
