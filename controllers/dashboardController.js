const DisciplineGrading = require('../models/DisciplineGrading');
const ClassAcademicGrading = require('../models/ClassAcademicGrading');
const ViolationLog = require('../models/ViolationLog');
const Week = require('../models/Week');
const Class = require('../models/Class');
const Student = require('../models/Student');
const SchoolYear = require('../models/SchoolYear');
const { sendResponse, sendError } = require('../utils/helpers');

const isObjectId = (value) => /^[0-9a-fA-F]{24}$/.test(String(value || ''));

const getActiveSchoolYearId = async () => {
  const active = await SchoolYear.findOne({ status: 'Hoạt động' })
    .sort({ updatedAt: -1 })
    .select('_id');

  return active?._id || null;
};

const resolveSchoolYearId = async (schoolYearParam) => {
  if (schoolYearParam && isObjectId(schoolYearParam)) return schoolYearParam;
  return getActiveSchoolYearId();
};

// Helper to get current or specified week ID, scoped by school year when possible.
const getWeekId = async (weekParam, schoolYearId) => {
  const weekFilter = {};
  if (schoolYearId) weekFilter.schoolYear = schoolYearId;

  if (!weekParam || weekParam === 'current') {
    const now = new Date();
    const currentWeek = await Week.findOne({
      ...weekFilter,
      startDate: { $lte: now },
      endDate: { $gte: now },
    });
    if (!currentWeek) {
      // Fallback: Find latest week that has started
      const latestStartedWeek = await Week.findOne({
        ...weekFilter,
        startDate: { $lte: now },
      }).sort({ startDate: -1 });
      return latestStartedWeek?._id || null;
    }
    return currentWeek._id;
  }

  if (isObjectId(weekParam)) {
    if (!schoolYearId) return weekParam;
    const week = await Week.findOne({ _id: weekParam, schoolYear: schoolYearId }).select('_id');
    return week?._id || null;
  }

  const weekNumber = Number.parseInt(weekParam, 10);
  if (Number.isFinite(weekNumber)) {
    const week = await Week.findOne({ ...weekFilter, weekNumber }).select('_id');
    return week?._id || null;
  }

  return weekParam;
};

// Helper to build filter object from query params
const buildDashboardFilter = async (query) => {
  const { week, classId, status, fromDate, toDate, schoolYear } = query;
  const schoolYearId = await resolveSchoolYearId(schoolYear);
  const gradingFilter = {};
  const violationFilter = {};
  const classFilter = {};
  const studentFilter = {};

  if (schoolYearId) {
    gradingFilter.schoolYear = schoolYearId;
    classFilter.schoolYear = schoolYearId;
    studentFilter.schoolYear = schoolYearId;
  }

  // Class filter
  if (classId) {
    gradingFilter.class = classId;
    violationFilter.class = classId;
    classFilter._id = classId;
    studentFilter.class = classId;
  }

  // Status filter
  if (status) {
    gradingFilter.status = status === 'Duyệt' ? 'Đã duyệt' : status;
  }

  // Time filter (Priority: Week > Date Range > Whole active school year)
  if (week) {
    const weekId = await getWeekId(week, schoolYearId);
    gradingFilter.week = weekId || null;
    violationFilter.week = weekId || null;
  } else if (fromDate && toDate) {
    // Filter by date range (using weekStartDate/weekEndDate in DisciplineGrading)
    // We look for items where weekStartDate >= fromDate AND weekEndDate <= toDate
    gradingFilter.weekStartDate = { $gte: new Date(fromDate) };
    gradingFilter.weekEndDate = { $lte: new Date(toDate) };
    violationFilter.date = { $gte: new Date(fromDate), $lte: new Date(toDate) };
  } else if (schoolYearId) {
    const weekIds = await Week.find({ schoolYear: schoolYearId }).distinct('_id');
    violationFilter.week = { $in: weekIds };
  }

  return {
    gradingFilter,
    violationFilter,
    classFilter,
    studentFilter,
    schoolYearId,
  };
};

/**
 * Lấy thống kê dashboard
 * @route GET /api/dashboard/stats
 * @access Authenticated
 */
