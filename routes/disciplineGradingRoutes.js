const express = require('express');
const router = express.Router();
const disciplineGradingController = require('../controllers/disciplineGradingController');

// GET /api/discipline-grading - Lấy tất cả
router.get('/', disciplineGradingController.getAll);

// GET /api/discipline-grading/stats/:schoolYearId - Thống kê theo năm học
router.get('/stats/:schoolYearId', disciplineGradingController.getStatsBySchoolYear);

// GET /api/discipline-grading/:id - Lấy theo ID
router.get('/:id', disciplineGradingController.getById);

// GET /api/discipline-grading/class/:classId/week/:weekId - Lấy theo lớp và tuần
router.get('/class/:classId/week/:weekId', disciplineGradingController.getByClassAndWeek);

// POST /api/discipline-grading/start - Bắt đầu chấm điểm (tạo record mới với default items)
router.post('/start', disciplineGradingController.startGrading);

// POST /api/discipline-grading - Tạo mới
router.post('/', disciplineGradingController.create);

// PUT /api/discipline-grading/:id - Cập nhật
router.put('/:id', disciplineGradingController.update);

// PATCH /api/discipline-grading/:id/status - Cập nhật trạng thái
router.patch('/:id/status', disciplineGradingController.updateStatus);

// DELETE /api/discipline-grading/:id - Xóa
router.delete('/:id', disciplineGradingController.delete);

module.exports = router;

