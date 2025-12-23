const Week = require('../models/Week');
const ConductScore = require('../models/ConductScore');
const AcademicScore = require('../models/AcademicScore');
const ViolationLog = require('../models/ViolationLog');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy tất cả tuần
 * @route GET /api/weeks
 * @access Authenticated
 */
const getAllWeeks = async (req, res, next) => {
  try {
    const { schoolYear, status, startDate, endDate, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (schoolYear) filter.schoolYear = schoolYear;
    if (status) filter.status = status;
    
    // Date range filter
    if (startDate || endDate) {
      filter.startDate = {};
      if (startDate) filter.startDate.$gte = new Date(startDate);
      if (endDate) filter.startDate.$lte = new Date(endDate);
    }

    const limitNumber = parseInt(limit);
    let weeks;
    let total;

    if (limit === '0') {
      weeks = await Week.find(filter)
        .populate('schoolYear', 'year')
        .populate('approvedBy', 'fullName email')
        .populate('lockedBy', 'fullName email')
        .sort({ weekNumber: -1 });
      total = weeks.length;
    } else {
      const skip = (page - 1) * limitNumber;
      weeks = await Week.find(filter)
        .populate('schoolYear', 'year')
        .populate('approvedBy', 'fullName email')
        .populate('lockedBy', 'fullName email')
        .skip(skip)
        .limit(limitNumber)
        .sort({ weekNumber: -1 });
      total = await Week.countDocuments(filter);
    }


    return sendResponse(res, 200, true, 'Lấy danh sách tuần thành công', {
      weeks,
      pagination: {
        total,
        page: parseInt(page),
        limit: limit === '0' ? total : parseInt(limit),
        pages: limit === '0' ? 1 : Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Lấy tuần theo ID
 * @route GET /api/weeks/:id
 * @access Authenticated
 */
const getWeekById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const week = await Week.findById(id)
      .populate('schoolYear', 'year')
      .populate('approvedBy', 'fullName email')
      .populate('lockedBy', 'fullName email')
      .populate('assignedClasses.scoringClass', 'name')
      .populate('assignedClasses.targetClasses', 'name');

    if (!week) {
      return sendError(res, 404, 'Tuần không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin tuần thành công', {
      week,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo tuần mới
 * @route POST /api/weeks
 * @access Admin
 */
const createWeek = async (req, res, next) => {
  try {
    const {
      schoolYear,
      weekNumber,
      startDate,
      endDate,
      assignedClasses,
      notes,
    } = req.body;

    // Kiểm tra tuần đã tồn tại
    const existingWeek = await Week.findOne({ schoolYear, weekNumber });
    if (existingWeek) {
      return sendError(res, 400, 'Tuần này đã tồn tại trong năm học này');
    }

    // Kiểm tra ngày hợp lệ
    if (new Date(startDate) >= new Date(endDate)) {
      return sendError(res, 400, 'Ngày bắt đầu phải trước ngày kết thúc');
    }

    const week = new Week({
      schoolYear,
      weekNumber,
      startDate,
      endDate,
      assignedClasses,
      notes,
      createdBy: req.userId,
    });

    await week.save();
    await week.populate([
      { path: 'schoolYear', select: 'year' },
      { path: 'assignedClasses.scoringClass', select: 'name' },
      { path: 'assignedClasses.targetClasses', select: 'name' },
    ]);

    return sendResponse(res, 201, true, 'Tạo tuần thành công', {
      week,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật tuần
 * @route PUT /api/weeks/:id
 * @access Admin
 */
const updateWeek = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, assignedClasses, notes, weekNumber, status } = req.body;

    const week = await Week.findById(id);

    if (!week) {
      return sendError(res, 404, 'Tuần không tìm thấy');
    }

    // Không cho phép sửa tuần đã khóa
    if (week.status === 'Khóa') {
      return sendError(res, 409, 'Không thể sửa tuần đã khóa');
    }

    if (startDate && endDate) {
      if (new Date(startDate) >= new Date(endDate)) {
        return sendError(res, 400, 'Ngày bắt đầu phải trước ngày kết thúc');
      }
      week.startDate = startDate;
      week.endDate = endDate;
    }

    if (weekNumber !== undefined) week.weekNumber = weekNumber;
    if (status) week.status = status;
    if (assignedClasses) week.assignedClasses = assignedClasses;
    if (notes !== undefined) week.notes = notes;


    week.updatedBy = req.userId;
    await week.save();
    await week.populate([
      { path: 'schoolYear', select: 'year' },
      { path: 'assignedClasses.scoringClass', select: 'name' },
      { path: 'assignedClasses.targetClasses', select: 'name' },
    ]);

    return sendResponse(res, 200, true, 'Cập nhật tuần thành công', {
      week,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Duyệt tuần (GVCN)
 * @route PUT /api/weeks/:id/approve
 * @access Homeroom Teacher, Admin
 */
const approveWeek = async (req, res, next) => {
  try {
    const { id } = req.params;

    const week = await Week.findById(id);

    if (!week) {
      return sendError(res, 404, 'Tuần không tìm thấy');
    }

    if (week.status === 'Khóa') {
      return sendError(res, 409, 'Tuần đã khóa, không thể duyệt');
    }

    week.status = 'Duyệt';
    week.approvedBy = req.userId;
    week.approvedDate = new Date();
    week.updatedBy = req.userId;

    await week.save();
    await week.populate([
      { path: 'schoolYear', select: 'year' },
      { path: 'approvedBy', select: 'fullName email' },
    ]);

    return sendResponse(res, 200, true, 'Duyệt tuần thành công', {
      week,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Khóa tuần (Bí thư/Phó bí thư)
 * @route PUT /api/weeks/:id/lock
 * @access Class Leader, Admin
 */
const lockWeek = async (req, res, next) => {
  try {
    const { id } = req.params;

    const week = await Week.findById(id);

    if (!week) {
      return sendError(res, 404, 'Tuần không tìm thấy');
    }

    if (week.status !== 'Duyệt') {
      return sendError(res, 409, 'Tuần phải ở trạng thái "Duyệt" mới có thể khóa');
    }

    week.status = 'Khóa';
    week.lockedBy = req.userId;
    week.lockedDate = new Date();
    week.updatedBy = req.userId;

    await week.save();
    await week.populate([
      { path: 'schoolYear', select: 'year' },
      { path: 'lockedBy', select: 'fullName email' },
    ]);

    return sendResponse(res, 200, true, 'Khóa tuần thành công', {
      week,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy trạng thái hoàn thành của tuần
 * @route GET /api/weeks/:id/status
 * @access Authenticated
 */
const getWeekStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const week = await Week.findById(id);

    if (!week) {
      return sendError(res, 404, 'Tuần không tìm thấy');
    }

    // Đếm số lớp đã hoàn thành chấm điểm
    const conductScores = await ConductScore.countDocuments({
      week: id,
      status: { $in: ['Hoàn thành', 'Duyệt', 'Khóa'] },
    });

    const academicScores = await AcademicScore.countDocuments({
      week: id,
      status: { $in: ['Hoàn thành', 'Duyệt', 'Khóa'] },
    });

    const violations = await ViolationLog.countDocuments({
      week: id,
      status: 'Đã duyệt',
    });

    const totalClasses = week.assignedClasses.length;

    return sendResponse(res, 200, true, 'Lấy trạng thái tuần thành công', {
      status: {
        weekStatus: week.status,
        conductScoresCompleted: conductScores,
        academicScoresCompleted: academicScores,
        violationsApproved: violations,
        totalClasses,
        completionPercentage: totalClasses > 0 ? Math.round((conductScores / totalClasses) * 100) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa tuần (Admin)
 * @route DELETE /api/weeks/:id
 * @access Admin
 */
const deleteWeek = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { force } = req.query;

    const week = await Week.findById(id);

    if (!week) {
      return sendError(res, 404, 'Tuần không tìm thấy');
    }

    // Kiểm tra dữ liệu liên quan
    const WeeklySummary = require('../models/WeeklySummary');
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');
    const ViolationLog = require('../models/ViolationLog');

    const summaryCount = await WeeklySummary.countDocuments({ week: id });
    const disciplineCount = await DisciplineGrading.countDocuments({ week: id });
    const academicCount = await ClassAcademicGrading.countDocuments({ week: id });
    const violationCount = await ViolationLog.countDocuments({ week: id });

    const totalRelated = summaryCount + disciplineCount + academicCount + violationCount;

    if (totalRelated > 0 && force !== 'true') {
      return res.status(409).json({
        success: false,
        message: 'Tuần này đang có dữ liệu liên quan. Bạn có chắc chắn muốn xóa?',
        details: {
          summaries: summaryCount,
          disciplineGradings: disciplineCount,
          academicGradings: academicCount,
          violations: violationCount,
        },
        requiresConfirmation: true,
      });
    }

    // Xóa dữ liệu liên quan nếu force=true hoặc không có dữ liệu
    if (totalRelated > 0) {
      await Promise.all([
        WeeklySummary.deleteMany({ week: id }),
        DisciplineGrading.deleteMany({ week: id }),
        ClassAcademicGrading.deleteMany({ week: id }),
        ViolationLog.deleteMany({ week: id }),
      ]);
    }

    await Week.findByIdAndDelete(id);

    return sendResponse(res, 200, true, 'Xóa tuần và toàn bộ dữ liệu liên quan thành công');
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa nhiều tuần cùng lúc (Admin)
 * @route DELETE /api/weeks/bulk
 * @access Admin
 */
const bulkDeleteWeeks = async (req, res, next) => {
  try {
    const { ids, force } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return sendError(res, 400, 'Vui lòng cung cấp danh sách ID tuần cần xóa');
    }

    // Check for related data
    const WeeklySummary = require('../models/WeeklySummary');
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');

    const relatedCounts = {
      weeklySummary: await WeeklySummary.countDocuments({ week: { $in: ids } }),
      disciplineGrading: await DisciplineGrading.countDocuments({ week: { $in: ids } }),
      academicGrading: await ClassAcademicGrading.countDocuments({ week: { $in: ids } }),
      violationLog: await ViolationLog.countDocuments({ week: { $in: ids } }),
    };

    const totalRelated = Object.values(relatedCounts).reduce((a, b) => a + b, 0);

    if (totalRelated > 0 && !force) {
      return res.status(409).json({
        success: false,
        requiresConfirmation: true,
        message: `Có ${totalRelated} bản ghi liên quan đến các tuần này`,
        details: relatedCounts,
      });
    }

    // Delete related data first if force
    if (force && totalRelated > 0) {
      await Promise.all([
        WeeklySummary.deleteMany({ week: { $in: ids } }),
        DisciplineGrading.deleteMany({ week: { $in: ids } }),
        ClassAcademicGrading.deleteMany({ week: { $in: ids } }),
        ViolationLog.deleteMany({ week: { $in: ids } }),
      ]);
    }

    // Delete weeks
    const result = await Week.deleteMany({ _id: { $in: ids } });

    return sendResponse(res, 200, true, `Đã xóa ${result.deletedCount} tuần${force && totalRelated > 0 ? ' và toàn bộ dữ liệu liên quan' : ''}`, {
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xem trước dữ liệu sẽ bị xóa khi xóa tuần
 * @route GET /api/weeks/:id/delete-preview
 * @access Admin
 */
const getDeletePreview = async (req, res, next) => {
  try {
    const { id } = req.params;

    const week = await Week.findById(id).populate('schoolYear', 'year');
    if (!week) {
      return sendError(res, 404, 'Tuần không tìm thấy');
    }

    const WeeklySummary = require('../models/WeeklySummary');
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');

    const [summaryCount, disciplineCount, academicCount, violationCount] = await Promise.all([
      WeeklySummary.countDocuments({ week: id }),
      DisciplineGrading.countDocuments({ week: id }),
      ClassAcademicGrading.countDocuments({ week: id }),
      ViolationLog.countDocuments({ week: id }),
    ]);

    const total = summaryCount + disciplineCount + academicCount + violationCount;

    return sendResponse(res, 200, true, 'Lấy thông tin xóa thành công', {
      item: {
        _id: week._id,
        weekNumber: week.weekNumber,
        schoolYear: week.schoolYear?.year,
        startDate: week.startDate,
        endDate: week.endDate,
      },
      willDelete: {
        weeklySummaries: summaryCount,
        disciplineGradings: disciplineCount,
        academicGradings: academicCount,
        violations: violationCount,
        total,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xem trước dữ liệu sẽ bị xóa khi xóa nhiều tuần
 * @route POST /api/weeks/bulk-delete-preview
 * @access Admin
 */
const getBulkDeletePreview = async (req, res, next) => {
  try {
    const { weekIds } = req.body;

    if (!weekIds || !Array.isArray(weekIds) || weekIds.length === 0) {
      return sendError(res, 400, 'Danh sách tuần không hợp lệ');
    }

    const weeks = await Week.find({ _id: { $in: weekIds } }).populate('schoolYear', 'year');

    const WeeklySummary = require('../models/WeeklySummary');
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');

    const [summaryCount, disciplineCount, academicCount, violationCount] = await Promise.all([
      WeeklySummary.countDocuments({ week: { $in: weekIds } }),
      DisciplineGrading.countDocuments({ week: { $in: weekIds } }),
      ClassAcademicGrading.countDocuments({ week: { $in: weekIds } }),
      ViolationLog.countDocuments({ week: { $in: weekIds } }),
    ]);

    const total = summaryCount + disciplineCount + academicCount + violationCount;

    return sendResponse(res, 200, true, 'Lấy thông tin xóa thành công', {
      weeks: weeks.map(w => ({
        _id: w._id,
        weekNumber: w.weekNumber,
        schoolYear: w.schoolYear?.year,
      })),
      willDelete: {
        weeks: weeks.length,
        weeklySummaries: summaryCount,
        disciplineGradings: disciplineCount,
        academicGradings: academicCount,
        violations: violationCount,
        total: weeks.length + total,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllWeeks,
  getWeekById,
  createWeek,
  updateWeek,
  approveWeek,
  lockWeek,
  getWeekStatus,
  deleteWeek,
  bulkDeleteWeeks,
  getDeletePreview,
  getBulkDeletePreview,
};




