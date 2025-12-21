const express = require('express');
const router = express.Router();
const {
  getAllAcademicScores,
  getAcademicScoreById,
  createAcademicScore,
  updateAcademicScoreStatus,
  deleteAcademicScore,
} = require('../controllers/academicScoreController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateAcademicScore } = require('../middlewares/validation');

/**
 * Điểm học tập routes
 * Base path: /api/academic-scores
 */

// Lấy tất cả điểm học tập (Authenticated)
router.get('/', authenticate, getAllAcademicScores);

// Lấy điểm học tập theo ID (Authenticated)
router.get('/:id', authenticate, getAcademicScoreById);

// Tạo/Cập nhật điểm học tập (Red Flag, GVCN, Admin)
router.post(
  '/',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nghiệm', 'Quản trị'),
  validateAcademicScore,
  createAcademicScore
);

// Cập nhật trạng thái (GVCN, Admin)
router.put(
  '/:id/status',
  authenticate,
  authorize('Giáo viên chủ nghiệm', 'Quản trị'),
  updateAcademicScoreStatus
);

// Xóa điểm học tập (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteAcademicScore);

module.exports = router;

