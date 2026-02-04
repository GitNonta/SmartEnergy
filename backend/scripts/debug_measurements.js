const influxService = require('../src/services/influxdb');
require('dotenv').config();

async function listMeasurements() {
  try {
    console.log('--- Listing Measurements ---');
    const query = `
      import "influxdata/influxdb/schema"
      schema.measurements(bucket: "${influxService.buckets.raw}")
    `;
    const rows = await influxService.queryApi.collectRows(query);
    console.log('Measurements:', rows.map(r => r._value));

    // Check last 5 points of ANY measurement
    const dataQuery = `
      from(bucket: "${influxService.buckets.raw}")
      |> range(start: -10m)
      |> limit(n: 5)
    `;
    // const dataRows = await influxService.queryApi.collectRows(dataQuery);
    // console.log('Sample Data:', dataRows);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

listMeasurements();
