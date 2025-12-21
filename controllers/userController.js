const User = require('../models/User');
const { sendResponse, sendError, getRolePermissions } = require('../utils/helpers');

const getAllUsers = async (req, res, next) => {
  try {
    const { role, isActive, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const skip = (page - 1) * limit;

    const users = await User.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password -refreshTokens');

    const total = await User.countDocuments(filter);

    return sendResponse(res, 200, true, 'Users retrieved successfully', {
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password -refreshTokens');

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    return sendResponse(res, 200, true, 'User retrieved successfully', {
      user,
    });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, email, role, isActive } = req.body;

    const user = await User.findById(id);

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    // Update allowed fields
    if (fullName) user.fullName = fullName;
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return sendError(res, 400, 'Email already in use');
      }
      user.email = email;
    }
    if (role && role !== user.role) {
      user.role = role;
      user.permissions = getRolePermissions(role);
    }
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    return sendResponse(res, 200, true, 'User updated successfully', {
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { fullName, email, password, role, isActive } = req.body;
    const creatorRole = req.userRole;

    // Role-based account creation restrictions
    // Admin (Quản trị) can create any role
    // Teacher (Giáo viên chủ nhiệm) can only create Cờ đỏ accounts
    if (creatorRole === 'Giáo viên chủ nhiệm' && role !== 'Cờ đỏ') {
      return sendError(res, 403, 'Giáo viên chủ nhiệm chỉ có thể tạo tài khoản Cờ đỏ');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 400, 'Email already in use');
    }

    const user = new User({
      fullName,
      email,
      password,
      role,
      isActive,
    });

    if (role) {
      user.permissions = getRolePermissions(role);
    }

    await user.save();

    return sendResponse(res, 201, true, 'User created successfully', {
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if user is linked to any Class as HomeRoomTeacher, ClassLeader, or ViceClassLeader
    const linkedClass = await require('../models/Class').findOne({
      $or: [
        { homeRoomTeacher: id },
        { classLeader: id },
        { viceClassLeader: id }
      ]
    });

    if (linkedClass) {
      return sendError(res, 400, `Không thể xóa tài khoản này vì đang liên kết với lớp ${linkedClass.name}`);
    }

    // Check if user is linked to DisciplineGrading (created by)
    const linkedDiscipline = await require('../models/DisciplineGrading').findOne({ createdBy: id });
    if (linkedDiscipline) {
      return sendError(res, 400, 'Không thể xóa tài khoản này vì đã thực hiện chấm điểm nề nếp');
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    return sendResponse(res, 200, true, 'User deleted successfully');
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { fullName, email } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    if (fullName) user.fullName = fullName;
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return sendError(res, 400, 'Email already in use');
      }
      user.email = email;
    }

    await user.save();

    return sendResponse(res, 200, true, 'Profile updated successfully', {
      user: user.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(userId).select('+password');

    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return sendError(res, 401, 'Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return sendResponse(res, 200, true, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

const getUsersByRole = async (req, res, next) => {
  try {
    const { role } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const validRoles = ['Cờ đỏ', 'Giáo viên chủ nhiệm', 'Quản trị'];
    if (!validRoles.includes(role)) {
      return sendError(res, 400, 'Invalid role');
    }

    const skip = (page - 1) * limit;

    const users = await User.find({ role })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-password -refreshTokens');

    const total = await User.countDocuments({ role });

    return sendResponse(res, 200, true, 'Users retrieved successfully', {
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  updateProfile,
  changePassword,
  createUser,
  getUsersByRole,
};

