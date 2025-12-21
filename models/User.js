const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
    },
    role: {
      type: String,
      enum: {
        values: ['Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'],
        message: 'Role must be one of: Cờ đỏ, Giáo viên chủ nhiệm, Quản trị',
      },
      default: 'Cờ đỏ',
      required: [true, 'Role is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Lớp được phân công (cho Giáo viên chủ nhiệm)
    assignedClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    refreshTokens: [
      {
        token: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
          expires: 2592000, // 30 days
        },
      },
    ],
    permissions: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Error comparing passwords');
  }
};

// Method to check if account is locked
userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = async function () {
  // Reset attempts if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  // Increment attempts
  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account if max attempts reached
  const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    const lockTime = parseInt(process.env.LOCK_TIME) || 900000; // 15 minutes
    updates.$set = { lockUntil: new Date(Date.now() + lockTime) };
  }

  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({
    $set: { loginAttempts: 0, lastLogin: new Date() },
    $unset: { lockUntil: 1 },
  });
};

// Method to add refresh token
userSchema.methods.addRefreshToken = async function (token) {
  this.refreshTokens.push({ token });
  return this.save();
};

// Method to remove refresh token
userSchema.methods.removeRefreshToken = async function (token) {
  this.refreshTokens = this.refreshTokens.filter((rt) => rt.token !== token);
  return this.save();
};

// Method to check if user has permission
userSchema.methods.hasPermission = function (permission) {
  return this.permissions.includes(permission);
};

// Method to get user data without sensitive information
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.refreshTokens;
  delete user.loginAttempts;
  delete user.lockUntil;
  return user;
};

module.exports = mongoose.model('User', userSchema);

