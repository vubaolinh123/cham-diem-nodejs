const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const {
  validateRegister,
  validateLogin,
  validateChangePassword,
  handleValidationErrors,
} = require('../middlewares/validation');
const {
  loginLimiter,
  registerLimiter,
} = require('../middlewares/security');

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  registerLimiter,
  validateRegister,
  handleValidationErrors,
  authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  loginLimiter,
  validateLogin,
  handleValidationErrors,
  authController.login
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', authController.refreshAccessToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authenticate, authController.getCurrentUser);

module.exports = router;

