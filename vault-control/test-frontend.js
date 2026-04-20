#!/usr/bin/env node

import http from 'http';

const tests = [
  {
    name: 'Frontend Loads (HTML)',
    path: '/',
    expectedStatus: 200,
    expectedContent: 'Vault Control'
  },
  {
    name: 'API: System Health',
    path: '/api/system/health',
    expectedStatus: 200,
    expectedJson: true
  },
  {
    name: 'API: System Stats',
    path: '/api/system/stats',
    expectedStatus: 200,
    expectedJson: true
  },
  {
    name: 'API: Approvals',
    path: '/api/approvals',
    expectedStatus: 200,
    expectedJson: true
  },
  {
    name: 'API: Emails',
    path: '/api/emails',
    expectedStatus: 200,
    expectedJson: true
  },
  {
    name: 'API: Social Media',
    path: '/api/social',
    expectedStatus: 200,
    expectedJson: true
  },
  {
    name: 'API: Logs',
    path: '/api/logs',
    expectedStatus: 200,
    expectedJson: true
  },
  {
    name: 'API: Drafts',
    path: '/api/drafts',
    expectedStatus: 200,
    expectedJson: true
  },
];

let passed = 0;
let failed = 0;

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

async function runTests() {
  console.log('\n========================================');
  console.log('VAULT-CONTROL FRONTEND TEST SUITE');
  console.log('========================================\n');

  for (const test of tests) {
    try {
      const response = await makeRequest(test.path);
      const isValid = response.status === test.expectedStatus;

      let contentCheck = true;
      if (test.expectedContent) {
        contentCheck = response.data.includes(test.expectedContent);
      }
      if (test.expectedJson) {
        try {
          JSON.parse(response.data);
        } catch {
          contentCheck = false;
        }
      }

      if (isValid && contentCheck) {
        console.log(`✅ PASS: ${test.name}`);
        passed++;
      } else {
        console.log(`❌ FAIL: ${test.name}`);
        console.log(`   Expected status: ${test.expectedStatus}, Got: ${response.status}`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ FAIL: ${test.name}`);
      console.log(`   Error: ${err.message}`);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
