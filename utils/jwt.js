const jwt = require('jsonwebtoken');
const config = require('../config/environment');

const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRE }
  );
};

const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRE }
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

