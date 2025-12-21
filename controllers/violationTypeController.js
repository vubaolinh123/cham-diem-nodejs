const ViolationType = require('../models/ViolationType');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy tất cả loại vi phạm
 * @route GET /api/violation-types
 * @access Public
 */
const getAllViolationTypes = async (req, res, next) => {
  try {
    const { category, severity, isActive = 'true', page = 1, limit = 20 } = req.query;

    const filter = {};
    if (category) filter.category = category;
    if (severity) filter.severity = severity;
    if (isActive !== undefined) filter.isActive = String(isActive) === 'true';

    const skip = (page - 1) * limit;

    const violationTypes = await ViolationType.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ category: 1, name: 1 });

    const total = await ViolationType.countDocuments(filter);

    return sendResponse(res, 200, true, 'Lấy danh sách loại vi phạm thành công', {
      violationTypes,
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

/**
 * Lấy loại vi phạm theo ID
 * @route GET /api/violation-types/:id
 * @access Public
 */
const getViolationTypeById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const violationType = await ViolationType.findById(id)
      .populate('createdBy', 'fullName email');

    if (!violationType) {
      return sendError(res, 404, 'Loại vi phạm không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin loại vi phạm thành công', {
      violationType,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo loại vi phạm mới
 * @route POST /api/violation-types
 * @access Admin
 */
const createViolationType = async (req, res, next) => {
  try {
    const {
      name,
      description,
      severity,
      category,
      defaultPenalty,
      color,
      icon,
    } = req.body;

    // Kiểm tra loại vi phạm đã tồn tại
    const existingType = await ViolationType.findOne({ name });
    if (existingType) {
      return sendError(res, 400, 'Loại vi phạm này đã tồn tại');
    }

    const violationType = new ViolationType({
      name,
      description,
      severity,
      category,
      defaultPenalty,
      color,
      icon,
      createdBy: req.userId,
    });

    await violationType.save();

    return sendResponse(res, 201, true, 'Tạo loại vi phạm thành công', {
      violationType,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật loại vi phạm
 * @route PUT /api/violation-types/:id
 * @access Admin
 */
const updateViolationType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      severity,
      category,
      defaultPenalty,
      color,
      icon,
      isActive,
    } = req.body;

    const violationType = await ViolationType.findById(id);

    if (!violationType) {
      return sendError(res, 404, 'Loại vi phạm không tìm thấy');
    }

    // Kiểm tra tên đã tồn tại (nếu thay đổi)
    if (name && name !== violationType.name) {
      const existingType = await ViolationType.findOne({ name });
      if (existingType) {
        return sendError(res, 400, 'Tên loại vi phạm này đã tồn tại');
      }
      violationType.name = name;
    }

    if (description) violationType.description = description;
    if (severity) violationType.severity = severity;
    if (category) violationType.category = category;
    if (defaultPenalty !== undefined) violationType.defaultPenalty = defaultPenalty;
    if (color) violationType.color = color;
    if (icon) violationType.icon = icon;
    if (isActive !== undefined) violationType.isActive = isActive;

    await violationType.save();

    return sendResponse(res, 200, true, 'Cập nhật loại vi phạm thành công', {
      violationType,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa loại vi phạm
 * @route DELETE /api/violation-types/:id
 * @access Admin
 */
const deleteViolationType = async (req, res, next) => {
  try {
    const { id } = req.params;

    const violationType = await ViolationType.findByIdAndDelete(id);

    if (!violationType) {
      return sendError(res, 404, 'Loại vi phạm không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Xóa loại vi phạm thành công');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllViolationTypes,
  getViolationTypeById,
  createViolationType,
  updateViolationType,
  deleteViolationType,
};

