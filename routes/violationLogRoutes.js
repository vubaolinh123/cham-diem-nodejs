const express = require('express');
const router = express.Router();
const {
  getAllViolationLogs,
  getViolationLogById,
  createViolationLog,
  updateViolationLog,
  approveViolation,
  rejectViolation,
  deleteViolationLog,
} = require('../controllers/violationLogController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateViolationLog } = require('../middlewares/validation');

/**
 * Vi phạm routes
 * Base path: /api/violation-logs
 */

// Lấy tất cả vi phạm (Authenticated)
router.get('/', authenticate, getAllViolationLogs);

// Lấy vi phạm theo ID (Authenticated)
router.get('/:id', authenticate, getViolationLogById);

// Tạo vi phạm mới (Red Flag, GVCN, Admin)
router.post(
  '/',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nghiệm', 'Quản trị'),
  validateViolationLog,
  createViolationLog
);

// Cập nhật vi phạm (Red Flag, GVCN, Admin)
router.put(
  '/:id',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nghiệm', 'Quản trị'),
  validateViolationLog,
  updateViolationLog
);

// Duyệt vi phạm (GVCN, Admin)
router.put(
  '/:id/approve',
  authenticate,
  authorize('Giáo viên chủ nghiệm', 'Quản trị'),
  approveViolation
);

// Từ chối vi phạm (GVCN, Admin)
router.put(
  '/:id/reject',
  authenticate,
  authorize('Giáo viên chủ nghiệm', 'Quản trị'),
  rejectViolation
);

// Xóa vi phạm (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteViolationLog);

module.exports = router;

