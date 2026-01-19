/**
 * Recalculate All Weekly Summaries
 * Run this script to update all existing WeeklySummary records with the new calculation logic
 * 
 * Run: node scripts/recalculateAllSummaries.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const WeeklySummary = require('../models/WeeklySummary');
const { updateWeeklySummary } = require('../utils/weeklySummaryHelper');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chamdiem';

async function recalculateAllSummaries() {
  console.log('\n========================================');
  console.log('RECALCULATE ALL WEEKLY SUMMARIES');
  console.log('========================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('📦 Connected to MongoDB\n');

    // Get all existing summaries
    const summaries = await WeeklySummary.find({}).select('week class');
    console.log(`Found ${summaries.length} WeeklySummary records to recalculate\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      try {
        const result = await updateWeeklySummary(
          summary.week.toString(),
          summary.class.toString(),
          null // No user ID for system recalculation
        );
        
        if (result) {
          successCount++;
          console.log(`✅ [${i + 1}/${summaries.length}] Recalculated: Week ${summary.week}, Class ${summary.class}`);
          console.log(`   → Total Score: ${result.classification?.totalScore}, Penalty: ${result.violations?.totalPenalty}`);
        } else {
          errorCount++;
          errors.push({ summary, error: 'Result was null' });
          console.log(`⚠️ [${i + 1}/${summaries.length}] Skipped (no data): Week ${summary.week}`);
        }
      } catch (error) {
        errorCount++;
        errors.push({ summary, error: error.message });
        console.log(`❌ [${i + 1}/${summaries.length}] Error: Week ${summary.week} - ${error.message}`);
      }
    }

    // Summary
    console.log('\n========================================');
    console.log('RECALCULATION COMPLETE');
    console.log('========================================');
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Errors:  ${errorCount}`);
    console.log(`📊 Total:   ${summaries.length}`);
    console.log('========================================\n');

    if (errors.length > 0) {
      console.log('Error Details:');
      errors.forEach((e, idx) => {
        console.log(`  ${idx + 1}. Week: ${e.summary.week}, Error: ${e.error}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('📦 Disconnected from MongoDB\n');
  }
}

// Run if executed directly
if (require.main === module) {
  recalculateAllSummaries()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { recalculateAllSummaries };
