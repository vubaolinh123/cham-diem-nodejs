const express = require('express');
const router = express.Router();
const {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  exportReport,
  getViolationsSummary,
  getCustomReport,
} = require('../controllers/reportController');
const { authenticate } = require('../middlewares/auth');

/**
 * Báo cáo routes
 * Base path: /api/reports
 */

// Lấy báo cáo ngày (Authenticated)
router.get('/daily', authenticate, getDailyReport);

// Lấy báo cáo tùy chỉnh (Authenticated)
router.get('/custom', authenticate, getCustomReport);

// Lấy báo cáo tuần (Authenticated)
router.get('/weekly', authenticate, getWeeklyReport);

// Lấy báo cáo tháng (Authenticated)
router.get('/monthly', authenticate, getMonthlyReport);

// Lấy thống kê vi phạm (Authenticated)
router.get('/violations-summary', authenticate, getViolationsSummary);

// Xuất báo cáo PDF/Excel (Authenticated)
router.get('/export', authenticate, exportReport);

module.exports = router;

