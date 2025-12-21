const express = require('express');
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middlewares/auth');
const {
  validateUpdateProfile,
  validateChangePassword,
  handleValidationErrors,
} = require('../middlewares/validation');

const router = express.Router();

/**
 * @route   GET /api/users
 * @desc    Get all users (admin only)
 * @access  Private - Admin
 */
router.get(
  '/',
  authenticate,
  authorize('Quản trị'),
  userController.getAllUsers
);

/**
 * @route   POST /api/users
 * @desc    Create a new user (admin and teachers)
 * @access  Private - Admin, Teacher (with role restrictions)
 */
router.post(
  '/',
  authenticate,
  authorize('Quản trị', 'Giáo viên chủ nhiệm'),
  userController.createUser
);

/**
 * @route   GET /api/users/role/:role
 * @desc    Get users by role (admin only)
 * @access  Private - Admin
 */
router.get(
  '/role/:role',
  authenticate,
  authorize('Quản trị'),
  userController.getUsersByRole
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get('/:id', authenticate, userController.getUserById);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user (admin only)
 * @access  Private - Admin
 */
router.put(
  '/:id',
  authenticate,
  authorize('Quản trị'),
  userController.updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (admin only)
 * @access  Private - Admin
 */
router.delete(
  '/:id',
  authenticate,
  authorize('Quản trị'),
  userController.deleteUser
);

/**
 * @route   PUT /api/users/profile/update
 * @desc    Update own profile
 * @access  Private
 */
router.put(
  '/profile/update',
  authenticate,
  validateUpdateProfile,
  handleValidationErrors,
  userController.updateProfile
);

/**
 * @route   POST /api/users/change-password
 * @desc    Change password
 * @access  Private
 */
router.post(
  '/change-password',
  authenticate,
  validateChangePassword,
  handleValidationErrors,
  userController.changePassword
);

module.exports = router;

