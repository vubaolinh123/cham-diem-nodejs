const express = require('express');
const router = express.Router();
const classAcademicGradingController = require('../controllers/classAcademicGradingController');

// GET /api/class-academic-grading - Lấy tất cả
router.get('/', classAcademicGradingController.getAll);

// GET /api/class-academic-grading/stats/:schoolYearId - Thống kê theo năm học
router.get('/stats/:schoolYearId', classAcademicGradingController.getStatsBySchoolYear);

// GET /api/class-academic-grading/:id - Lấy theo ID
router.get('/:id', classAcademicGradingController.getById);

// GET /api/class-academic-grading/class/:classId/week/:weekId - Lấy theo lớp và tuần
router.get('/class/:classId/week/:weekId', classAcademicGradingController.getByClassAndWeek);

// POST /api/class-academic-grading/start - Bắt đầu chấm điểm (tạo record mới)
router.post('/start', classAcademicGradingController.startGrading);

// POST /api/class-academic-grading - Tạo mới
router.post('/', classAcademicGradingController.create);

// PUT /api/class-academic-grading/:id - Cập nhật
router.put('/:id', classAcademicGradingController.update);

// PATCH /api/class-academic-grading/:id/status - Cập nhật trạng thái
router.patch('/:id/status', classAcademicGradingController.updateStatus);

// POST /api/class-academic-grading/:id/calculate - Tính toán lại điểm
router.post('/:id/calculate', classAcademicGradingController.calculateScores);

// DELETE /api/class-academic-grading/:id - Xóa
router.delete('/:id', classAcademicGradingController.delete);

module.exports = router;

