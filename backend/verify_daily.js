const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/energy/daily-realtime',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('--- API RESPONSE ---');
      console.log('Success:', json.success);
      console.log('Daily Value:', json.daily);
      console.log('Method:', json.calculationMethod);
      console.log('Source:', json.source);
      console.log('--------------------');
      console.log('Raw:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Error parsing JSON:', e.message);
      console.log('Raw Data:', data);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
