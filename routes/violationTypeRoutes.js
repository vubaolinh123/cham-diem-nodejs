const express = require('express');
const router = express.Router();
const {
  getAllViolationTypes,
  getViolationTypeById,
  createViolationType,
  updateViolationType,
  deleteViolationType,
} = require('../controllers/violationTypeController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateViolationType } = require('../middlewares/validation');

/**
 * Loại vi phạm routes
 * Base path: /api/violation-types
 */

// Lấy tất cả loại vi phạm (Public)
router.get('/', getAllViolationTypes);

// Lấy loại vi phạm theo ID (Public)
router.get('/:id', getViolationTypeById);

// Tạo loại vi phạm mới (Admin)
router.post('/', authenticate, authorize('Quản trị'), validateViolationType, createViolationType);

// Cập nhật loại vi phạm (Admin)
router.put('/:id', authenticate, authorize('Quản trị'), validateViolationType, updateViolationType);

// Xóa loại vi phạm (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteViolationType);

module.exports = router;

