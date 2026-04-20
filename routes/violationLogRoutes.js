const express = require('express');
const router = express.Router();
const {
  getAllViolationLogs,
  getViolationLogById,
  createViolationLog,
  updateViolationLog,
  updateViolationStatus,
  approveViolation,
  rejectViolation,
  reopenViolation,
  deleteViolationLog,
} = require('../controllers/violationLogController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateCreateViolationLog, validateUpdateViolationLog } = require('../middlewares/validation');

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
  authorize('Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'),
  validateCreateViolationLog,
  createViolationLog
);

// Cập nhật vi phạm (Red Flag, GVCN, Admin)
router.put(
  '/:id',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'),
  validateUpdateViolationLog,
  updateViolationLog
);

// Cập nhật trạng thái vi phạm (GVCN, Admin)
router.patch(
  '/:id/status',
  authenticate,
  authorize('Giáo viên chủ nhiệm', 'Quản trị'),
  updateViolationStatus
);

// Duyệt vi phạm (GVCN, Admin)
router.put(
  '/:id/approve',
  authenticate,
  authorize('Giáo viên chủ nhiệm', 'Quản trị'),
  approveViolation
);

// Từ chối vi phạm (GVCN, Admin)
router.put(
  '/:id/reject',
  authenticate,
  authorize('Giáo viên chủ nhiệm', 'Quản trị'),
  rejectViolation
);

// Mở lại duyệt vi phạm (Admin only)
router.put(
  '/:id/reopen',
  authenticate,
  authorize('Quản trị'),
  reopenViolation
);

// Xóa vi phạm (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteViolationLog);

module.exports = router;

