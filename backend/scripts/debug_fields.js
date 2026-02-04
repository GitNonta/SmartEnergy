const influxService = require('../src/services/influxdb');
require('dotenv').config();

async function listFields() {
  try {
    console.log('--- Listing Fields for energy_3phase ---');
    const query = `
      import "influxdata/influxdb/schema"
      schema.measurements(bucket: "${influxService.buckets.raw}")
    `;
    
    // Check fields for energy_3phase last 1h
    const fieldQuery = `
      import "timezone"
      from(bucket: "${influxService.buckets.raw}")
        |> range(start: -1h)
        |> filter(fn: (r) => r["_measurement"] == "energy_3phase")
        |> keep(columns: ["_field"])
        |> unique(column: "_field")
        |> limit(n: 20)
    `;
    
    const rows = await influxService.queryApi.collectRows(fieldQuery);
    console.log('Fields:', rows.map(r => r._field));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

listFields();
