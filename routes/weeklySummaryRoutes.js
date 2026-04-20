const express = require('express');
const router = express.Router();
const {
  getAllWeeklySummaries,
  getWeeklySummaryById,
  getWeeklySummaryByClassAndWeek,
  generateWeeklySummary,
  createWeeklySummary,
  updateWeeklySummary,
  deleteWeeklySummary,
  unlockWeeklySummary,
} = require('../controllers/weeklySummaryController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * Tổng hợp tuần routes
 * Base path: /api/weekly-summaries
 */

// Lấy tất cả tổng hợp tuần (Authenticated)
router.get('/', authenticate, getAllWeeklySummaries);

// Lấy tổng hợp tuần theo ID (Authenticated)
router.get('/:id', authenticate, getWeeklySummaryById);

// Lấy tổng hợp tuần theo lớp và tuần (Authenticated)
router.get('/class/:classId/week/:weekId', authenticate, getWeeklySummaryByClassAndWeek);

// Tạo tổng hợp tuần mới (Admin)
router.post('/', authenticate, authorize('Quản trị'), createWeeklySummary);

// Tạo/Cập nhật tổng hợp tuần tự động (Admin)
router.post('/generate', authenticate, authorize('Quản trị'), generateWeeklySummary);

// Cập nhật tổng hợp tuần (Admin)
router.put('/:id', authenticate, authorize('Quản trị'), updateWeeklySummary);

// Mở khóa tổng hợp tuần (Admin)
router.put('/:id/unlock', authenticate, authorize('Quản trị'), unlockWeeklySummary);

// Xóa tổng hợp tuần (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteWeeklySummary);

module.exports = router;


