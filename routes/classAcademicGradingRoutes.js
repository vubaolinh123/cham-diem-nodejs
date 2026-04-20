const express = require('express');
const router = express.Router();
const classAcademicGradingController = require('../controllers/classAcademicGradingController');
const { authenticate, authorize } = require('../middlewares/auth');

// GET /api/class-academic-grading - Lấy tất cả
router.get('/', authenticate, classAcademicGradingController.getAll);

// GET /api/class-academic-grading/stats/:schoolYearId - Thống kê theo năm học
router.get('/stats/:schoolYearId', authenticate, classAcademicGradingController.getStatsBySchoolYear);

// GET /api/class-academic-grading/:id - Lấy theo ID
router.get('/:id', authenticate, classAcademicGradingController.getById);

// GET /api/class-academic-grading/class/:classId/week/:weekId - Lấy theo lớp và tuần
router.get('/class/:classId/week/:weekId', authenticate, classAcademicGradingController.getByClassAndWeek);

// POST /api/class-academic-grading/start - Bắt đầu chấm điểm (tạo record mới)
router.post(
  '/start',
  authenticate,
  authorize('Giáo viên chủ nhiệm', 'Quản trị'),
  classAcademicGradingController.startGrading
);

// POST /api/class-academic-grading - Tạo mới
router.post(
  '/',
  authenticate,
  authorize('Giáo viên chủ nhiệm', 'Quản trị'),
  classAcademicGradingController.create
);

// PUT /api/class-academic-grading/:id - Cập nhật
router.put(
  '/:id',
  authenticate,
  authorize('Giáo viên chủ nhiệm', 'Quản trị'),
  classAcademicGradingController.update
);

// PATCH /api/class-academic-grading/:id/status - Cập nhật trạng thái
router.patch(
  '/:id/status',
  authenticate,
  authorize('Giáo viên chủ nhiệm', 'Quản trị'),
  classAcademicGradingController.updateStatus
);

// POST /api/class-academic-grading/:id/calculate - Tính toán lại điểm
router.post(
  '/:id/calculate',
  authenticate,
  authorize('Giáo viên chủ nhiệm', 'Quản trị'),
  classAcademicGradingController.calculateScores
);

// DELETE /api/class-academic-grading/:id - Xóa
router.delete(
  '/:id',
  authenticate,
  authorize('Quản trị'),
  classAcademicGradingController.delete
);

module.exports = router;

