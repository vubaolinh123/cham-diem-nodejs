const User = require('../models/User');
const jwtUtils = require('../utils/jwt');
const { sendResponse, sendError, getRolePermissions } = require('../utils/helpers');

const register = async (req, res, next) => {
  try {
    const { email, password, fullName, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 400, 'Email already registered');
    }

    // Create new user
    const user = new User({
      email,
      password,
      fullName,
      role: role || 'Cờ đỏ',
      permissions: getRolePermissions(role || 'Cờ đỏ'),
    });

    await user.save();

    const accessToken = jwtUtils.generateAccessToken(user._id, user.role);
    const refreshToken = jwtUtils.generateRefreshToken(user._id);

    await user.addRefreshToken(refreshToken);

    return sendResponse(res, 201, true, 'User registered successfully', {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return sendError(res, 401, 'Invalid email or password');
    }

    // Check if account is locked
    if (user.isLocked()) {
      return sendError(res, 403, 'Account is locked. Please try again later.');
    }

    // Check if user is active
    if (!user.isActive) {
      return sendError(res, 403, 'Account is inactive');
    }

    // Compare passwords
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return sendError(res, 401, 'Invalid email or password');
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Generate tokens
    const accessToken = jwtUtils.generateAccessToken(user._id, user.role);
    const refreshToken = jwtUtils.generateRefreshToken(user._id);

    await user.addRefreshToken(refreshToken);

    return sendResponse(res, 200, true, 'Login successful', {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return sendError(res, 400, 'Refresh token is required');
    }

    const decoded = jwtUtils.verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId);

    if (!user || !user.isActive) {
      return sendError(res, 401, 'User not found or inactive');
    }

    // Check if refresh token exists in user's tokens
    const tokenExists = user.refreshTokens.some((rt) => rt.token === refreshToken);
    if (!tokenExists) {
      return sendError(res, 401, 'Invalid refresh token');
    }

    // Generate new access token
    const newAccessToken = jwtUtils.generateAccessToken(user._id, user.role);

    return sendResponse(res, 200, true, 'Access token refreshed', {
      accessToken: newAccessToken,
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const userId = req.userId;

    if (refreshToken) {
      const user = await User.findById(userId);
      if (user) {
        await user.removeRefreshToken(refreshToken);
      }
    }

    return sendResponse(res, 200, true, 'Logout successful');
  } catch (error) {
    next(error);
  }
};

const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    return sendResponse(res, 200, true, 'User retrieved successfully', {
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  getCurrentUser,
};

