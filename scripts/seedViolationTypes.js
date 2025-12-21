/**
 * Seed script to create ViolationType data in MongoDB
 * Run: node scripts/seedViolationTypes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ViolationType = require('../models/ViolationType');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chamdiem';

// ViolationType data (exported from readViolationTypes.js)
const violationTypesData = [
  {
    "name": "Đi học muộn",
    "description": "",
    "severity": "Nhẹ",
    "defaultPenalty": 1,
    "category": "Nề nếp",
    "isActive": true,
    "order": 1,
    "color": "#FF6B6B",
    "icon": "",
    "notes": ""
  },
  {
    "name": "Đeo thẻ",
    "description": "",
    "severity": "Nhẹ",
    "defaultPenalty": 1,
    "category": "Nề nếp",
    "isActive": true,
    "order": 2,
    "color": "#FF6B6B",
    "icon": "",
    "notes": ""
  },
  {
    "name": "Vệ sinh lớp",
    "description": "",
    "severity": "Nhẹ",
    "defaultPenalty": 1,
    "category": "Nề nếp",
    "isActive": true,
    "order": 3,
    "color": "#FF6B6B",
    "icon": "",
    "notes": ""
  },
  {
    "name": "Vi phạm trang phục",
    "description": "",
    "severity": "Trung bình",
    "defaultPenalty": 1,
    "category": "Nề nếp",
    "isActive": true,
    "order": 4,
    "color": "#FF6B6B",
    "icon": "",
    "notes": ""
  },
  {
    "name": "Không đeo thẻ",
    "description": "",
    "severity": "Nhẹ",
    "defaultPenalty": 1,
    "category": "Nề nếp",
    "isActive": true,
    "order": 5,
    "color": "#FF6B6B",
    "icon": "",
    "notes": ""
  },
  {
    "name": "Vắng mặt không phép",
    "description": "",
    "severity": "Nặng",
    "defaultPenalty": 1,
    "category": "Kỷ luật",
    "isActive": true,
    "order": 6,
    "color": "#FF6B6B",
    "icon": "",
    "notes": ""
  },
  {
    "name": "Sử dụng điện thoại",
    "description": "",
    "severity": "Trung bình",
    "defaultPenalty": 1,
    "category": "Kỷ luật",
    "isActive": true,
    "order": 7,
    "color": "#FF6B6B",
    "icon": "",
    "notes": ""
  },
  {
    "name": "Nói chuyện trong giờ",
    "description": "",
    "severity": "Nhẹ",
    "defaultPenalty": 1,
    "category": "Học tập",
    "isActive": true,
    "order": 8,
    "color": "#FF6B6B",
    "icon": "",
    "notes": ""
  },
  {
    "name": "Không làm bài tập",
    "description": "",
    "severity": "Trung bình",
    "defaultPenalty": 1,
    "category": "Học tập",
    "isActive": true,
    "order": 9,
    "color": "#FF6B6B",
    "icon": "",
    "notes": ""
  }
];

async function seedViolationTypes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get an admin user for createdBy field
    let adminUser = await User.findOne({ role: 'Quản trị' });
    if (!adminUser) {
      adminUser = await User.findOne();
    }
    
    if (!adminUser) {
      console.error('No user found in database. Please create a user first.');
      return;
    }

    console.log(`Using user: ${adminUser.fullName || adminUser.email} as creator`);

    // Clear existing violation types (optional - comment out if you don't want to clear)
    // await ViolationType.deleteMany({});
    // console.log('Cleared existing violation types');

    let created = 0;
    let skipped = 0;

    for (const vtData of violationTypesData) {
      // Check if already exists
      const existing = await ViolationType.findOne({ name: vtData.name });
      if (existing) {
        console.log(`⏭️  Skipped (already exists): ${vtData.name}`);
        skipped++;
        continue;
      }

      const violationType = new ViolationType({
        ...vtData,
        createdBy: adminUser._id,
      });

      await violationType.save();
      console.log(`✅ Created: ${vtData.name}`);
      created++;
    }

    console.log('\n========================================');
    console.log(`Seeding complete!`);
    console.log(`Created: ${created}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total: ${violationTypesData.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

seedViolationTypes();
