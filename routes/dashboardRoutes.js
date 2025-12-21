const express = require('express');
const router = express.Router();
const {
  getStatistics,
  getTopClasses,
  getBottomClasses,
  getViolationsPareto,

  getDashboardOverview,
  getClassStatistics,
  getGradeDistribution,
  getViolationTrend,
} = require('../controllers/dashboardController');
const { authenticate } = require('../middlewares/auth');

/**
 * Dashboard routes
 * Base path: /api/dashboard
 */

// Lấy tổng quan dashboard (Authenticated)
router.get('/overview', authenticate, getDashboardOverview);

// Lấy thống kê (Authenticated)
router.get('/stats', authenticate, getStatistics);

// Lấy lớp top đầu (Authenticated)
router.get('/top-classes', authenticate, getTopClasses);

// Lấy lớp tụt hạng (Authenticated)
router.get('/bottom-classes', authenticate, getBottomClasses);

// Lấy thống kê Pareto (Authenticated)
router.get('/violations-pareto', authenticate, getViolationsPareto);

// Các API mới
router.get('/class-statistics', authenticate, getClassStatistics);
router.get('/grade-distribution', authenticate, getGradeDistribution);
router.get('/violation-trend', authenticate, getViolationTrend);

module.exports = router;

