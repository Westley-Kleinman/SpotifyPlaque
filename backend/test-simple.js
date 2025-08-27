// Simple test script - run with: node test-simple.js
const http = require('http');

function testAPI() {
  const data = JSON.stringify({
    url: 'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh'
  });

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/spotify-metadata',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    
    let responseData = '';
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      console.log('Response:', JSON.parse(responseData));
    });
  });

  req.on('error', (error) => {
    console.error('Error:', error);
  });

  req.write(data);
  req.end();
}

// Test health first
const healthReq = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/health',
  method: 'GET'
}, (res) => {
  console.log('Health check status:', res.statusCode);
  res.on('data', (data) => {
    console.log('Health response:', JSON.parse(data));
    // Test the main endpoint after health check
    setTimeout(testAPI, 100);
  });
});

healthReq.end();
