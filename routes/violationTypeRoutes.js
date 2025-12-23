const express = require('express');
const router = express.Router();
const violationTypeController = require('../controllers/violationTypeController');
const { authenticate, authorize } = require('../middlewares/auth');

// Public routes (cho phép xem danh sách)
router.get('/', violationTypeController.getAllViolationTypes);
router.get('/:id', violationTypeController.getViolationTypeById);

// Protected routes (chỉ admin mới được tạo/sửa/xóa)
router.post('/', authenticate, authorize('Quản trị'), violationTypeController.createViolationType);
router.put('/:id', authenticate, authorize('Quản trị'), violationTypeController.updateViolationType);
router.get('/:id/delete-preview', authenticate, authorize('Quản trị'), violationTypeController.getDeletePreview);
router.delete('/:id', authenticate, authorize('Quản trị'), violationTypeController.deleteViolationType);

module.exports = router;
