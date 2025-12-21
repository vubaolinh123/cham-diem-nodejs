const express = require('express');
const router = express.Router();
const {
  getAllMonthlySummaries,
  getMonthlySummaryById,
  generateMonthlySummary,
} = require('../controllers/monthlySummaryController');
const { authenticate, authorize } = require('../middlewares/auth');

/**
 * Tổng hợp tháng routes
 * Base path: /api/monthly-summaries
 */

// Lấy tất cả tổng hợp tháng (Authenticated)
router.get('/', authenticate, getAllMonthlySummaries);

// Lấy tổng hợp tháng theo ID (Authenticated)
router.get('/:id', authenticate, getMonthlySummaryById);

// Tạo/Cập nhật tổng hợp tháng (Admin)
router.post('/generate', authenticate, authorize('Quản trị'), generateMonthlySummary);

module.exports = router;

