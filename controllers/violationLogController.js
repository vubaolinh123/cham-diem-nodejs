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
      evidence,
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
      description: description || `Vi phạm ${violationTypeData.name}`,
      week,
      severity: severity || violationTypeData.severity || 'Nhẹ',
      category: violationTypeData.category || 'Khác',
      reportedBy: req.userId,
      status: status || 'Chờ duyệt',
      evidence: evidence || images || [],
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
      evidence,
      status,
      category,
    } = req.body;

    // Build update object - only include fields that are provided
    const updateData = {};
    if (date) updateData.date = date;
    if (student) updateData.student = student;
    if (classId) updateData.class = classId;
    if (week) updateData.week = week;
    if (description) updateData.description = description;
    if (evidence || images) updateData.evidence = evidence || images;
    if (violationType) updateData.violationType = violationType;
    if (severity) updateData.severity = severity;
    if (category) updateData.category = category;

    // Validate violationType if provided
    if (violationType) {
      const violationTypeData = await ViolationType.findById(violationType);
      if (!violationTypeData) {
        return sendError(res, 400, 'Loại vi phạm không tìm thấy');
      }
      // Auto-fill severity and category from violationType if not provided
      if (!severity) updateData.severity = violationTypeData.severity || 'Nhẹ';
      if (!category) updateData.category = violationTypeData.category || 'Khác';
    }

    updateData.updatedBy = req.userId;

    // Use findByIdAndUpdate with runValidators: false to avoid re-validating all required fields
    // This is safe because we're only updating specific fields, not replacing the document
    const violation = await ViolationLog.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: false }
    );

    if (!violation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    // Update weekly summary after violation change
    await updateWeeklySummary(violation.week, violation.class, req.userId);

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

    // First check existence and status
    const existingViolation = await ViolationLog.findById(id);
    if (!existingViolation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    if (existingViolation.status === 'Đã duyệt') {
      return sendError(res, 409, 'Vi phạm đã được duyệt');
    }

    // Use findByIdAndUpdate to avoid re-validating all required fields
    const violation = await ViolationLog.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'Đã duyệt',
          approvedBy: req.userId,
          approvedDate: new Date(),
          updatedBy: req.userId,
        },
      },
      { new: true, runValidators: false }
    );

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

    // First check existence and status
    const existingViolation = await ViolationLog.findById(id);
    if (!existingViolation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    if (existingViolation.status === 'Đã duyệt') {
      return sendError(res, 409, 'Không thể từ chối vi phạm đã duyệt');
    }

    // Use findByIdAndUpdate to avoid re-validating all required fields
    const violation = await ViolationLog.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'Từ chối',
          approvedBy: req.userId,
          approvedDate: new Date(),
          notes: reason,
          updatedBy: req.userId,
        },
      },
      { new: true, runValidators: false }
    );

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
 * Mở lại duyệt vi phạm (Admin only)
 * @route PUT /api/violation-logs/:id/reopen
 * @access Admin
 */
const reopenViolation = async (req, res, next) => {
  try {
    const { id } = req.params;

    // First check existence and status
    const existingViolation = await ViolationLog.findById(id);
    if (!existingViolation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    if (existingViolation.status === 'Chờ duyệt') {
      return sendError(res, 409, 'Vi phạm đang ở trạng thái chờ duyệt');
    }

    // Use findByIdAndUpdate to avoid re-validating all required fields
    const violation = await ViolationLog.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'Chờ duyệt',
          approvedDate: null,
          notes: req.body.reason || 'Mở lại bởi Admin',
          updatedBy: req.userId,
        },
        $unset: {
          approvedBy: '',
        },
      },
      { new: true, runValidators: false }
    );

    // Auto-update WeeklySummary after status change
    await updateWeeklySummary(violation.week, violation.class, req.userId);

    await violation.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'student', select: 'studentId fullName' },
      { path: 'class', select: 'name grade' },
      { path: 'violationType', select: 'name category severity' },
      { path: 'reportedBy', select: 'fullName email role' },
    ]);

    return sendResponse(res, 200, true, 'Mở lại duyệt vi phạm thành công', {
      violation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật trạng thái vi phạm
 * @route PATCH /api/violation-logs/:id/status
 * @access GVCN, Admin
 */
const updateViolationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, approvalNotes } = req.body;

    const validStatuses = ['Chờ duyệt', 'Đã duyệt', 'Từ chối'];
    if (!validStatuses.includes(status)) {
      return sendError(res, 400, 'Trạng thái không hợp lệ');
    }

    // First check existence
    const existingViolation = await ViolationLog.findById(id);
    if (!existingViolation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    const updateData = {
      status,
      updatedBy: req.userId,
    };

    if (status === 'Đã duyệt') {
      updateData.approvedBy = req.userId;
      updateData.approvedDate = new Date();
      if (approvalNotes) updateData.approvalNotes = approvalNotes;
    } else if (status === 'Từ chối') {
      updateData.approvedBy = req.userId;
      updateData.approvedDate = new Date();
      if (approvalNotes) updateData.notes = approvalNotes;
    } else if (status === 'Chờ duyệt') {
      // Reopen - clear approval info
    }

    // Use findByIdAndUpdate to avoid re-validating all required fields
    const violation = await ViolationLog.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: false }
    );

    // Auto-update WeeklySummary after status change
    await updateWeeklySummary(violation.week, violation.class, req.userId);

    await violation.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'student', select: 'studentId fullName' },
      { path: 'class', select: 'name grade' },
      { path: 'violationType', select: 'name category severity' },
      { path: 'reportedBy', select: 'fullName email role' },
      { path: 'approvedBy', select: 'fullName email' },
    ]);

    return sendResponse(res, 200, true, 'Cập nhật trạng thái vi phạm thành công', {
      violation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa vi phạm
 * @route DELETE /api/violation-logs/:id
 * @access Admin (can delete even approved violations)
 */
const deleteViolationLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force } = req.query; // Force delete even if approved

    const existingViolation = await ViolationLog.findById(id);

    if (!existingViolation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    // Only restrict if not force AND not admin. 
    // Since route is Admin only, we allow force delete for approved violations.
    // If force=true, allow deletion regardless of status
    if (existingViolation.status === 'Đã duyệt' && force !== 'true') {
      return sendError(res, 409, 'Vi phạm đã duyệt. Sử dụng force=true để xóa.');
    }

    // Store week and class before deletion
    const weekId = existingViolation.week;
    const classId = existingViolation.class;

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
  updateViolationStatus,
  approveViolation,
  rejectViolation,
  reopenViolation,
  deleteViolationLog,
};

