const { validationResult, body } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Lỗi xác thực dữ liệu',
      errors: errors.array(),
    });
  }
  next();
};

const validateRegister = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Vui lòng nhập email hợp lệ'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Mật khẩu phải có ít nhất 8 ký tự')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Mật khẩu phải chứa: chữ hoa, chữ thường, số và ký tự đặc biệt'),
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Họ và tên là bắt buộc')
    .isLength({ min: 2 })
    .withMessage('Họ và tên phải có ít nhất 2 ký tự'),
  body('role')
    .isIn(['Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'])
    .withMessage('Vai trò không hợp lệ'),
];

const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Vui lòng nhập email hợp lệ'),
  body('password')
    .notEmpty()
    .withMessage('Vui lòng nhập mật khẩu'),
];

const validateUpdateProfile = [
  body('fullName')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Họ và tên phải có ít nhất 2 ký tự'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Vui lòng nhập email hợp lệ'),
];

const validateChangePassword = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Vui lòng nhập mật khẩu hiện tại'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Mật khẩu mới phải có ít nhất 8 ký tự')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Mật khẩu phải chứa: chữ hoa, chữ thường, số và ký tự đặc biệt'),
  body('confirmPassword')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Mật khẩu xác nhận không khớp'),
];

const validateSchoolYear = [
  body('year')
    .matches(/^\d{4}-\d{4}$/)
    .withMessage('Năm học phải có định dạng YYYY-YYYY'),
  body('startDate')
    .isISO8601()
    .withMessage('Ngày bắt đầu không hợp lệ'),
  body('endDate')
    .isISO8601()
    .withMessage('Ngày kết thúc không hợp lệ'),
  handleValidationErrors,
];

const validateViolationType = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Tên loại vi phạm là bắt buộc'),
  body('category')
    .optional()
    .isIn(['Nề nếp', 'Học tập', 'Kỷ luật', 'Khác'])
    .withMessage('Danh mục không hợp lệ'),
  body('severity')
    .optional()
    .isIn(['Nhẹ', 'Trung bình', 'Nặng'])
    .withMessage('Mức độ không hợp lệ'),
  handleValidationErrors,
];

const validateClass = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Tên lớp là bắt buộc'),
  body('grade')
    .isInt({ min: 10, max: 12 })
    .withMessage('Khối lớp phải từ 10 đến 12'),
  handleValidationErrors,
];

const validateStudent = [
  body('studentId')
    .trim()
    .notEmpty()
    .withMessage('Mã học sinh là bắt buộc'),
  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Họ và tên là bắt buộc'),
  handleValidationErrors,
];

const validateWeek = [
  body('weekNumber')
    .isInt({ min: 1 })
    .withMessage('Số tuần không hợp lệ'),
  body('startDate')
    .isISO8601()
    .withMessage('Ngày bắt đầu không hợp lệ'),
  body('endDate')
    .isISO8601()
    .withMessage('Ngày kết thúc không hợp lệ'),
  handleValidationErrors,
];

const validateViolationLog = [
  body('student')
    .notEmpty()
    .withMessage('Học sinh là bắt buộc'),
  body('violationType')
    .notEmpty()
    .withMessage('Loại vi phạm là bắt buộc'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Mô tả là bắt buộc'),
  handleValidationErrors,
];

const validateConductScore = [
  body('class')
    .notEmpty()
    .withMessage('Lớp là bắt buộc'),
  body('date')
    .isISO8601()
    .withMessage('Ngày không hợp lệ'),
  handleValidationErrors,
];

const validateAcademicScore = [
  body('class')
    .notEmpty()
    .withMessage('Lớp là bắt buộc'),
  body('date')
    .isISO8601()
    .withMessage('Ngày không hợp lệ'),
  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validateSchoolYear,
  validateViolationType,
  validateClass,
  validateStudent,
  validateWeek,
  validateViolationLog,
  validateConductScore,
  validateAcademicScore,
};

