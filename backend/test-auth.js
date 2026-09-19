/**
 * Authentication System Test Script
 * Run this to test registration, login, and token management
 */

const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

// Test data
const testUser = {
  username: 'testuser',
  email: 'test@jishora.com',
  password: 'Test123456'
};

let authToken = '';
let refreshToken = '';

// Helper function to log results
function log(message, data = null) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✓ ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
  console.log('='.repeat(60));
}

function logError(message, error) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✗ ${message}`);
  if (error.response) {
    console.log('Status:', error.response.status);
    console.log('Data:', error.response.data);
  } else {
    console.log('Error:', error.message);
  }
  console.log('='.repeat(60));
}

// Test functions
async function testHealthCheck() {
  try {
    const response = await axios.get(`${API_URL.replace('/api', '')}/health`);
    log('Health Check Passed', response.data);
    return true;
  } catch (error) {
    logError('Health Check Failed', error);
    return false;
  }
}

async function testRegister() {
  try {
    const response = await axios.post(`${API_URL}/auth/register`, testUser);
    log('Registration Successful', response.data);
    authToken = response.data.data.token;
    refreshToken = response.data.data.refreshToken;
    return true;
  } catch (error) {
    logError('Registration Failed', error);
    return false;
  }
}

async function testLogin() {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    log('Login Successful', response.data);
    authToken = response.data.data.token;
    refreshToken = response.data.data.refreshToken;
    return true;
  } catch (error) {
    logError('Login Failed', error);
    return false;
  }
}

async function testGetProfile() {
  try {
    const response = await axios.get(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    log('Get Profile Successful', response.data);
    return true;
  } catch (error) {
    logError('Get Profile Failed', error);
    return false;
  }
}

async function testRefreshToken() {
  try {
    const response = await axios.post(`${API_URL}/auth/refresh`, {
      refreshToken
    });
    log('Token Refresh Successful', response.data);
    authToken = response.data.data.token;
    return true;
  } catch (error) {
    logError('Token Refresh Failed', error);
    return false;
  }
}

async function testChangePassword() {
  try {
    const response = await axios.post(
      `${API_URL}/auth/change-password`,
      {
        currentPassword: testUser.password,
        newPassword: 'NewTest123456'
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    log('Password Change Successful', response.data);
    testUser.password = 'NewTest123456';
    return true;
  } catch (error) {
    logError('Password Change Failed', error);
    return false;
  }
}

async function testLogout() {
  try {
    const response = await axios.post(
      `${API_URL}/auth/logout`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }
    );
    log('Logout Successful', response.data);
    return true;
  } catch (error) {
    logError('Logout Failed', error);
    return false;
  }
}

async function testInvalidToken() {
  try {
    await axios.get(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': 'Bearer invalid_token_12345'
      }
    });
    logError('Invalid Token Test Failed', new Error('Should have been rejected'));
    return false;
  } catch (error) {
    if (error.response && error.response.status === 401) {
      log('Invalid Token Test Passed - Correctly rejected');
      return true;
    }
    logError('Invalid Token Test Failed', error);
    return false;
  }
}

async function testDuplicateRegistration() {
  try {
    await axios.post(`${API_URL}/auth/register`, testUser);
    logError('Duplicate Registration Test Failed', new Error('Should have been rejected'));
    return false;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      log('Duplicate Registration Test Passed - Correctly rejected');
      return true;
    }
    logError('Duplicate Registration Test Failed', error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n🚀 Starting Authentication System Tests...\n');
  console.log('Make sure the backend server is running on http://localhost:5000\n');

  const tests = [
    { name: 'Health Check', fn: testHealthCheck },
    { name: 'User Registration', fn: testRegister },
    { name: 'Duplicate Registration Prevention', fn: testDuplicateRegistration },
    { name: 'User Login', fn: testLogin },
    { name: 'Get User Profile', fn: testGetProfile },
    { name: 'Invalid Token Rejection', fn: testInvalidToken },
    { name: 'Token Refresh', fn: testRefreshToken },
    { name: 'Change Password', fn: testChangePassword },
    { name: 'Login with New Password', fn: testLogin },
    { name: 'User Logout', fn: testLogout }
  ];

  const results = [];

  for (const test of tests) {
    console.log(`\n📋 Running: ${test.name}...`);
    const passed = await test.fn();
    results.push({ name: test.name, passed });
    
    // Add delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(result => {
    const icon = result.passed ? '✓' : '✗';
    const status = result.passed ? 'PASSED' : 'FAILED';
    console.log(`${icon} ${result.name}: ${status}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${passed}/${total} tests passed`);
  console.log('='.repeat(60) + '\n');

  if (passed === total) {
    console.log('🎉 All tests passed! Authentication system is working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Please check the errors above.\n');
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Fatal error running tests:', error.message);
  process.exit(1);
});
