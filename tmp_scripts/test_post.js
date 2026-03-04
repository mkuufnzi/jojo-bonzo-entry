const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3002, // Dev port
  path: '/dashboard/recovery/clusters/move',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // We would need a session cookie. This will likely return 401 Unauthorized if no session.
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => console.log('BODY:', data));
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(JSON.stringify({ 
  customerId: '5f873a7f-e8bb-4dfb-a693-71a8768484d2', 
  clusterId: 'invalid-or-valid' 
}));
req.end();
