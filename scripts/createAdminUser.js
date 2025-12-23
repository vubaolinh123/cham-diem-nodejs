/**
 * Script to create an admin user directly in MongoDB
 * Run: node scripts/createAdminUser.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chamdiem';

// Admin user configuration
const adminUserData = {
  email: 'linh123@gmail.com',
  password: 'linkcualinh@123',
  fullName: 'Admin Linh',
  role: 'Quản trị', // Admin role in Vietnamese
  isActive: true,
};

async function createAdminUser() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findOne({ email: adminUserData.email });
    if (existingUser) {
      console.log(`⚠️  User with email ${adminUserData.email} already exists!`);
      console.log(`   Role: ${existingUser.role}`);
      console.log(`   Active: ${existingUser.isActive}`);
      return;
    }

    // Create new admin user
    const user = new User(adminUserData);
    await user.save();

    console.log('\n========================================');
    console.log('✅ Admin user created successfully!');
    console.log('========================================');
    console.log(`Email: ${adminUserData.email}`);
    console.log(`Password: ${adminUserData.password}`);
    console.log(`Role: ${adminUserData.role}`);
    console.log(`Full Name: ${adminUserData.fullName}`);
    console.log('========================================\n');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createAdminUser();
