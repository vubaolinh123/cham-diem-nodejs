const ConductScore = require('../models/ConductScore');
const Week = require('../models/Week');
const Class = require('../models/Class');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy tất cả điểm nề nếp
 * @route GET /api/conduct-scores
 * @access Authenticated
 */
const getAllConductScores = async (req, res, next) => {
  try {
    const { week, class: classId, status, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (week) filter.week = week;
    if (classId) filter.class = classId;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const scores = await ConductScore.find(filter)
      .populate('week', 'weekNumber startDate endDate')
      .populate('class', 'name grade')
      .populate('scoredBy', 'fullName email')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ date: -1 });

    const total = await ConductScore.countDocuments(filter);

    return sendResponse(res, 200, true, 'Lấy danh sách điểm nề nếp thành công', {
      scores,
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
 * Lấy điểm nề nếp theo ID
 * @route GET /api/conduct-scores/:id
 * @access Authenticated
 */
const getConductScoreById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const score = await ConductScore.findById(id)
      .populate('week', 'weekNumber startDate endDate')
      .populate('class', 'name grade')
      .populate('scoredBy', 'fullName email')
      .populate('items.violatingStudents', 'studentId fullName');

    if (!score) {
      return sendError(res, 404, 'Điểm nề nếp không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin điểm nề nếp thành công', {
      score,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo/Cập nhật điểm nề nếp
 * @route POST /api/conduct-scores
 * @access Red Flag, Homeroom Teacher, Admin
 */
const createConductScore = async (req, res, next) => {
  try {
    const { week, class: classId, date, dayOfWeek, items } = req.body;

    // Kiểm tra tuần tồn tại
    const weekData = await Week.findById(week);
    if (!weekData) {
      return sendError(res, 400, 'Tuần không tìm thấy');
    }

    // Kiểm tra tuần không khóa
    if (weekData.status === 'Khóa') {
      return sendError(res, 409, 'Tuần đã khóa, không thể chấm điểm');
    }

    // Kiểm tra lớp tồn tại
    const classData = await Class.findById(classId);
    if (!classData) {
      return sendError(res, 400, 'Lớp không tìm thấy');
    }

    // Kiểm tra ngày trong tuần
    const scoreDate = new Date(date);
    if (scoreDate < new Date(weekData.startDate) || scoreDate > new Date(weekData.endDate)) {
      return sendError(res, 400, 'Ngày chấm điểm phải nằm trong tuần');
    }

    // Kiểm tra ngày đã tồn tại
    let score = await ConductScore.findOne({ week, class: classId, date });

    if (score) {
      // Cập nhật
      score.items = items;
      score.totalDailyScore = calculateConductTotal(items);
      score.status = 'Nháp';
      score.updatedBy = req.userId;
    } else {
      // Tạo mới
      score = new ConductScore({
        week,
        class: classId,
        date,
        dayOfWeek,
        items,
        totalDailyScore: calculateConductTotal(items),
        scoredBy: req.userId,
        createdBy: req.userId,
      });
    }

    await score.save();
    await score.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'class', select: 'name grade' },
      { path: 'scoredBy', select: 'fullName email' },
      { path: 'items.violatingStudents', select: 'studentId fullName' },
    ]);

    return sendResponse(res, 201, true, 'Tạo/Cập nhật điểm nề nếp thành công', {
      score,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật trạng thái điểm nề nếp
 * @route PUT /api/conduct-scores/:id/status
 * @access Homeroom Teacher, Admin
 */
const updateConductScoreStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const score = await ConductScore.findById(id);

    if (!score) {
      return sendError(res, 404, 'Điểm nề nếp không tìm thấy');
    }

    // Kiểm tra tuần không khóa
    const week = await Week.findById(score.week);
    if (week.status === 'Khóa') {
      return sendError(res, 409, 'Tuần đã khóa, không thể thay đổi trạng thái');
    }

    score.status = status;
    score.updatedBy = req.userId;
    await score.save();

    return sendResponse(res, 200, true, 'Cập nhật trạng thái thành công', {
      score,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa điểm nề nếp
 * @route DELETE /api/conduct-scores/:id
 * @access Admin
 */
const deleteConductScore = async (req, res, next) => {
  try {
    const { id } = req.params;

    const score = await ConductScore.findById(id);

    if (!score) {
      return sendError(res, 404, 'Điểm nề nếp không tìm thấy');
    }

    // Kiểm tra tuần không khóa
    const week = await Week.findById(score.week);
    if (week.status === 'Khóa') {
      return sendError(res, 409, 'Tuần đã khóa, không thể xóa');
    }

    await ConductScore.findByIdAndDelete(id);

    return sendResponse(res, 200, true, 'Xóa điểm nề nếp thành công');
  } catch (error) {
    next(error);
  }
};

/**
 * Tính tổng điểm nề nếp
 * Công thức: max(0, 5 - violationCount) cho mỗi mục
 */
const calculateConductTotal = (items) => {
  if (!items || items.length === 0) return 0;
  return items.reduce((total, item) => {
    const itemScore = Math.max(0, 5 - (item.violationCount || 0));
    return total + itemScore;
  }, 0);
};

module.exports = {
  getAllConductScores,
  getConductScoreById,
  createConductScore,
  updateConductScoreStatus,
  deleteConductScore,
};

