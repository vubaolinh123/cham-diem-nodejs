const ConductScore = require('../models/ConductScore');
const AcademicScore = require('../models/AcademicScore');
const ViolationLog = require('../models/ViolationLog');
const WeeklySummary = require('../models/WeeklySummary');
const MonthlySummary = require('../models/MonthlySummary');
const Week = require('../models/Week');
const Class = require('../models/Class');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy báo cáo ngày
 * @route GET /api/reports/daily
 * @access Authenticated
 */
const getDailyReport = async (req, res, next) => {
  try {
    const { date, class: classId } = req.query;

    if (!date) {
      return sendError(res, 400, 'Vui lòng cung cấp ngày');
    }

    const reportDate = new Date(date);
    reportDate.setHours(0, 0, 0, 0);

    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const filter = {
      date: { $gte: reportDate, $lt: nextDay },
    };

    if (classId) filter.class = classId;

    // Lấy điểm nề nếp
    const conductScores = await ConductScore.find(filter)
      .populate('class', 'name grade')
      .populate('scoredBy', 'fullName email');

    // Lấy điểm học tập
    const academicScores = await AcademicScore.find(filter)
      .populate('class', 'name grade')
      .populate('scoredBy', 'fullName email');

    // Lấy vi phạm
    const violations = await ViolationLog.find(filter)
      .populate('class', 'name grade')
      .populate('student', 'studentId fullName')
      .populate('violationType', 'name category');

    const report = {
      date: reportDate,
      conductScores,
      academicScores,
      violations,
      summary: {
        totalClasses: new Set([
          ...conductScores.map((s) => s.class._id.toString()),
          ...academicScores.map((s) => s.class._id.toString()),
        ]).size,
        totalViolations: violations.length,
        approvedViolations: violations.filter((v) => v.status === 'Đã duyệt').length,
        pendingViolations: violations.filter((v) => v.status === 'Chờ duyệt').length,
      },
    };

    return sendResponse(res, 200, true, 'Lấy báo cáo ngày thành công', {
      report,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy báo cáo tuần
 * @route GET /api/reports/weekly
 * @access Authenticated
 */
const getWeeklyReport = async (req, res, next) => {
  try {
    const { week, class: classId } = req.query;
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');

    if (!week) {
      return sendError(res, 400, 'Vui lòng cung cấp tuần');
    }

    // Lấy thông tin tuần
    let weekQuery = week;
    if (week === 'current') {
      const now = new Date();
      const currentWeek = await Week.findOne({
        startDate: { $lte: now },
        endDate: { $gte: now },
      });
      if (!currentWeek) {
         // Nếu không tìm thấy tuần hiện tại, có thể lấy tuần mới nhất
         const latestWeek = await Week.findOne().sort({ weekNumber: -1 });
         if(!latestWeek) return sendError(res, 404, 'Không tìm thấy tuần hiện tại');
         weekQuery = latestWeek._id;
      } else {
        weekQuery = currentWeek._id;
      }
    }

    const weekData = await Week.findById(weekQuery).populate('schoolYear', 'year');

    if (!weekData) {
      return sendError(res, 404, 'Tuần không tìm thấy');
    }

    // Build filter
    const filter = { week: weekQuery };
    if (classId) filter.class = classId;

    // Aggregate data from DisciplineGrading (nề nếp)
    const disciplineGradings = await DisciplineGrading.find(filter)
      .populate('class', 'name grade')
      .lean();

    // Aggregate data from ClassAcademicGrading (học tập)
    const academicGradings = await ClassAcademicGrading.find(filter)
      .populate('class', 'name grade')
      .lean();

    // Get violations for the week
    const violations = await ViolationLog.find({ week: weekQuery })
      .populate('student', 'studentId fullName')
      .populate('class', 'name')
      .lean();

    // Count violations per class
    const violationsByClass = {};
    violations.forEach(v => {
      const classIdStr = v.class?._id?.toString() || 'unknown';
      violationsByClass[classIdStr] = (violationsByClass[classIdStr] || 0) + 1;
    });

    // Get unique classes from both grading sets
    const classMap = new Map();
    
    disciplineGradings.forEach(dg => {
      if (dg.class) {
        const classIdStr = dg.class._id.toString();
        if (!classMap.has(classIdStr)) {
          classMap.set(classIdStr, {
            class: dg.class,
            conductScore: 0,
            academicScore: 0,
            totalScore: 0,
            violationCount: 0,
            flag: dg.flag || 'Không xếp cờ',
          });
        }
        const entry = classMap.get(classIdStr);
        entry.conductScore = dg.totalWeeklyScore || 0;
        entry.flag = dg.flag || entry.flag;
      }
    });

    academicGradings.forEach(ag => {
      if (ag.class) {
        const classIdStr = ag.class._id.toString();
        if (!classMap.has(classIdStr)) {
          classMap.set(classIdStr, {
            class: ag.class,
            conductScore: 0,
            academicScore: 0,
            totalScore: 0,
            violationCount: 0,
            flag: 'Không xếp cờ',
          });
        }
        const entry = classMap.get(classIdStr);
        entry.academicScore = ag.finalWeeklyScore || 0;
      }
    });

    // Build summaries array
    const summaries = Array.from(classMap.values()).map(entry => ({
      class: entry.class,
      conductScore: entry.conductScore,
      academicScore: Math.round(entry.academicScore * 10) / 10,
      totalScore: Math.round((entry.conductScore + entry.academicScore) * 10) / 10,
      violationCount: violationsByClass[entry.class._id.toString()] || 0,
      flag: entry.flag,
    }));

    // Sort by total score descending
    summaries.sort((a, b) => b.totalScore - a.totalScore);

    // Add ranking
    summaries.forEach((summary, index) => {
      summary.ranking = index + 1;
    });

    const report = {
      week: weekData,
      summaries,
      violations,
      summary: {
        totalClasses: summaries.length,
        totalViolations: violations.length,
        approvedViolations: violations.filter((v) => v.status === 'Đã duyệt').length,
        topClass: summaries[0] || null,
        bottomClass: summaries[summaries.length - 1] || null,
      },
    };

    return sendResponse(res, 200, true, 'Lấy báo cáo tuần thành công', {
      report,
    });
  } catch (error) {
    next(error);
  }
};


/**
 * Lấy báo cáo tháng
 * @route GET /api/reports/monthly
 * @access Authenticated
 */
const getMonthlyReport = async (req, res, next) => {
  try {
    const { schoolYear, month, year, class: classId } = req.query;

    if (!schoolYear || !month || !year) {
      return sendError(res, 400, 'Vui lòng cung cấp năm học, tháng và năm');
    }

    const filter = {
      schoolYear,
      month: parseInt(month),
      year: parseInt(year),
    };

    if (classId) filter.class = classId;

    // Lấy tổng hợp tháng
    const summaries = await MonthlySummary.find(filter)
      .populate('class', 'name grade')
      .populate('honorRoll.student', 'studentId fullName')
      .populate('criticalList.student', 'studentId fullName')
      .sort({ 'classification.totalScore': -1 });

    // Tính ranking
    summaries.forEach((summary, index) => {
      summary.classification.ranking = index + 1;
    });

    const report = {
      month: parseInt(month),
      year: parseInt(year),
      summaries,
      summary: {
        totalClasses: summaries.length,
        averageScore: Math.round(
          summaries.reduce((sum, s) => sum + s.classification.totalScore, 0) / summaries.length
        ),
        topClass: summaries[0] || null,
        bottomClass: summaries[summaries.length - 1] || null,
        honorRoll: summaries.flatMap((s) => s.honorRoll),
        criticalList: summaries.flatMap((s) => s.criticalList),
      },
    };

    return sendResponse(res, 200, true, 'Lấy báo cáo tháng thành công', {
      report,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xuất báo cáo PDF/Excel
 * @route GET /api/reports/export
 * @access Authenticated
 */
const exportReport = async (req, res, next) => {
  try {
    const { type, format, week, month, year } = req.query;

    if (!type || !format) {
      return sendError(res, 400, 'Vui lòng cung cấp loại báo cáo và định dạng');
    }

    if (!['pdf', 'excel'].includes(format)) {
      return sendError(res, 400, 'Định dạng phải là pdf hoặc excel');
    }

    // TODO: Implement PDF/Excel export logic
    // Sử dụng thư viện như pdfkit, xlsx, etc.

    return sendResponse(res, 200, true, 'Xuất báo cáo thành công', {
      message: 'Chức năng xuất báo cáo sẽ được triển khai',
      format,
      type,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy thống kê vi phạm
 * @route GET /api/reports/violations-summary
 * @access Authenticated
 */
const getViolationsSummary = async (req, res, next) => {
  try {
    const { week, month, year, class: classId } = req.query;

    let filter = {};

    if (week) {
      filter.week = week;
    } else if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      filter.date = { $gte: startDate, $lt: endDate };
    }

    if (classId) filter.class = classId;

    const violations = await ViolationLog.find(filter)
      .populate('violationType', 'name category severity')
      .populate('student', 'studentId fullName');

    // Tổng hợp theo loại
    const byType = {};
    violations.forEach((violation) => {
      const typeName = violation.violationType?.name || 'Khác';
      if (!byType[typeName]) {
        byType[typeName] = {
          violationType: violation.violationType?._id,
          count: 0,
          severity: violation.violationType?.severity,
        };
      }
      byType[typeName].count++;
    });

    // Tổng hợp theo học sinh
    const byStudent = {};
    violations.forEach((violation) => {
      const studentId = violation.student._id.toString();
      if (!byStudent[studentId]) {
        byStudent[studentId] = {
          student: violation.student,
          count: 0,
        };
      }
      byStudent[studentId].count++;
    });

    const summary = {
      total: violations.length,
      approved: violations.filter((v) => v.status === 'Đã duyệt').length,
      pending: violations.filter((v) => v.status === 'Chờ duyệt').length,
      rejected: violations.filter((v) => v.status === 'Từ chối').length,
      byType: Object.values(byType).sort((a, b) => b.count - a.count),
      topViolators: Object.values(byStudent)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };

    return sendResponse(res, 200, true, 'Lấy thống kê vi phạm thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  exportReport,
  getViolationsSummary,
};