const getStatistics = async (req, res, next) => {
  try {
    const {
      gradingFilter,
      violationFilter,
      classFilter,
      studentFilter,
    } = await buildDashboardFilter(req.query);
    
    // Count total classes, students (Global or Filtered?)
    // If filtering by class, totals should reflect that? 
    // Usually 'Total Classes' in dashboard implies "All Classes in School".
    // But if filtering, maybe "1 Class"?
    // The previous implementation used explicit Class.countDocuments() and Student.countDocuments().
    // We'll keep global counts for "Total" cards unless user asks otherwise, 
    // BUT the "Average Score", "Violations" etc MUST respect the filter.
    const totalClasses = await Class.countDocuments(classFilter);
    const totalStudents = await Student.countDocuments(studentFilter);

    // Get discipline gradings
    const disciplineGradings = await DisciplineGrading.find(gradingFilter).lean();

    // Get violations
    // ViolationLog works differently. It has `date`. It doesn't have `weekStartDate` stored directly usually.
    // It has `week` reference.
    // If filter has `week`, usage is fine.
    // If filter has `weekStartDate`, ViolationLog DOES NOT have it.
    // We need separate logic for ViolationLog if date range is used.
    
    // Status in ViolationLog? ViolationLog has status 'Chờ duyệt' etc.
    // status param usually refers to WeeklyReport status.
    // If filtering by WeeklyReport Status (e.g. Locked), we should probably NOT filter ViolationLogs by that status,
    // UNLESS we map valid weeks.
    // Simplest: Filter separate logic for violations.
    
    // Re-construct filter for ViolationLog
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
    const { limit = 10 } = req.query;
    const { gradingFilter } = await buildDashboardFilter(req.query);

    const disciplineGradings = await DisciplineGrading.find(gradingFilter)
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
    const { limit = 10 } = req.query;
    const { gradingFilter } = await buildDashboardFilter(req.query);

    const disciplineGradings = await DisciplineGrading.find(gradingFilter)
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
    const { violationFilter } = await buildDashboardFilter(req.query);
    const violations = await ViolationLog.find(violationFilter)
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
    const { gradingFilter, violationFilter } = await buildDashboardFilter(req.query);
    
    const disciplineGradings = await DisciplineGrading.find(gradingFilter)
      .populate('class', 'name grade')
      .lean();

    const violations = await ViolationLog.find(violationFilter).lean();

    const totalClasses = disciplineGradings.length; // Active classes with grades
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
      period: { type: 'custom', value: 'filtered' },
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
      bottomClass2: sortedByScore.length > 1 ? {
          class: sortedByScore[sortedByScore.length - 2].class,
          score: sortedByScore[sortedByScore.length - 2].totalWeeklyScore || 0,
          flag: sortedByScore[sortedByScore.length - 2].flag
      } : null
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
    const {
      gradingFilter,
      violationFilter,
      classFilter,
    } = await buildDashboardFilter(req.query);
    
    const classes = await Class.find(classFilter).select('name grade studentCount').lean();

    const disciplineGradings = await DisciplineGrading.find(gradingFilter)
      .populate('class', 'name grade studentCount')
      .lean();
    
    const academicGradings = await ClassAcademicGrading.find(gradingFilter)
      .populate('class', 'name')
      .lean();

    const violations = await ViolationLog.find(violationFilter)
      .populate('class', 'name')
      .lean();

    // Build class map
    const classMap = new Map();

    classes.forEach(cls => {
      classMap.set(cls._id.toString(), {
        className: cls.name,
        totalStudents: cls.studentCount || 0,
        conductScore: 0,
        academicScore: 0,
        totalViolations: 0,
        conductViolations: 0,
        flag: 'Không xếp cờ',
      });
    });
    
    // Process Discipline first
    disciplineGradings.forEach(dg => {
      if (dg.class) {
        const classIdStr = dg.class._id.toString();
        classMap.set(classIdStr, {
          className: dg.class.name,
          totalStudents: dg.class.studentCount || 0,
          conductScore: dg.totalWeeklyScore || 0,
          academicScore: 0,
          totalViolations: 0,
          conductViolations: 0,
          flag: dg.flag || 'Không xếp cờ',
        });
      }
    });

    // Academic
    academicGradings.forEach(ag => {
      if (ag.class) {
        const classIdStr = ag.class._id.toString();
        // Only if class already in map (meaning it has discipline grading)
        // Or should we include classes that only have academic? Usually consistency requires existence.
        if (classMap.has(classIdStr)) {
          classMap.get(classIdStr).academicScore = ag.finalWeeklyScore || 0;
        } else {
          classMap.set(classIdStr, {
            className: ag.class.name,
            totalStudents: 0,
            conductScore: 0,
            academicScore: ag.finalWeeklyScore || 0,
            totalViolations: 0,
            conductViolations: 0,
            flag: 'Không xếp cờ',
          });
        }
      }
    });

    // Violations
    violations.forEach(v => {
      if (v.class) {
        const classIdStr = v.class._id.toString();
        if (classMap.has(classIdStr)) {
          classMap.get(classIdStr).totalViolations++;
          classMap.get(classIdStr).conductViolations++;
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
    const { gradingFilter } = await buildDashboardFilter(req.query);
    const disciplineGradings = await DisciplineGrading.find(gradingFilter).lean();

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
    const { violationFilter } = await buildDashboardFilter(req.query);

    const violations = await ViolationLog.find(violationFilter).sort({ date: 1 }).lean();

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
      // .slice(-14) // Don't slice if user filtered
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


