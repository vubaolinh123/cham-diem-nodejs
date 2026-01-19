/**
 * Test Total Score Calculation
 * Verifies that totalScore = conductScore + academicScore - violationPenalty
 * 
 * Run: node scripts/tests/testTotalScoreCalc.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000/api';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chamdiem';

// Test account
const TEST_ACCOUNT = {
  email: 'linh123@gmail.com',
  password: 'linkcualinh@123',
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

async function getAuthToken() {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(TEST_ACCOUNT),
  });
  if (!response.ok) throw new Error('Login failed');
  const data = await response.json();
  return data.data.accessToken;
}

async function testTotalScoreCalculation() {
  console.log('\n========================================');
  console.log(`${colors.cyan}TEST: Total Score Calculation${colors.reset}`);
  console.log('========================================\n');

  let passed = true;

  try {
    // Get auth token
    const token = await getAuthToken();
    console.log('✅ Logged in successfully\n');

    // Fetch weekly summaries
    const response = await fetch(`${API_BASE_URL}/weekly-summaries?limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    const summaries = data.data?.weeklySummaries || [];

    if (summaries.length === 0) {
      console.log(`${colors.yellow}⚠️ No summaries found to test${colors.reset}`);
      return true;
    }

    console.log(`Found ${summaries.length} summaries to test\n`);

    for (const summary of summaries) {
      const conductScore = summary.conductScores?.total || 0;
      const academicScore = summary.academicScores?.total || 0;
      const violationPenalty = summary.violations?.totalPenalty || 0;
      const approvedViolations = summary.violations?.approved || 0;
      const actualTotalScore = summary.classification?.totalScore || 0;

      // Expected: conduct + academic - penalty
      const expectedTotalScore = Math.max(0, conductScore + academicScore - violationPenalty);

      console.log(`${colors.cyan}Week ${summary.week?.weekNumber || 'N/A'}, Class ${summary.class?.name || 'N/A'}:${colors.reset}`);
      console.log(`  Điểm Nề Nếp:     ${conductScore}`);
      console.log(`  Điểm Học Tập:    ${academicScore}`);
      console.log(`  Vi Phạm:         ${approvedViolations} (Penalty: -${violationPenalty})`);
      console.log(`  Điểm Tổng:       ${actualTotalScore}`);
      console.log(`  Expected:        ${expectedTotalScore}`);

      if (actualTotalScore === expectedTotalScore) {
        console.log(`  ${colors.green}✅ PASS${colors.reset}\n`);
      } else {
        console.log(`  ${colors.red}❌ FAIL - Expected ${expectedTotalScore}, got ${actualTotalScore}${colors.reset}\n`);
        passed = false;
      }
    }

  } catch (error) {
    console.log(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    passed = false;
  }

  // Result
  console.log('========================================');
  if (passed) {
    console.log(`${colors.green}TEST RESULT: PASSED ✅${colors.reset}`);
  } else {
    console.log(`${colors.red}TEST RESULT: FAILED ❌${colors.reset}`);
  }
  console.log('========================================\n');

  return passed;
}

// Run if executed directly
if (require.main === module) {
  testTotalScoreCalculation()
    .then((passed) => process.exit(passed ? 0 : 1))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { testTotalScoreCalculation };
