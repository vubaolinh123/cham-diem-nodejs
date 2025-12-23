require('dotenv').config();

module.exports = {
  // Server
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/chamdiem',
  MONGODB_USER: process.env.MONGODB_USER,
  MONGODB_PASSWORD: process.env.MONGODB_PASSWORD,
  MONGODB_HOST: process.env.MONGODB_HOST || 'localhost',
  MONGODB_PORT: process.env.MONGODB_PORT || 27017,
  MONGODB_DATABASE: process.env.MONGODB_DATABASE || 'chamdiem',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your_jwt_secret_key_change_this_in_production',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_key_change_this_in_production',
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d',

  // Security
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 10,
  MAX_LOGIN_ATTEMPTS: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  LOCK_TIME: process.env.LOCK_TIME || '15m',

  // CORS - normalize origin (strip trailing slashes and support multiple origins)
  CORS_ORIGIN: (() => {
    const origin = process.env.CORS_ORIGIN || 'http://localhost:3000';
    // Support comma-separated origins
    if (origin.includes(',')) {
      return origin.split(',').map(o => o.trim().replace(/\/+$/, ''));
    }
    // Single origin - strip trailing slash
    return origin.trim().replace(/\/+$/, '');
  })(),

  // Rate Limiting (70 requests per 5 seconds)
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 5000,
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 70,
};

