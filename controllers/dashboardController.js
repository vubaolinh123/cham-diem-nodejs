const DisciplineGrading = require('../models/DisciplineGrading');
const ClassAcademicGrading = require('../models/ClassAcademicGrading');
const ViolationLog = require('../models/ViolationLog');
const Week = require('../models/Week');
const Class = require('../models/Class');
const Student = require('../models/Student');
const { sendResponse, sendError } = require('../utils/helpers');

// Helper to get current or specified week
const getWeekFilter = async (weekParam) => {
  if (weekParam === 'current') {
    const now = new Date();
    const currentWeek = await Week.findOne({
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
    if (!currentWeek) {
      const latestWeek = await Week.findOne().sort({ weekNumber: -1 });
      return latestWeek?._id || null;
    }
    return currentWeek._id;
  }
  return weekParam || null;
};

/**
 * Lấy thống kê dashboard
 * @route GET /api/dashboard/stats
 * @access Authenticated
 */
const getStatistics = async (req, res, next) => {
  try {
    const { week } = req.query;
    
    const weekId = await getWeekFilter(week || 'current');
    
    // Count total classes, students
    const totalClasses = await Class.countDocuments();
    const totalStudents = await Student.countDocuments();

    // Get discipline gradings for this week
    const disciplineGradings = weekId 
      ? await DisciplineGrading.find({ week: weekId }).lean()
      : await DisciplineGrading.find().lean();

    // Get violations
    const violationFilter = weekId ? { week: weekId } : {};
    const violations = await ViolationLog.find(violationFilter).lean();

    // Calculate averages and flag distribution
    let totalScore = 0;
    const flagDistribution = {
      redFlag: 0,
      greenFlag: 0,
      yellowFlag: 0,
      noFlag: 0,
    };

    disciplineGradings.forEach(dg => {
      totalScore += dg.totalWeeklyScore || 0;
      if (dg.flag === 'Cờ đỏ') flagDistribution.redFlag++;
      else if (dg.flag === 'Cờ xanh') flagDistribution.greenFlag++;
      else if (dg.flag === 'Cờ vàng') flagDistribution.yellowFlag++;
      else flagDistribution.noFlag++;
    });

    const averageScore = disciplineGradings.length > 0 
      ? Math.round(totalScore / disciplineGradings.length)
      : 0;

    const stats = {
      totalClasses,
      totalStudents,
      averageScore,
      totalViolations: violations.length,
      approvedViolations: violations.filter((v) => v.status === 'Đã duyệt').length,
      pendingViolations: violations.filter((v) => v.status === 'Chờ duyệt').length,
      flagDistribution,
    };

    return sendResponse(res, 200, true, 'Lấy thống kê thành công', { stats });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy lớp top đầu
 * @route GET /api/dashboard/top-classes
 * @access Authenticated
 */
const getTopClasses = async (req, res, next) => {
  try {
    const { week, limit = 10 } = req.query;
    const weekId = await getWeekFilter(week || 'current');

    const filter = weekId ? { week: weekId } : {};
    const disciplineGradings = await DisciplineGrading.find(filter)
      .populate('class', 'name grade')
      .sort({ totalWeeklyScore: -1 })
      .limit(parseInt(limit))
      .lean();

    const topClasses = disciplineGradings.map((dg, index) => ({
      rank: index + 1,
      class: dg.class,
      score: dg.totalWeeklyScore || 0,
      flag: dg.flag || 'Không xếp cờ',
      percentage: dg.percentage || 0,
    }));

    return sendResponse(res, 200, true, 'Lấy lớp top đầu thành công', { topClasses });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy lớp tụt hạng
 * @route GET /api/dashboard/bottom-classes
 * @access Authenticated
 */
const getBottomClasses = async (req, res, next) => {
  try {
    const { week, limit = 10 } = req.query;
    const weekId = await getWeekFilter(week || 'current');

    const filter = weekId ? { week: weekId } : {};
    const disciplineGradings = await DisciplineGrading.find(filter)
      .populate('class', 'name grade')
      .sort({ totalWeeklyScore: 1 })
      .limit(parseInt(limit))
      .lean();

    const bottomClasses = disciplineGradings.map((dg, index) => ({
      rank: index + 1,
      class: dg.class,
      score: dg.totalWeeklyScore || 0,
      flag: dg.flag || 'Không xếp cờ',
      percentage: dg.percentage || 0,
    }));

    return sendResponse(res, 200, true, 'Lấy lớp tụt hạng thành công', { bottomClasses });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy thống kê vi phạm (Pareto)
 * @route GET /api/dashboard/violations-pareto
 * @access Authenticated
 */
const getViolationsPareto = async (req, res, next) => {
  try {
    const { week } = req.query;
    const weekId = await getWeekFilter(week || 'current');

    const filter = weekId ? { week: weekId } : {};
    const violations = await ViolationLog.find(filter)
      .populate('violationType', 'name category')
      .lean();

    // Aggregate by type
    const byType = {};
    violations.forEach((violation) => {
      const typeName = violation.violationType?.name || 'Khác';
      if (!byType[typeName]) {
        byType[typeName] = { name: typeName, count: 0, percentage: 0 };
      }
      byType[typeName].count++;
    });

    const total = violations.length;
    const paretoData = Object.values(byType)
      .sort((a, b) => b.count - a.count)
      .map((item) => ({
        ...item,
        percentage: total > 0 ? Math.round((item.count / total) * 100) : 0,
      }));

    return sendResponse(res, 200, true, 'Lấy thống kê Pareto thành công', { paretoData, total });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy tổng quan dashboard
 * @route GET /api/dashboard/overview
 * @access Authenticated
 */
const getDashboardOverview = async (req, res, next) => {
  try {
    const { week } = req.query;
    const weekId = await getWeekFilter(week || 'current');

    const filter = weekId ? { week: weekId } : {};
    
    const disciplineGradings = await DisciplineGrading.find(filter)
      .populate('class', 'name grade')
      .lean();
    const violations = await ViolationLog.find(filter).lean();

    const totalClasses = disciplineGradings.length;
    let totalScore = 0;
    const flagDistribution = { redFlag: 0, greenFlag: 0, yellowFlag: 0, noFlag: 0 };

    disciplineGradings.forEach(dg => {
      totalScore += dg.totalWeeklyScore || 0;
      if (dg.flag === 'Cờ đỏ') flagDistribution.redFlag++;
      else if (dg.flag === 'Cờ xanh') flagDistribution.greenFlag++;
      else if (dg.flag === 'Cờ vàng') flagDistribution.yellowFlag++;
      else flagDistribution.noFlag++;
    });

    const averageScore = totalClasses > 0 ? Math.round(totalScore / totalClasses) : 0;
    
    const sortedByScore = [...disciplineGradings].sort((a, b) => (b.totalWeeklyScore || 0) - (a.totalWeeklyScore || 0));
    const topClass = sortedByScore[0] || null;
    const bottomClass = sortedByScore[sortedByScore.length - 1] || null;

    const overview = {
      period: { type: 'week', value: weekId },
      totalClasses,
      averageScore,
      totalViolations: violations.length,
      approvedViolations: violations.filter((v) => v.status === 'Đã duyệt').length,
      pendingViolations: violations.filter((v) => v.status === 'Chờ duyệt').length,
      flagDistribution,
      topClass: topClass ? {
        class: topClass.class,
        score: topClass.totalWeeklyScore || 0,
        flag: topClass.flag,
      } : null,
      bottomClass: bottomClass ? {
        class: bottomClass.class,
        score: bottomClass.totalWeeklyScore || 0,
        flag: bottomClass.flag,
      } : null,
    };

    return sendResponse(res, 200, true, 'Lấy tổng quan dashboard thành công', { overview });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy thống kê lớp học
 * @route GET /api/dashboard/class-statistics
 * @access Authenticated
 */
const getClassStatistics = async (req, res, next) => {
  try {
    const { week } = req.query;
    const weekId = await getWeekFilter(week || 'current');

    const filter = weekId ? { week: weekId } : {};
    
    const disciplineGradings = await DisciplineGrading.find(filter)
      .populate('class', 'name grade studentCount')
      .lean();
    
    const academicGradings = await ClassAcademicGrading.find(filter)
      .populate('class', 'name')
      .lean();

    const violations = await ViolationLog.find(filter)
      .populate('class', 'name')
      .lean();

    // Build class map
    const classMap = new Map();
    
    disciplineGradings.forEach(dg => {
      if (dg.class) {
        const classId = dg.class._id.toString();
        classMap.set(classId, {
          className: dg.class.name,
          totalStudents: dg.class.studentCount || 0,
          conductScore: dg.totalWeeklyScore || 0,
          academicScore: 0,
          totalViolations: 0,
          flag: dg.flag || 'Không xếp cờ',
        });
      }
    });

    academicGradings.forEach(ag => {
      if (ag.class) {
        const classId = ag.class._id.toString();
        if (classMap.has(classId)) {
          classMap.get(classId).academicScore = ag.finalWeeklyScore || 0;
        }
      }
    });

    violations.forEach(v => {
      if (v.class) {
        const classId = v.class._id.toString();
        if (classMap.has(classId)) {
          classMap.get(classId).totalViolations++;
        }
      }
    });

    const classStatistics = Array.from(classMap.values());

    return sendResponse(res, 200, true, 'Lấy thống kê lớp học thành công', { classStatistics });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy phân bố xếp loại
 * @route GET /api/dashboard/grade-distribution
 * @access Authenticated
 */
const getGradeDistribution = async (req, res, next) => {
  try {
    const { week } = req.query;
    const weekId = await getWeekFilter(week || 'current');

    const filter = weekId ? { week: weekId } : {};
    const disciplineGradings = await DisciplineGrading.find(filter).lean();

    // Distribution by flag
    const distribution = [
      { range: 'Cờ đỏ', count: 0, label: 'Xuất sắc', color: '#ef4444' },
      { range: 'Cờ xanh', count: 0, label: 'Tốt', color: '#22c55e' },
      { range: 'Cờ vàng', count: 0, label: 'Khá', color: '#eab308' },
      { range: 'Không xếp cờ', count: 0, label: 'Cần cải thiện', color: '#9ca3af' },
    ];

    disciplineGradings.forEach(dg => {
      if (dg.flag === 'Cờ đỏ') distribution[0].count++;
      else if (dg.flag === 'Cờ xanh') distribution[1].count++;
      else if (dg.flag === 'Cờ vàng') distribution[2].count++;
      else distribution[3].count++;
    });

    const total = disciplineGradings.length;
    const gradeDistribution = distribution.map(d => ({
      ...d,
      percentage: total > 0 ? Math.round((d.count / total) * 100) : 0,
    }));

    return sendResponse(res, 200, true, 'Lấy phân bố xếp loại thành công', { gradeDistribution });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy xu hướng vi phạm
 * @route GET /api/dashboard/violation-trend
 * @access Authenticated
 */
const getViolationTrend = async (req, res, next) => {
  try {
    const violations = await ViolationLog.find({}).sort({ date: 1 }).lean();

    const trendMap = {};
    violations.forEach(v => {
      if (v.date) {
        const dateKey = new Date(v.date).toISOString().split('T')[0];
        if (!trendMap[dateKey]) trendMap[dateKey] = 0;
        trendMap[dateKey]++;
      }
    });

    const violationTrend = Object.keys(trendMap)
      .sort()
      .slice(-14) // Last 14 days
      .map(date => ({ date, count: trendMap[date] }));

    return sendResponse(res, 200, true, 'Lấy xu hướng vi phạm thành công', { violationTrend });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStatistics,
  getTopClasses,
  getBottomClasses,
  getViolationsPareto,
  getDashboardOverview,
  getClassStatistics,
  getGradeDistribution,
  getViolationTrend,
};


