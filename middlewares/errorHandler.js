// Helper function to translate field names to Vietnamese
const translateFieldName = (field) => {
  const fieldMap = {
    'dateOfBirth': 'ngày sinh',
    'startDate': 'ngày bắt đầu',
    'endDate': 'ngày kết thúc',
    'date': 'ngày',
    'email': 'email',
    'password': 'mật khẩu',
    'fullName': 'họ và tên',
    'studentId': 'mã học sinh',
    'class': 'lớp',
    'week': 'tuần',
    'schoolYear': 'năm học',
    'student': 'học sinh',
    'violationType': 'loại vi phạm',
    'description': 'mô tả',
    'name': 'tên',
    'grade': 'khối',
    'weekNumber': 'số tuần',
    'role': 'vai trò',
    'phone': 'số điện thoại',
    'address': 'địa chỉ',
    'parentName': 'tên phụ huynh',
    'parentPhone': 'số điện thoại phụ huynh',
  };
  return fieldMap[field] || field;
};

// Helper function to translate error type to Vietnamese
const translateCastError = (err) => {
  const field = translateFieldName(err.path);
  const value = err.value;
  
  if (err.kind === 'date' || err.kind === 'Date') {
    return `Định dạng ${field} không hợp lệ. Giá trị "${value}" không phải là ngày hợp lệ (định dạng đúng: YYYY-MM-DD)`;
  }
  if (err.kind === 'ObjectId') {
    return `${field} không hợp lệ hoặc không tồn tại`;
  }
  if (err.kind === 'Number') {
    return `${field} phải là số`;
  }
  if (err.kind === 'Boolean') {
    return `${field} phải là true hoặc false`;
  }
  return `Giá trị ${field} không hợp lệ`;
};

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Mongoose CastError (invalid ObjectId, date format, etc.)
  if (err.name === 'CastError') {
    const message = translateCastError(err);
    return res.status(400).json({
      success: false,
      message: message,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => {
      // Handle nested CastError within ValidationError
      if (e.name === 'CastError') {
        return translateCastError(e);
      }
      return e.message;
    });
    
    // Return the first error message as the main message for clarity
    return res.status(400).json({
      success: false,
      message: messages[0],
      errors: messages.length > 1 ? messages : undefined,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const translatedField = translateFieldName(field);
    return res.status(400).json({
      success: false,
      message: `${translatedField} đã tồn tại`,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token không hợp lệ',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token đã hết hạn',
    });
  }

  // Default error
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Lỗi server',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Không tìm thấy route',
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};

