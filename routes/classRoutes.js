const express = require('express');
const router = express.Router();
const {
  getAllClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  getClassStudents,
} = require('../controllers/classController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateClass } = require('../middlewares/validation');

/**
 * Lớp routes
 * Base path: /api/classes
 */

// Lấy tất cả lớp (Authenticated)
router.get('/', authenticate, getAllClasses);

// Lấy lớp theo ID (Authenticated)
router.get('/:id', authenticate, getClassById);

// Lấy danh sách học sinh của lớp (Authenticated)
router.get('/:id/students', authenticate, getClassStudents);

// Tạo lớp mới (Admin)
router.post('/', authenticate, authorize('Quản trị'), validateClass, createClass);

// Cập nhật lớp (Admin)
router.put('/:id', authenticate, authorize('Quản trị'), validateClass, updateClass);

// Xóa lớp (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteClass);

module.exports = router;

