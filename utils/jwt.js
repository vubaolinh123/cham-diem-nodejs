const jwt = require('jsonwebtoken');
const config = require('../config/environment');

const generateAccessToken = (userId, role) => {
  // Token vĩnh viễn: không đặt expiresIn.
  // Token chỉ bị hủy khi user chủ động bấm đăng xuất (xóa khỏi DB + xóa client state).
  return jwt.sign(
    { userId, role },
    config.JWT_SECRET
  );
};

const generateRefreshToken = (userId) => {
  // Refresh token cũng vĩnh viễn, tương ứng access token.
  return jwt.sign(
    { userId },
    config.JWT_REFRESH_SECRET
  );
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (error) {
    throw new Error(`Invalid access token: ${error.message}`);
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_REFRESH_SECRET);
  } catch (error) {
    throw new Error(`Invalid refresh token: ${error.message}`);
  }
};

const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    throw new Error(`Error decoding token: ${error.message}`);
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
};

