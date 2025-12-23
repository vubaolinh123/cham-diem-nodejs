const express = require('express');
const router = express.Router();
const {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkCreateStudents,
  getDeletePreview,
  getBulkDeletePreview,
  bulkDeleteStudents,
} = require('../controllers/studentController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateStudent } = require('../middlewares/validation');

/**
 * Học sinh routes
 * Base path: /api/students
 */

// Lấy tất cả học sinh (Authenticated)
router.get('/', authenticate, getAllStudents);

// Tạo học sinh mới (Admin)
router.post('/', authenticate, authorize('Quản trị'), validateStudent, createStudent);

// Import nhiều học sinh cùng lúc (Admin)
router.post('/bulk', authenticate, authorize('Quản trị'), bulkCreateStudents);

// Xem trước dữ liệu sẽ bị xóa khi xóa nhiều học sinh (Admin)
router.post('/bulk-delete-preview', authenticate, authorize('Quản trị'), getBulkDeletePreview);

// Xóa nhiều học sinh cùng lúc (Admin) - MUST be before /:id route
router.delete('/bulk', authenticate, authorize('Quản trị'), bulkDeleteStudents);

// Lấy học sinh theo ID (Authenticated)
router.get('/:id', authenticate, getStudentById);

// Xem trước dữ liệu sẽ bị xóa khi xóa học sinh (Admin)
router.get('/:id/delete-preview', authenticate, authorize('Quản trị'), getDeletePreview);

// Cập nhật học sinh (Admin)
router.put('/:id', authenticate, authorize('Quản trị'), validateStudent, updateStudent);

// Xóa học sinh (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteStudent);

module.exports = router;
