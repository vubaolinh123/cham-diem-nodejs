const express = require('express');
const router = express.Router();
const {
  getAllWeeks,
  getWeekById,
  createWeek,
  updateWeek,
  approveWeek,
  lockWeek,
  getWeekStatus,
  deleteWeek,
  bulkDeleteWeeks,
  getDeletePreview,
  getBulkDeletePreview,
} = require('../controllers/weekController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateWeek } = require('../middlewares/validation');

/**
 * Tuần routes
 * Base path: /api/weeks
 */

// Lấy tất cả tuần (Authenticated)
router.get('/', authenticate, getAllWeeks);

// Tạo tuần mới (Admin)
router.post('/', authenticate, authorize('Quản trị'), validateWeek, createWeek);

// Xem trước dữ liệu sẽ bị xóa khi xóa nhiều tuần (Admin) - Must be before /:id routes
router.post('/bulk-delete-preview', authenticate, authorize('Quản trị'), getBulkDeletePreview);

// Xóa nhiều tuần (Admin) - Must be before /:id route
router.delete('/bulk', authenticate, authorize('Quản trị'), bulkDeleteWeeks);

// Lấy tuần theo ID (Authenticated)
router.get('/:id', authenticate, getWeekById);

// Lấy trạng thái hoàn thành của tuần (Authenticated)
router.get('/:id/status', authenticate, getWeekStatus);

// Xem trước dữ liệu sẽ bị xóa khi xóa tuần (Admin)
router.get('/:id/delete-preview', authenticate, authorize('Quản trị'), getDeletePreview);

// Cập nhật tuần (Admin)
router.put('/:id', authenticate, authorize('Quản trị'), validateWeek, updateWeek);

// Duyệt tuần (GVCN, Admin)
router.put('/:id/approve', authenticate, authorize('Giáo viên chủ nhiệm', 'Quản trị'), approveWeek);

// Khóa tuần (Class Leader, Admin)
router.put('/:id/lock', authenticate, authorize('Quản trị'), lockWeek);

// Xóa tuần (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteWeek);

module.exports = router;
