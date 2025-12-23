const ViolationLog = require('../models/ViolationLog');
const Week = require('../models/Week');
const Student = require('../models/Student');
const ViolationType = require('../models/ViolationType');
const { sendResponse, sendError } = require('../utils/helpers');
const { updateWeeklySummary } = require('../utils/weeklySummaryHelper');

/**
 * Lấy tất cả vi phạm
 * @route GET /api/violation-logs
 * @access Authenticated
 */
const getAllViolationLogs = async (req, res, next) => {
  try {
    const {
      week,
      class: classId,
      student,
      violationType,
      status,
      reportedBy,
      severity,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};
    if (week) filter.week = week;
    if (classId) filter.class = classId;
    if (student) filter.student = student;
    if (violationType) filter.violationType = violationType;
    if (status) filter.status = status;
    if (reportedBy) filter.reportedBy = reportedBy;
    if (severity) filter.severity = severity;

    // Lọc theo ngày
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const violations = await ViolationLog.find(filter)
      .populate('week', 'weekNumber startDate endDate')
      .populate('student', 'studentId fullName')
      .populate('class', 'name grade')
      .populate('violationType', 'name category severity')
      .populate('reportedBy', 'fullName email role')
      .populate('approvedBy', 'fullName email')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ date: -1 });

    const total = await ViolationLog.countDocuments(filter);

    return sendResponse(res, 200, true, 'Lấy danh sách vi phạm thành công', {
      violations,
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
 * Lấy vi phạm theo ID
 * @route GET /api/violation-logs/:id
 * @access Authenticated
 */
const getViolationLogById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const violation = await ViolationLog.findById(id)
      .populate('week', 'weekNumber startDate endDate')
      .populate('student', 'studentId fullName')
      .populate('class', 'name grade')
      .populate('violationType', 'name category severity')
      .populate('reportedBy', 'fullName email role')
      .populate('approvedBy', 'fullName email')
      .populate('duplicateOf');

    if (!violation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin vi phạm thành công', {
      violation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo vi phạm mới
 * @route POST /api/violation-logs
 * @access Authenticated
 */
const createViolationLog = async (req, res, next) => {
  try {
    const {
      student,
      class: classId,
      violationType,
      date,
      description,
      week,
      severity,
      images,
      status
    } = req.body;

    // Validate required fields
    if (!student || !classId || !violationType || !week || !date) {
      return sendError(res, 400, 'Vui lòng điền đầy đủ thông tin bắt buộc');
    }

    const violationTypeData = await ViolationType.findById(violationType);
    if (!violationTypeData) {
      return sendError(res, 400, 'Loại vi phạm không tìm thấy');
    }

    const violation = new ViolationLog({
      student,
      class: classId,
      violationType,
      date,
      description,
      week,
      severity: severity || violationTypeData.severity,
      reportedBy: req.userId,
      status: status || 'Chờ duyệt',
      images
    });

    await violation.save();

    await violation.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'student', select: 'studentId fullName' },
      { path: 'class', select: 'name grade' },
      { path: 'violationType', select: 'name category severity' },
      { path: 'reportedBy', select: 'fullName email role' },
    ]);

    return sendResponse(res, 201, true, 'Tạo vi phạm thành công', {
      violation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật vi phạm
 * @route PUT /api/violation-logs/:id
 * @access Authenticated
 */
const updateViolationLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      student,
      class: classId,
      violationType,
      date,
      description,
      week,
      severity,
      images,
      status
    } = req.body;

    let violation = await ViolationLog.findById(id);

    if (!violation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    if (date) violation.date = date;
    if (student) violation.student = student;
    if (classId) violation.class = classId;
    if (week) violation.week = week;
    if (description) violation.description = description;
    if (images) violation.images = images;
    
    if (violationType) {
        // Validation check for violationType existence could be added here
        violation.violationType = violationType;
    }
    if (severity) violation.severity = severity;

    // Not updating status here to enforce approve/reject workflow, 
    // unless it is still pending? For now, we trust the Dialogs to handle status.
    // But if status is passed and valid (e.g. back to pending), maybe allow?
    // Let's rely on specific endpoints for status changes for now to be safe.

    violation.updatedBy = req.userId;

    await violation.save();

    await violation.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'student', select: 'studentId fullName' },
      { path: 'class', select: 'name grade' },
      { path: 'violationType', select: 'name category severity' },
      { path: 'reportedBy', select: 'fullName email role' },
      { path: 'approvedBy', select: 'fullName email' },
    ]);

    return sendResponse(res, 200, true, 'Cập nhật vi phạm thành công', {
      violation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Duyệt vi phạm
 * @route PUT /api/violation-logs/:id/approve
 * @access Homeroom Teacher, Admin
 */
const approveViolation = async (req, res, next) => {
  try {
    const { id } = req.params;

    const violation = await ViolationLog.findById(id);

    if (!violation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    if (violation.status === 'Đã duyệt') {
      return sendError(res, 409, 'Vi phạm đã được duyệt');
    }

    violation.status = 'Đã duyệt';
    violation.approvedBy = req.userId;
    violation.approvedDate = new Date();
    violation.updatedBy = req.userId;

    await violation.save();
    
    // Valid for unpopulated fields (IDs)
    await updateWeeklySummary(violation.week, violation.class, req.userId);

    await violation.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'student', select: 'studentId fullName' },
      { path: 'class', select: 'name grade' },
      { path: 'violationType', select: 'name category severity' },
      { path: 'approvedBy', select: 'fullName email' },
    ]);

    return sendResponse(res, 200, true, 'Duyệt vi phạm thành công', {
      violation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Từ chối vi phạm
 * @route PUT /api/violation-logs/:id/reject
 * @access Homeroom Teacher, Admin
 */
const rejectViolation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return sendError(res, 400, 'Lý do từ chối là bắt buộc');
    }

    const violation = await ViolationLog.findById(id);

    if (!violation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    if (violation.status === 'Đã duyệt') {
      return sendError(res, 409, 'Không thể từ chối vi phạm đã duyệt');
    }

    violation.status = 'Từ chối';
    violation.approvedBy = req.userId;
    violation.approvedDate = new Date();
    violation.notes = reason;
    violation.updatedBy = req.userId;

    await violation.save();

    // Valid for unpopulated fields (IDs)
    await updateWeeklySummary(violation.week, violation.class, req.userId);

    await violation.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'student', select: 'studentId fullName' },
      { path: 'class', select: 'name grade' },
      { path: 'violationType', select: 'name category severity' },
      { path: 'approvedBy', select: 'fullName email' },
    ]);

    return sendResponse(res, 200, true, 'Từ chối vi phạm thành công', {
      violation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa vi phạm
 * @route DELETE /api/violation-logs/:id
 * @access Admin
 */
const deleteViolationLog = async (req, res, next) => {
  try {
    const { id } = req.params;

    const violation = await ViolationLog.findById(id);

    if (!violation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    if (violation.status === 'Đã duyệt') {
      return sendError(res, 409, 'Không thể xóa vi phạm đã duyệt');
    }

    // Store week and class before deletion
    const weekId = violation.week;
    const classId = violation.class;

    await ViolationLog.findByIdAndDelete(id);

    // Auto-update WeeklySummary after deletion
    await updateWeeklySummary(weekId, classId, req.userId);

    return sendResponse(res, 200, true, 'Xóa vi phạm thành công');
  } catch (error) {
    next(error);
  }
};

/**
 * Kiểm tra vi phạm trùng lặp
 * Quy tắc: cùng học sinh + cùng loại lỗi + cùng ngày
 */
const detectDuplicate = async (student, violationType, date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const duplicate = await ViolationLog.findOne({
    student,
    violationType,
    date: { $gte: startOfDay, $lte: endOfDay },
    status: 'Đã duyệt',
  });

  return duplicate;
};

module.exports = {
  getAllViolationLogs,
  getViolationLogById,
  createViolationLog,
  updateViolationLog,
  approveViolation,
  rejectViolation,
  deleteViolationLog,
};

