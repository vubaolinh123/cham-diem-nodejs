const express = require('express');
const router = express.Router();
const {
  getAllConductScores,
  getConductScoreById,
  createConductScore,
  updateConductScoreStatus,
  deleteConductScore,
} = require('../controllers/conductScoreController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateConductScore } = require('../middlewares/validation');

/**
 * Điểm nề nếp routes
 * Base path: /api/conduct-scores
 */

// Lấy tất cả điểm nề nếp (Authenticated)
router.get('/', authenticate, getAllConductScores);

// Lấy điểm nề nếp theo ID (Authenticated)
router.get('/:id', authenticate, getConductScoreById);

// Tạo/Cập nhật điểm nề nếp (Red Flag, GVCN, Admin)
router.post(
  '/',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nghiệm', 'Quản trị'),
  validateConductScore,
  createConductScore
);

// Cập nhật trạng thái (GVCN, Admin)
router.put(
  '/:id/status',
  authenticate,
  authorize('Giáo viên chủ nghiệm', 'Quản trị'),
  updateConductScoreStatus
);

// Xóa điểm nề nếp (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteConductScore);

module.exports = router;

