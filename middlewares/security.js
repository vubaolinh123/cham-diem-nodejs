const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('../config/environment');

// Helmet middleware for security headers
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  noSniff: true,
  xssFilter: true,
});

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for registration
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts
  message: 'Too many registration attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for password reset
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 attempts
  message: 'Too many password reset attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// CSRF protection middleware (basic implementation)
const csrfProtection = (req, res, next) => {
  // For GET requests, generate CSRF token
  if (req.method === 'GET') {
    const crypto = require('crypto');
    req.csrfToken = crypto.randomBytes(32).toString('hex');
    res.setHeader('X-CSRF-Token', req.csrfToken);
  }

  // For POST, PUT, DELETE requests, verify CSRF token
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const token = req.headers['x-csrf-token'] || req.body._csrf;
    if (!token) {
      return res.status(403).json({
        success: false,
        message: 'CSRF token missing',
      });
    }
    // In production, validate token against session
  }

  next();
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/[<>]/g, '') // Remove angle brackets
        .trim();
    }
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach((key) => {
        obj[key] = sanitize(obj[key]);
      });
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);

  next();
};

module.exports = {
  securityHeaders,
  generalLimiter,
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  csrfProtection,
  sanitizeInput,
};

