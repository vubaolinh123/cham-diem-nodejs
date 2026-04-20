const express = require('express');
const router = express.Router();
const disciplineGradingController = require('../controllers/disciplineGradingController');
const { authenticate, authorize } = require('../middlewares/auth');

// GET /api/discipline-grading - Lấy tất cả
router.get('/', authenticate, disciplineGradingController.getAll);

// GET /api/discipline-grading/stats/:schoolYearId - Thống kê theo năm học
router.get('/stats/:schoolYearId', authenticate, disciplineGradingController.getStatsBySchoolYear);

// GET /api/discipline-grading/:id - Lấy theo ID
router.get('/:id', authenticate, disciplineGradingController.getById);

// GET /api/discipline-grading/class/:classId/week/:weekId - Lấy theo lớp và tuần
router.get('/class/:classId/week/:weekId', authenticate, disciplineGradingController.getByClassAndWeek);

// POST /api/discipline-grading/start - Bắt đầu chấm điểm (tạo record mới với default items)
router.post(
  '/start',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'),
  disciplineGradingController.startGrading
);

// POST /api/discipline-grading - Tạo mới
router.post(
  '/',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'),
  disciplineGradingController.create
);

// PUT /api/discipline-grading/:id - Cập nhật
router.put(
  '/:id',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'),
  disciplineGradingController.update
);

// PATCH /api/discipline-grading/:id/status - Cập nhật trạng thái
router.patch(
  '/:id/status',
  authenticate,
  authorize('Giáo viên chủ nhiệm', 'Quản trị'),
  disciplineGradingController.updateStatus
);

// POST /api/discipline-grading/:id/sync-violations - Sync violations from conduct grading
router.post(
  '/:id/sync-violations',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'),
  disciplineGradingController.syncViolations
);

// DELETE /api/discipline-grading/:id/sync-violations - Remove synced violations
router.delete(
  '/:id/sync-violations',
  authenticate,
  authorize('Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'),
  disciplineGradingController.removeSyncedViolations
);

// DELETE /api/discipline-grading/:id - Xóa
router.delete(
  '/:id',
  authenticate,
  authorize('Quản trị'),
  disciplineGradingController.delete
);

module.exports = router;

