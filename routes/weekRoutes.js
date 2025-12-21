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
} = require('../controllers/weekController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateWeek } = require('../middlewares/validation');

/**
 * Tuần routes
 * Base path: /api/weeks
 */

// Lấy tất cả tuần (Authenticated)
router.get('/', authenticate, getAllWeeks);

// Lấy tuần theo ID (Authenticated)
router.get('/:id', authenticate, getWeekById);

// Lấy trạng thái hoàn thành của tuần (Authenticated)
router.get('/:id/status', authenticate, getWeekStatus);

// Tạo tuần mới (Admin)
router.post('/', authenticate, authorize('Quản trị'), validateWeek, createWeek);

// Cập nhật tuần (Admin)
router.put('/:id', authenticate, authorize('Quản trị'), validateWeek, updateWeek);

// Duyệt tuần (GVCN, Admin)
router.put('/:id/approve', authenticate, authorize('Giáo viên chủ nghiệm', 'Quản trị'), approveWeek);

// Khóa tuần (Class Leader, Admin)
router.put('/:id/lock', authenticate, authorize('Quản trị'), lockWeek);

// Xóa nhiều tuần (Admin) - Must be before /:id route
router.delete('/bulk', authenticate, authorize('Quản trị'), bulkDeleteWeeks);

// Xóa tuần (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteWeek);

module.exports = router;



