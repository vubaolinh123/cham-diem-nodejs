const AcademicScore = require('../models/AcademicScore');
const Week = require('../models/Week');
const Class = require('../models/Class');
const SchoolYear = require('../models/SchoolYear');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy tất cả điểm học tập
 * @route GET /api/academic-scores
 * @access Authenticated
 */
const getAllAcademicScores = async (req, res, next) => {
  try {
    const { week, class: classId, status, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (week) filter.week = week;
    if (classId) filter.class = classId;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const scores = await AcademicScore.find(filter)
      .populate('week', 'weekNumber startDate endDate')
      .populate('class', 'name grade')
      .populate('scoredBy', 'fullName email')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ date: -1 });

    const total = await AcademicScore.countDocuments(filter);

    return sendResponse(res, 200, true, 'Lấy danh sách điểm học tập thành công', {
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
 * Lấy điểm học tập theo ID
 * @route GET /api/academic-scores/:id
 * @access Authenticated
 */
const getAcademicScoreById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const score = await AcademicScore.findById(id)
      .populate('week', 'weekNumber startDate endDate')
      .populate('class', 'name grade')
      .populate('scoredBy', 'fullName email');

    if (!score) {
      return sendError(res, 404, 'Điểm học tập không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin điểm học tập thành công', {
      score,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo/Cập nhật điểm học tập
 * @route POST /api/academic-scores
 * @access Red Flag, Homeroom Teacher, Admin
 */
const createAcademicScore = async (req, res, next) => {
  try {
    const { week, class: classId, date, dayOfWeek, lessons } = req.body;

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

    // Lấy hệ số điểm từ SchoolYear
    const schoolYear = await SchoolYear.findById(weekData.schoolYear);
    if (!schoolYear) {
      return sendError(res, 400, 'Năm học không tìm thấy');
    }

    // Kiểm tra ngày trong tuần
    const scoreDate = new Date(date);
    if (scoreDate < new Date(weekData.startDate) || scoreDate > new Date(weekData.endDate)) {
      return sendError(res, 400, 'Ngày chấm điểm phải nằm trong tuần');
    }

    // Tính toán điểm
    const calculation = calculateAcademicScore(lessons, schoolYear.academicScoringCoefficients, schoolYear.bonusConfiguration);

    // Kiểm tra ngày đã tồn tại
    let score = await AcademicScore.findOne({ week, class: classId, date });

    if (score) {
      // Cập nhật
      score.lessons = lessons;
      score.lessonStatistics = calculateLessonStatistics(lessons);
      score.academicCalculation = calculation;
      score.isGoodDay = calculation.goodDayBonus > 0;
      score.totalDailyScore = calculation.totalDailyScore;
      score.status = 'Nháp';
      score.updatedBy = req.userId;
    } else {
      // Tạo mới
      score = new AcademicScore({
        week,
        class: classId,
        date,
        dayOfWeek,
        lessons,
        lessonStatistics: calculateLessonStatistics(lessons),
        academicCalculation: calculation,
        isGoodDay: calculation.goodDayBonus > 0,
        totalDailyScore: calculation.totalDailyScore,
        scoredBy: req.userId,
        createdBy: req.userId,
      });
    }

    await score.save();
    await score.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'class', select: 'name grade' },
      { path: 'scoredBy', select: 'fullName email' },
    ]);

    return sendResponse(res, 201, true, 'Tạo/Cập nhật điểm học tập thành công', {
      score,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật trạng thái điểm học tập
 * @route PUT /api/academic-scores/:id/status
 * @access Homeroom Teacher, Admin
 */
const updateAcademicScoreStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const score = await AcademicScore.findById(id);

    if (!score) {
      return sendError(res, 404, 'Điểm học tập không tìm thấy');
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
 * Xóa điểm học tập
 * @route DELETE /api/academic-scores/:id
 * @access Admin
 */
const deleteAcademicScore = async (req, res, next) => {
  try {
    const { id } = req.params;

    const score = await AcademicScore.findById(id);

    if (!score) {
      return sendError(res, 404, 'Điểm học tập không tìm thấy');
    }

    // Kiểm tra tuần không khóa
    const week = await Week.findById(score.week);
    if (week.status === 'Khóa') {
      return sendError(res, 409, 'Tuần đã khóa, không thể xóa');
    }

    await AcademicScore.findByIdAndDelete(id);

    return sendResponse(res, 200, true, 'Xóa điểm học tập thành công');
  } catch (error) {
    next(error);
  }
};

/**
 * Tính toán điểm học tập
 * Công thức: (Tốt×20 + Khá×10 - Yếu×10 - Kém×20) ÷ Số tiết + Thưởng
 */
const calculateAcademicScore = (lessons, coefficients, bonusConfig) => {
  const stats = calculateLessonStatistics(lessons);
  const totalLessons = lessons.length || 1;

  const excellentPoints = stats.excellent * coefficients.excellent;
  const goodPoints = stats.good * coefficients.good;
  const poorPoints = stats.poor * coefficients.poor;
  const failingPoints = stats.failing * coefficients.failing;

  const subtotal = excellentPoints + goodPoints + poorPoints + failingPoints;
  const average = Math.round(subtotal / totalLessons);

  // Kiểm tra ngày học tốt (không có tiết yếu/kém)
  const isGoodDay = stats.poor === 0 && stats.failing === 0;
  const goodDayBonus = isGoodDay ? bonusConfig.goodDayBonus : 0;

  return {
    excellentPoints,
    goodPoints,
    poorPoints,
    failingPoints,
    subtotal,
    average,
    goodDayBonus,
    totalDailyScore: average + goodDayBonus,
  };
};

/**
 * Tính toán thống kê tiết học
 */
const calculateLessonStatistics = (lessons) => {
  const stats = {
    excellent: 0,
    good: 0,
    average: 0,
    poor: 0,
    failing: 0,
  };

  lessons.forEach((lesson) => {
    switch (lesson.quality) {
      case 'Tốt':
        stats.excellent++;
        break;
      case 'Khá':
        stats.good++;
        break;
      case 'Trung bình':
        stats.average++;
        break;
      case 'Yếu':
        stats.poor++;
        break;
      case 'Kém':
        stats.failing++;
        break;
    }
  });

  return stats;
};

module.exports = {
  getAllAcademicScores,
  getAcademicScoreById,
  createAcademicScore,
  updateAcademicScoreStatus,
  deleteAcademicScore,
};

