const sendResponse = (res, statusCode, success, message, data = null) => {
  const response = {
    success,
    message,
  };

  if (data) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

const sendError = (res, statusCode, message, errors = null) => {
  const response = {
    success: false,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
};

const validateEmail = (email) => {
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

const getRolePermissions = (role) => {
  const permissions = {
    'Cờ đỏ': ['view_own_profile', 'view_own_grades'],
    'Giáo viên chủ nhiệm': [
      'view_own_profile',
      'view_students',
      'manage_grades',
      'view_class_info',
    ],
    'Quản trị': [
      'view_all_users',
      'manage_users',
      'manage_roles',
      'view_all_data',
      'manage_system',
    ],
  };

  return permissions[role] || [];
};

const convertTimeToMs = (timeString) => {
  const units = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  const match = timeString.match(/^(\d+)([a-z]+)$/i);
  if (!match) return null;

  const [, value, unit] = match;
  return parseInt(value) * (units[unit.toLowerCase()] || 1);
};

module.exports = {
  sendResponse,
  sendError,
  validateEmail,
  validatePassword,
  getRolePermissions,
  convertTimeToMs,
};

