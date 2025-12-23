const WeeklySummary = require('../models/WeeklySummary');
const Week = require('../models/Week');
const Class = require('../models/Class');
const ConductScore = require('../models/ConductScore');
const AcademicScore = require('../models/AcademicScore');
const ViolationLog = require('../models/ViolationLog');
const SchoolYear = require('../models/SchoolYear');
const DisciplineGrading = require('../models/DisciplineGrading');
const ClassAcademicGrading = require('../models/ClassAcademicGrading');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy tất cả tổng hợp tuần
 * @route GET /api/weekly-summaries
 * @access Authenticated
 */
const getAllWeeklySummaries = async (req, res, next) => {
  try {
    const { week, class: classId, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (week) filter.week = week;
    if (classId) filter.class = classId;

    const skip = (page - 1) * limit;

    const summaries = await WeeklySummary.find(filter)
      .populate('week', 'weekNumber startDate endDate')
      .populate('class', 'name grade')
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ week: -1 });

    const total = await WeeklySummary.countDocuments(filter);

    return sendResponse(res, 200, true, 'Lấy danh sách tổng hợp tuần thành công', {
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
 * Lấy tổng hợp tuần theo ID
 * @route GET /api/weekly-summaries/:id
 * @access Authenticated
 */
const getWeeklySummaryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const summary = await WeeklySummary.findById(id)
      .populate('week', 'weekNumber startDate endDate')
      .populate('class', 'name grade')
      .populate('violations.byType.violationType', 'name category')
      .populate('violations.topViolators.student', 'studentId fullName');

    if (!summary) {
      return sendError(res, 404, 'Tổng hợp tuần không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin tổng hợp tuần thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo/Cập nhật tổng hợp tuần
 * @route POST /api/weekly-summaries/generate
 * @access Admin
 */
const generateWeeklySummary = async (req, res, next) => {
  try {
    const { week, class: classId } = req.body;

    // Kiểm tra tuần tồn tại
    const weekData = await Week.findById(week);
    if (!weekData) {
      return sendError(res, 400, 'Tuần không tìm thấy');
    }

    // Kiểm tra lớp tồn tại
    const classData = await Class.findById(classId);
    if (!classData) {
      return sendError(res, 400, 'Lớp không tìm thấy');
    }

    // Lấy dữ liệu điểm nề nếp
    const conductScores = await ConductScore.find({
      week,
      class: classId,
      status: { $in: ['Hoàn thành', 'Duyệt', 'Khóa'] },
    });

    // Lấy dữ liệu điểm học tập
    const academicScores = await AcademicScore.find({
      week,
      class: classId,
      status: { $in: ['Hoàn thành', 'Duyệt', 'Khóa'] },
    });

    // Lấy dữ liệu vi phạm
    const violations = await ViolationLog.find({
      week,
      class: classId,
    }).populate('violationType', 'name category');

    // Lấy cấu hình năm học
    const schoolYear = await SchoolYear.findById(weekData.schoolYear);

    // Tính toán tổng hợp
    const conductData = aggregateConductScores(conductScores);
    const academicData = aggregateAcademicScores(academicScores);
    const violationData = aggregateViolations(violations);
    const bonusData = calculateBonuses(conductData, academicData, schoolYear.bonusConfiguration);

    const totalScore = conductData.total + academicData.total + bonusData.total;
    const classification = classifyScore(totalScore, schoolYear.classificationThresholds);

    // Kiểm tra tổng hợp đã tồn tại
    let summary = await WeeklySummary.findOne({ week, class: classId });

    if (summary) {
      // Cập nhật
      summary.conductScores = conductData;
      summary.academicScores = academicData;
      summary.bonuses = bonusData;
      summary.violations = violationData;
      summary.classification = classification;
      summary.updatedBy = req.userId;
    } else {
      // Tạo mới
      summary = new WeeklySummary({
        week,
        class: classId,
        conductScores: conductData,
        academicScores: academicData,
        bonuses: bonusData,
        violations: violationData,
        classification,
        createdBy: req.userId,
      });
    }

    await summary.save();
    await summary.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'class', select: 'name grade' },
    ]);

    return sendResponse(res, 201, true, 'Tạo/Cập nhật tổng hợp tuần thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tổng hợp điểm nề nếp
 */
const aggregateConductScores = (scores) => {
  if (scores.length === 0) {
    return {
      total: 0,
      average: 0,
      byDay: [],
      byItem: [],
    };
  }

  const total = scores.reduce((sum, score) => sum + score.totalDailyScore, 0);
  const average = Math.round(total / scores.length);

  return {
    total,
    average,
    byDay: scores.map((score) => ({
      date: score.date,
      dayOfWeek: score.dayOfWeek,
      score: score.totalDailyScore,
    })),
    byItem: aggregateByItem(scores),
  };
};

/**
 * Tổng hợp điểm học tập
 */
const aggregateAcademicScores = (scores) => {
  if (scores.length === 0) {
    return {
      total: 0,
      average: 0,
      goodDays: 0,
      byDay: [],
      lessonStatistics: { excellent: 0, good: 0, average: 0, poor: 0, failing: 0 },
    };
  }

  const total = scores.reduce((sum, score) => sum + score.totalDailyScore, 0);
  const average = Math.round(total / scores.length);
  const goodDays = scores.filter((score) => score.isGoodDay).length;

  const lessonStats = { excellent: 0, good: 0, average: 0, poor: 0, failing: 0 };
  scores.forEach((score) => {
    Object.keys(lessonStats).forEach((key) => {
      lessonStats[key] += score.lessonStatistics[key] || 0;
    });
  });

  return {
    total,
    average,
    goodDays,
    byDay: scores.map((score) => ({
      date: score.date,
      dayOfWeek: score.dayOfWeek,
      score: score.totalDailyScore,
      isGoodDay: score.isGoodDay,
    })),
    lessonStatistics: lessonStats,
  };
};

/**
 * Tổng hợp vi phạm
 */
const aggregateViolations = (violations) => {
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

  const topViolators = getTopViolators(violations, 5);

  return {
    total: violations.length,
    approved,
    pending,
    byType: Object.values(byType),
    topViolators,
  };
};

/**
 * Tính toán thưởng
 */
const calculateBonuses = (conductData, academicData, bonusConfig) => {
  const goodDayBonus = academicData.goodDays * bonusConfig.goodDayBonus;
  const goodWeekBonus = academicData.goodDays === 5 ? bonusConfig.goodWeekBonus : 0;

  return {
    goodDayBonus,
    goodWeekBonus,
    total: goodDayBonus + goodWeekBonus,
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
    ranking: 0, // Sẽ được cập nhật khi tính ranking
  };
};

/**
 * Tổng hợp theo mục
 */
const aggregateByItem = (scores) => {
  const itemMap = {};

  scores.forEach((score) => {
    score.items.forEach((item) => {
      if (!itemMap[item.itemName]) {
        itemMap[item.itemName] = {
          itemName: item.itemName,
          totalScore: 0,
          count: 0,
        };
      }
      itemMap[item.itemName].totalScore += item.score;
      itemMap[item.itemName].count++;
    });
  });

  return Object.values(itemMap);
};

/**
 * Lấy học sinh vi phạm nhiều nhất
 */
const getTopViolators = (violations, limit = 5) => {
  const violatorMap = {};

  violations.forEach((violation) => {
    const studentId = violation.student._id.toString();
    if (!violatorMap[studentId]) {
      violatorMap[studentId] = {
        student: violation.student,
        count: 0,
      };
    }
    violatorMap[studentId].count++;
  });

  return Object.values(violatorMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

/**
 * Tạo tổng hợp tuần mới (với tự động tổng hợp dữ liệu)
 * @route POST /api/weekly-summaries
 * @access Admin
 */
const createWeeklySummary = async (req, res, next) => {
  try {
    const { week, class: classId, status, notes } = req.body;

    // Kiểm tra tuần tồn tại
    const weekData = await Week.findById(week);
    if (!weekData) {
      return sendError(res, 400, 'Tuần không tìm thấy');
    }

    // Kiểm tra lớp tồn tại
    const classData = await Class.findById(classId);
    if (!classData) {
      return sendError(res, 400, 'Lớp không tìm thấy');
    }

    // Kiểm tra đã tồn tại
    const existing = await WeeklySummary.findOne({ week, class: classId });
    if (existing) {
      return sendError(res, 400, 'Tổng hợp tuần cho lớp này đã tồn tại');
    }

    // === TỰ ĐỘNG TỔNG HỢP DỮ LIỆU ===
    
    // 1. Lấy dữ liệu Chấm Điểm Nề Nếp (DisciplineGrading)
    const disciplineGrading = await DisciplineGrading.findOne({
      week: week,
      class: classId,
    });

    // 2. Lấy dữ liệu Chấm Điểm Học Tập (ClassAcademicGrading)
    const academicGrading = await ClassAcademicGrading.findOne({
      week: week,
      class: classId,
    });

    // 3. Lấy dữ liệu vi phạm
    const violations = await ViolationLog.find({
      week: week,
      class: classId,
    });

    // 4. Tính toán conductScores từ DisciplineGrading
    let conductScoresData = { total: 0, average: 0, byDay: [], byItem: [] };
    if (disciplineGrading) {
      conductScoresData = {
        total: disciplineGrading.totalWeeklyScore || 0,
        average: disciplineGrading.percentage || 0,
        byDay: disciplineGrading.items?.flatMap(item => 
          item.dayScores?.map(ds => ({
            date: null,
            dayOfWeek: ds.day,
            score: ds.score || 0,
          })) || []
        ) || [],
        byItem: disciplineGrading.items?.map(item => ({
          itemName: item.itemName,
          totalScore: item.totalScore || 0,
          maxScore: item.maxScore * (item.applicableDays?.length || 1),
          percentage: item.totalScore ? Math.round((item.totalScore / (item.maxScore * (item.applicableDays?.length || 1))) * 100) : 0,
        })) || [],
      };
    }

    // 5. Tính toán academicScores từ ClassAcademicGrading
    let academicScoresData = { total: 0, average: 0, goodDays: 0, byDay: [], lessonStatistics: { excellent: 0, good: 0, average: 0, poor: 0, failing: 0, total: 0 } };
    if (academicGrading) {
      const dayGradings = academicGrading.dayGradings || [];
      const totalScore = dayGradings.reduce((sum, d) => sum + (d.dailyScore || 0), 0);
      const goodDays = dayGradings.filter(d => d.isGoodDay).length;
      const lessonStats = { excellent: 0, good: 0, average: 0, poor: 0, failing: 0, total: 0 };
      
      dayGradings.forEach(d => {
        lessonStats.excellent += d.excellent || 0;
        lessonStats.good += d.good || 0;
        lessonStats.average += d.average || 0;
        lessonStats.poor += d.poor || 0;
        lessonStats.failing += d.bad || 0;
      });
      lessonStats.total = lessonStats.excellent + lessonStats.good + lessonStats.average + lessonStats.poor + lessonStats.failing;

      academicScoresData = {
        total: academicGrading.finalWeeklyScore || totalScore,
        average: academicGrading.averageScore || 0,
        goodDays: academicGrading.goodDayCount || goodDays,
        byDay: dayGradings.map(d => ({
          date: null,
          dayOfWeek: d.day,
          score: d.dailyScore || 0,
          isGoodDay: d.isGoodDay || false,
        })),
        lessonStatistics: lessonStats,
      };
    }

    // 6. Tính toán violationData
    const violationData = {
      total: violations.length,
      approved: violations.filter(v => v.status === 'Đã duyệt').length,
      pending: violations.filter(v => v.status === 'Chờ duyệt').length,
      byType: [],
      topViolators: [],
    };

    // 7. Tính tổng điểm và xếp cờ dựa trên cấu hình năm học
    const conductTotal = conductScoresData.total;
    const maxPossible = disciplineGrading?.maxPossibleScore || 100;
    const percentage = maxPossible > 0 ? Math.round((conductTotal / maxPossible) * 100) : 0;
    
    // Lấy thresholds từ school year config
    const schoolYear = await SchoolYear.findById(weekData.schoolYear);
    const thresholds = schoolYear?.classificationThresholds || {};
    const { redFlag = 90, greenFlag = 70, yellowFlag = 50 } = thresholds;
    
    // Tính flag từ percentage
    let flag = 'Không xếp cờ';
    if (percentage >= redFlag) {
      flag = 'Cờ đỏ';
    } else if (percentage >= greenFlag) {
      flag = 'Cờ xanh';
    } else if (percentage >= yellowFlag) {
      flag = 'Cờ vàng';
    }

    // Lấy status từ DisciplineGrading nếu có và đã khóa
    let finalStatus = status || 'Nháp';
    if (disciplineGrading && disciplineGrading.status === 'Khóa') {
      finalStatus = 'Khóa';
    }

    const classification = { flag, totalScore: conductTotal, percentage };

    const summary = new WeeklySummary({
      week,
      class: classId,
      conductScores: conductScoresData,
      academicScores: academicScoresData,
      bonuses: { goodDayBonus: 0, goodWeekBonus: 0, total: 0 },
      violations: violationData,
      classification,
      status: finalStatus,
      notes,
      createdBy: req.userId,
    });

    await summary.save();
    await summary.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'class', select: 'name grade' },
    ]);

    return sendResponse(res, 201, true, 'Tạo tổng hợp tuần thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật tổng hợp tuần
 * @route PUT /api/weekly-summaries/:id
 * @access Admin
 */
const updateWeeklySummary = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { conductScores, academicScores, bonuses, violations, classification, status, notes } = req.body;

    const summary = await WeeklySummary.findById(id);

    if (!summary) {
      return sendError(res, 404, 'Tổng hợp tuần không tìm thấy');
    }

    // Không cho phép sửa nếu đã khóa
    if (summary.status === 'Khóa') {
      return sendError(res, 409, 'Không thể sửa tổng hợp tuần đã khóa');
    }

    if (conductScores) summary.conductScores = conductScores;
    if (academicScores) summary.academicScores = academicScores;
    if (bonuses) summary.bonuses = bonuses;
    if (violations) summary.violations = violations;
    if (classification) summary.classification = classification;
    if (status) summary.status = status;
    if (notes !== undefined) summary.notes = notes;

    summary.updatedBy = req.userId;
    await summary.save();

    // Đồng bộ status với DisciplineGrading và ClassAcademicGrading
    if (status === 'Khóa') {
      await DisciplineGrading.updateMany(
        { week: summary.week, class: summary.class },
        { status: 'Khóa' }
      );
      await ClassAcademicGrading.updateMany(
        { week: summary.week, class: summary.class },
        { status: 'Khóa' }
      );
    }

    await summary.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'class', select: 'name grade' },
    ]);

    return sendResponse(res, 200, true, 'Cập nhật tổng hợp tuần thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa tổng hợp tuần
 * @route DELETE /api/weekly-summaries/:id
 * @access Admin
 */
const deleteWeeklySummary = async (req, res, next) => {
  try {
    const { id } = req.params;

    const summary = await WeeklySummary.findById(id);

    if (!summary) {
      return sendError(res, 404, 'Tổng hợp tuần không tìm thấy');
    }

    // Không cho phép xóa nếu đã khóa
    if (summary.status === 'Khóa') {
      return sendError(res, 409, 'Không thể xóa tổng hợp tuần đã khóa');
    }

    await WeeklySummary.findByIdAndDelete(id);

    return sendResponse(res, 200, true, 'Xóa tổng hợp tuần thành công');
  } catch (error) {
    next(error);
  }
};

/**
 * Mở khóa tổng hợp tuần (cho phép admin sửa lại sau khi đã khóa)
 * @route PUT /api/weekly-summaries/:id/unlock
 * @access Admin
 */
const unlockWeeklySummary = async (req, res, next) => {
  try {
    const { id } = req.params;

    const summary = await WeeklySummary.findById(id);

    if (!summary) {
      return sendError(res, 404, 'Tổng hợp tuần không tìm thấy');
    }

    if (summary.status !== 'Khóa') {
      return sendError(res, 400, 'Tổng hợp tuần chưa được khóa');
    }

    // Đổi status về Duyệt để admin có thể chỉnh sửa
    summary.status = 'Duyệt';
    summary.updatedBy = req.userId;
    await summary.save();

    // Đồng bộ status với DisciplineGrading
    await DisciplineGrading.updateMany(
      { week: summary.week, class: summary.class },
      { status: 'Duyệt' }
    );

    // Đồng bộ status với ClassAcademicGrading
    await ClassAcademicGrading.updateMany(
      { week: summary.week, class: summary.class },
      { status: 'Duyệt' }
    );

    await summary.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'class', select: 'name grade' },
    ]);

    return sendResponse(res, 200, true, 'Mở khóa tổng hợp tuần thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllWeeklySummaries,
  getWeeklySummaryById,
  generateWeeklySummary,
  createWeeklySummary,
  updateWeeklySummary,
  deleteWeeklySummary,
  unlockWeeklySummary,
};


