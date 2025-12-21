const express = require('express');
const router = express.Router();
const {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  importStudents,
} = require('../controllers/studentController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateStudent } = require('../middlewares/validation');

/**
 * Học sinh routes
 * Base path: /api/students
 */

// Lấy tất cả học sinh (Authenticated)
router.get('/', authenticate, getAllStudents);

// Lấy học sinh theo ID (Authenticated)
router.get('/:id', authenticate, getStudentById);

// Tạo học sinh mới (Admin)
router.post('/', authenticate, authorize('Quản trị'), validateStudent, createStudent);

// Import học sinh từ Excel (Admin)
router.post('/import', authenticate, authorize('Quản trị'), importStudents);

// Cập nhật học sinh (Admin)
router.put('/:id', authenticate, authorize('Quản trị'), validateStudent, updateStudent);

// Xóa học sinh (Admin)
router.delete('/:id', authenticate, authorize('Quản trị'), deleteStudent);

module.exports = router;

