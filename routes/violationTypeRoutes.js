const express = require('express');
const router = express.Router();
const violationTypeController = require('../controllers/violationTypeController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateViolationType } = require('../middlewares/validation');

// All routes require authentication
router.get('/', authenticate, violationTypeController.getAllViolationTypes);
router.get('/:id', authenticate, violationTypeController.getViolationTypeById);

// Protected routes (chỉ admin mới được tạo/sửa/xóa)
router.post('/', authenticate, authorize('Quản trị'), validateViolationType, violationTypeController.createViolationType);
router.put('/:id', authenticate, authorize('Quản trị'), validateViolationType, violationTypeController.updateViolationType);
router.get('/:id/delete-preview', authenticate, authorize('Quản trị'), violationTypeController.getDeletePreview);
router.delete('/:id', authenticate, authorize('Quản trị'), violationTypeController.deleteViolationType);

module.exports = router;
