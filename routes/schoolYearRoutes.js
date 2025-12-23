const express = require('express');
const router = express.Router();
const {
  getAllSchoolYears,
  getSchoolYearById,
  getCurrentSchoolYear,
  createSchoolYear,
  updateSchoolYear,
  deleteSchoolYear,
  generateWeeks,
  getDeletePreview,
} = require('../controllers/schoolYearController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateSchoolYear } = require('../middlewares/validation');

/**
 * Năm học routes
 * Base path: /api/school-years
 */

// Lấy năm học hiện tại (không cần xác thực)
router.get('/current', getCurrentSchoolYear);

// Lấy tất cả năm học (Admin)
router.get('/', authenticate, authorize('Quản trị'), getAllSchoolYears);

// Lấy năm học theo ID (Admin)
router.get('/:id', authenticate, authorize('Quản trị'), getSchoolYearById);

// Xem trước dữ liệu sẽ bị xóa (Admin)
router.get('/:id/delete-preview', authenticate, authorize('Quản trị'), getDeletePreview);

// Tạo năm học mới (Admin)
router.post('/', authenticate, authorize('Quản trị'), validateSchoolYear, createSchoolYear);

// Tự động tạo tuần cho năm học (Admin)
router.post('/:id/generate-weeks', authenticate, authorize('Quản trị'), generateWeeks);

// Cập nhật năm học (Admin)
router.put('/:id', authenticate, authorize('Quản trị'), validateSchoolYear, updateSchoolYear);

// Xóa năm học (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteSchoolYear);

module.exports = router;



