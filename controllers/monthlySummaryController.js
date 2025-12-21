const MonthlySummary = require('../models/MonthlySummary');
const WeeklySummary = require('../models/WeeklySummary');
const Week = require('../models/Week');
const Class = require('../models/Class');
const SchoolYear = require('../models/SchoolYear');
const ViolationLog = require('../models/ViolationLog');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy tất cả tổng hợp tháng
 * @route GET /api/monthly-summaries
 * @access Authenticated
 */
const getAllMonthlySummaries = async (req, res, next) => {
  try {
    const { schoolYear, month, year, class: classId, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (schoolYear) filter.schoolYear = schoolYear;
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    if (classId) filter.class = classId;

    const skip = (page - 1) * limit;

    const summaries = await MonthlySummary.find(filter)
      .populate('schoolYear', 'year')
      .populate('class', 'name grade')
      .populate('weeks', 'weekNumber startDate endDate')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ year: -1, month: -1 });

    const total = await MonthlySummary.countDocuments(filter);

    return sendResponse(res, 200, true, 'Lấy danh sách tổng hợp tháng thành công', {
      summaries,
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
 * Lấy tổng hợp tháng theo ID
 * @route GET /api/monthly-summaries/:id
 * @access Authenticated
 */
const getMonthlySummaryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const summary = await MonthlySummary.findById(id)
      .populate('schoolYear', 'year')
      .populate('class', 'name grade')
      .populate('weeks', 'weekNumber startDate endDate')
      .populate('violations.byType.violationType', 'name category')
      .populate('violations.topViolators.student', 'studentId fullName')
      .populate('honorRoll.student', 'studentId fullName')
      .populate('criticalList.student', 'studentId fullName');

    if (!summary) {
      return sendError(res, 404, 'Tổng hợp tháng không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin tổng hợp tháng thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo/Cập nhật tổng hợp tháng
 * @route POST /api/monthly-summaries/generate
 * @access Admin
 */
const generateMonthlySummary = async (req, res, next) => {
  try {
    const { schoolYear, month, year, class: classId } = req.body;

    // Kiểm tra năm học tồn tại
    const schoolYearData = await SchoolYear.findById(schoolYear);
    if (!schoolYearData) {
      return sendError(res, 400, 'Năm học không tìm thấy');
    }

    // Kiểm tra lớp tồn tại
    const classData = await Class.findById(classId);
    if (!classData) {
      return sendError(res, 400, 'Lớp không tìm thấy');
    }

    // Lấy các tuần trong tháng
    const weeks = await Week.find({
      schoolYear,
      startDate: {
        $gte: new Date(year, month - 1, 1),
        $lt: new Date(year, month, 1),
      },
    });

    if (weeks.length === 0) {
      return sendError(res, 400, 'Không có tuần nào trong tháng này');
    }

    // Lấy tổng hợp tuần
    const weeklySummaries = await WeeklySummary.find({
      week: { $in: weeks.map((w) => w._id) },
      class: classId,
    });

    // Lấy vi phạm trong tháng
    const violations = await ViolationLog.find({
      week: { $in: weeks.map((w) => w._id) },
      class: classId,
    }).populate('violationType', 'name category');

    // Tính toán tổng hợp
    const conductData = aggregateMonthlyConductScores(weeklySummaries);
    const academicData = aggregateMonthlyAcademicScores(weeklySummaries);
    const violationData = aggregateMonthlyViolations(violations);
    const bonusData = aggregateMonthlyBonuses(weeklySummaries);

    const totalScore = conductData.total + academicData.total + bonusData.total;
    const classification = classifyScore(totalScore, schoolYearData.classificationThresholds);

    // Tạo danh sách danh dự và phê bình
    const honorRoll = generateHonorRoll(weeklySummaries);
    const criticalList = generateCriticalList(weeklySummaries);

    // Kiểm tra tổng hợp đã tồn tại
    let summary = await MonthlySummary.findOne({
      schoolYear,
      month,
      year,
      class: classId,
    });

    if (summary) {
      // Cập nhật
      summary.weeks = weeks.map((w) => w._id);
      summary.conductScores = conductData;
      summary.academicScores = academicData;
      summary.bonuses = bonusData;
      summary.violations = violationData;
      summary.classification = classification;
      summary.honorRoll = honorRoll;
      summary.criticalList = criticalList;
      summary.updatedBy = req.userId;
    } else {
      // Tạo mới
      summary = new MonthlySummary({
        schoolYear,
        month,
        year,
        class: classId,
        weeks: weeks.map((w) => w._id),
        conductScores: conductData,
        academicScores: academicData,
        bonuses: bonusData,
        violations: violationData,
        classification,
        honorRoll,
        criticalList,
        createdBy: req.userId,
      });
    }

    await summary.save();
    await summary.populate([
      { path: 'schoolYear', select: 'year' },
      { path: 'class', select: 'name grade' },
      { path: 'weeks', select: 'weekNumber startDate endDate' },
    ]);

    return sendResponse(res, 201, true, 'Tạo/Cập nhật tổng hợp tháng thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tổng hợp điểm nề nếp theo tháng
 */
const aggregateMonthlyConductScores = (weeklySummaries) => {
  if (weeklySummaries.length === 0) {
    return { total: 0, average: 0, byWeek: [] };
  }

  const total = weeklySummaries.reduce((sum, summary) => sum + summary.conductScores.total, 0);
  const average = Math.round(total / weeklySummaries.length);

  return {
    total,
    average,
    byWeek: weeklySummaries.map((summary) => ({
      week: summary.week,
      score: summary.conductScores.total,
    })),
  };
};

/**
 * Tổng hợp điểm học tập theo tháng
 */
const aggregateMonthlyAcademicScores = (weeklySummaries) => {
  if (weeklySummaries.length === 0) {
    return { total: 0, average: 0, goodDays: 0, byWeek: [] };
  }

  const total = weeklySummaries.reduce((sum, summary) => sum + summary.academicScores.total, 0);
  const average = Math.round(total / weeklySummaries.length);
  const goodDays = weeklySummaries.reduce((sum, summary) => sum + summary.academicScores.goodDays, 0);

  return {
    total,
    average,
    goodDays,
    byWeek: weeklySummaries.map((summary) => ({
      week: summary.week,
      score: summary.academicScores.total,
      goodDays: summary.academicScores.goodDays,
    })),
  };
};

/**
 * Tổng hợp vi phạm theo tháng
 */
const aggregateMonthlyViolations = (violations) => {
  const approved = violations.filter((v) => v.status === 'Đã duyệt').length;
  const pending = violations.filter((v) => v.status === 'Chờ duyệt').length;

  const byType = {};
  violations.forEach((violation) => {
    const typeName = violation.violationType?.name || 'Khác';
    if (!byType[typeName]) {
      byType[typeName] = {
        violationType: violation.violationType?._id,
        count: 0,
      };
    }
    byType[typeName].count++;
  });

  const topViolators = getTopViolators(violations, 10);

  return {
    total: violations.length,
    approved,
    pending,
    byType: Object.values(byType),
    topViolators,
  };
};

/**
 * Tổng hợp thưởng theo tháng
 */
const aggregateMonthlyBonuses = (weeklySummaries) => {
  const total = weeklySummaries.reduce((sum, summary) => sum + summary.bonuses.total, 0);

  return {
    total,
    byWeek: weeklySummaries.map((summary) => ({
      week: summary.week,
      bonus: summary.bonuses.total,
    })),
  };
};

/**
 * Phân loại điểm
 */
const classifyScore = (totalScore, thresholds) => {
  let flag = 'Không xếp cờ';
  if (totalScore >= thresholds.redFlag) {
    flag = 'Cờ đỏ';
  } else if (totalScore >= thresholds.greenFlag) {
    flag = 'Cờ xanh';
  } else if (totalScore >= thresholds.yellowFlag) {
    flag = 'Cờ vàng';
  }

  return {
    flag,
    totalScore,
    ranking: 0,
  };
};

/**
 * Tạo danh sách danh dự
 */
const generateHonorRoll = (weeklySummaries) => {
  // Lấy các lớp có cờ đỏ hoặc cờ xanh
  return weeklySummaries
    .filter((s) => ['Cờ đỏ', 'Cờ xanh'].includes(s.classification.flag))
    .map((s) => ({
      student: s.class,
      score: s.classification.totalScore,
      flag: s.classification.flag,
    }));
};

/**
 * Tạo danh sách phê bình
 */
const generateCriticalList = (weeklySummaries) => {
  // Lấy các lớp có cờ vàng hoặc không xếp cờ
  return weeklySummaries
    .filter((s) => ['Cờ vàng', 'Không xếp cờ'].includes(s.classification.flag))
    .map((s) => ({
      student: s.class,
      score: s.classification.totalScore,
      flag: s.classification.flag,
    }));
};

/**
 * Lấy học sinh vi phạm nhiều nhất
 */
const getTopViolators = (violations, limit = 10) => {
  const violatorMap = {};

  violations.forEach((violation) => {
    const studentId = violation.student._id.toString();
    if (!violatorMap[studentId]) {
      violatorMap[studentId] = {
        student: violation.student,
        count: 0,
        violations: [],
      };
    }
    violatorMap[studentId].count++;
    violatorMap[studentId].violations.push({
      violationType: violation.violationType?.name,
      date: violation.date,
    });
  });

  return Object.values(violatorMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

module.exports = {
  getAllMonthlySummaries,
  getMonthlySummaryById,
  generateMonthlySummary,
};

