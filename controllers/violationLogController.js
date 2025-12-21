const ViolationLog = require('../models/ViolationLog');
const Week = require('../models/Week');
const Student = require('../models/Student');
const ViolationType = require('../models/ViolationType');
const { sendResponse, sendError } = require('../utils/helpers');

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
      .populate('reportedBy', 'fullName email')
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
      .populate('reportedBy', 'fullName email')
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
 * @access Red Flag, Homeroom Teacher, Admin
 */
const createViolationLog = async (req, res, next) => {
  try {
    const {
      week,
      date,
      student,
      class: classId,
      violationType,
      description,
      violationTime,
      location,
      evidence,
      notes,
    } = req.body;

    // Kiểm tra tuần tồn tại
    const weekData = await Week.findById(week);
    if (!weekData) {
      return sendError(res, 400, 'Tuần không tìm thấy');
    }

    // Kiểm tra học sinh tồn tại
    const studentData = await Student.findById(student);
    if (!studentData) {
      return sendError(res, 400, 'Học sinh không tìm thấy');
    }

    // Kiểm tra loại vi phạm tồn tại
    const violationTypeData = await ViolationType.findById(violationType);
    if (!violationTypeData) {
      return sendError(res, 400, 'Loại vi phạm không tìm thấy');
    }

    // Kiểm tra ngày trong tuần
    const violationDate = new Date(date);
    if (violationDate < new Date(weekData.startDate) || violationDate > new Date(weekData.endDate)) {
      return sendError(res, 400, 'Ngày vi phạm phải nằm trong tuần');
    }

    // Kiểm tra trùng lặp
    const duplicate = await detectDuplicate(student, violationType, date);

    const violation = new ViolationLog({
      week,
      date,
      student,
      class: classId,
      violationType,
      description,
      violationTime,
      location,
      evidence: evidence || [],
      reportedBy: req.userId,
      severity: violationTypeData.severity,
      category: violationTypeData.category,
      isDuplicate: !!duplicate,
      duplicateOf: duplicate ? duplicate._id : null,
      notes,
      createdBy: req.userId,
    });

    await violation.save();
    await violation.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'student', select: 'studentId fullName' },
      { path: 'class', select: 'name grade' },
      { path: 'violationType', select: 'name category severity' },
      { path: 'reportedBy', select: 'fullName email' },
    ]);

    return sendResponse(res, 201, true, 'Tạo vi phạm thành công', {
      violation,
      isDuplicate: !!duplicate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật vi phạm
 * @route PUT /api/violation-logs/:id
 * @access Red Flag, Homeroom Teacher, Admin
 */
const updateViolationLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      description,
      violationTime,
      location,
      evidence,
      notes,
    } = req.body;

    const violation = await ViolationLog.findById(id);

    if (!violation) {
      return sendError(res, 404, 'Vi phạm không tìm thấy');
    }

    // Không cho phép sửa vi phạm đã duyệt
    if (violation.status === 'Đã duyệt') {
      return sendError(res, 409, 'Không thể sửa vi phạm đã duyệt');
    }

    if (description) violation.description = description;
    if (violationTime) violation.violationTime = violationTime;
    if (location) violation.location = location;
    if (evidence) violation.evidence = evidence;
    if (notes) violation.notes = notes;

    violation.updatedBy = req.userId;
    await violation.save();
    await violation.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'student', select: 'studentId fullName' },
      { path: 'class', select: 'name grade' },
      { path: 'violationType', select: 'name category severity' },
      { path: 'reportedBy', select: 'fullName email' },
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
    violation.notes = reason || violation.notes;
    violation.updatedBy = req.userId;

    await violation.save();
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

    await ViolationLog.findByIdAndDelete(id);

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

