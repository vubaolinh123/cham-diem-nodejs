const ConductScore = require('../models/ConductScore');
const AcademicScore = require('../models/AcademicScore');
const ViolationLog = require('../models/ViolationLog');
const WeeklySummary = require('../models/WeeklySummary');
const MonthlySummary = require('../models/MonthlySummary');
const Week = require('../models/Week');
const Class = require('../models/Class');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy báo cáo tùy chỉnh (theo khoảng thời gian)
 * @route GET /api/reports/custom
 * @access Authenticated
 */
/**
 * Lấy báo cáo tùy chỉnh (theo khoảng thời gian)
 * @route GET /api/reports/custom
 * @access Authenticated
 */
const getCustomReport = async (req, res, next) => {
  try {
    const { from, to, classIds, weekId, schoolYearId } = req.query;
    const SchoolYear = require('../models/SchoolYear');
    const WeeklySummary = require('../models/WeeklySummary');
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');

    let startDate, endDate;
    let periodName = '';

    // Determine date range priority: Date Range > Week > School Year
    if (from && to) {
      startDate = new Date(from);
      endDate = new Date(to);
      if (to.length <= 10) endDate.setHours(23, 59, 59, 999);
      periodName = `Từ ${from} đến ${to}`;
    } else if (weekId) {
      const week = await Week.findById(weekId);
      if (!week) return sendError(res, 404, 'Tuần không tìm thấy');
      startDate = new Date(week.startDate);
      endDate = new Date(week.endDate);
      periodName = `Tuần ${week.weekNumber}`;
    } else if (schoolYearId) {
       const sh = await SchoolYear.findById(schoolYearId);
       if (!sh) return sendError(res, 404, 'Năm học không tìm thấy');
       startDate = new Date(sh.startDate);
       endDate = new Date(sh.endDate);
       periodName = `Năm học ${sh.year}`;
    } else {
        const now = new Date();
        const currentWeek = await Week.findOne({
            startDate: { $lte: now },
            endDate: { $gte: now },
        });
        if (currentWeek) {
            startDate = new Date(currentWeek.startDate);
            endDate = new Date(currentWeek.endDate);
            periodName = `Tuần ${currentWeek.weekNumber} (Hiện tại)`;
        } else {
            endDate = new Date();
            startDate = new Date();
            startDate.setDate(endDate.getDate() - 7);
            periodName = '7 ngày qua';
        }
    }

    // Find Weeks covered by this range
    // We look for weeks that overlap with the range. 
    // StartDate of week <= RangeEnd AND EndDate of week >= RangeStart
    const weekQuery = {
        startDate: { $lte: endDate },
        endDate: { $gte: startDate }
    };
    if (schoolYearId) weekQuery.schoolYear = schoolYearId;

    const weeks = await Week.find(weekQuery).select('_id weekNumber');
    const weekIds = weeks.map(w => w._id);

    // Initial Filter
    const filter = {};
    if (weekIds.length > 0) {
        filter.week = { $in: weekIds };
    } else {
        // Fallback to strict date filtering if no weeks found (e.g. daily w/o week?)
        // But we are aggregating DisciplineGrading which NEEDS week.
        // If no week found, we effectively have no "Weekly Data".
        // We could fallback to Daily Scores provided getDaily works? 
        // Let's assume Week system is primary.
        filter.date = { $gte: startDate, $lte: endDate }; // This works for ViolationLog but not Grading models which look by week
    }

    let classFilter = {};
    if (classIds) {
        const ids = Array.isArray(classIds) ? classIds : classIds.split(',');
        if (ids.length > 0) {
             classFilter.class = { $in: ids };
             filter.class = { $in: ids };
        }
    }

    // If we have weeks, we fetch Grading data. 
    // If not, we skip Grading (empty) and just show Violations?
    let disciplineGradings = [];
    let academicGradings = [];

    if (weekIds.length > 0) {
        disciplineGradings = await DisciplineGrading.find({ week: { $in: weekIds }, ...classFilter })
          .populate('class', 'name grade')
          .lean();
        
        academicGradings = await ClassAcademicGrading.find({ week: { $in: weekIds }, ...classFilter })
          .populate('class', 'name grade')
          .lean();
    }

    const violations = await ViolationLog.find({ 
        date: { $gte: startDate, $lte: endDate }, 
        ...classFilter 
    })
       .populate('class', 'name grade')
       .populate('violationType', 'name category severity')
       .lean();

    // Aggregation Map
    const classMap = new Map();

    const getClassEntry = (cls) => {
        if (!cls) return null;
        const id = cls._id.toString();
        if (!classMap.has(id)) {
            classMap.set(id, {
                class: cls,
                totalConductScore: 0,
                totalAcademicScore: 0,
                violationCount: 0,
                weeksCount: 0, // Number of weeks this class has data for
                academicWeeksCount: 0,
            });
        }
        return classMap.get(id);
    };

    // Process Conduct (DisciplineGrading)
    disciplineGradings.forEach(dg => {
        const entry = getClassEntry(dg.class);
        if (entry) {
             entry.totalConductScore += dg.totalWeeklyScore || 0;
             entry.weeksCount++; 
        }
    });

    // Process Academic (ClassAcademicGrading)
    academicGradings.forEach(ag => {
        const entry = getClassEntry(ag.class);
        if (entry) {
            entry.totalAcademicScore += ag.finalWeeklyScore || 0;
            entry.academicWeeksCount++;
        }
    });
    
    // Process Violations
    violations.forEach(v => {
        const entry = getClassEntry(v.class);
        if (entry) {
            entry.violationCount++;
        }
    });

    // Finalize Averages
    const summaries = Array.from(classMap.values()).map(entry => {
        // Average Conduct
        const avgConduct = entry.weeksCount > 0 ? (entry.totalConductScore / entry.weeksCount) : 0;
        
        // Average Academic
        const avgAcademic = entry.academicWeeksCount > 0 ? (entry.totalAcademicScore / entry.academicWeeksCount) : 0;
        
        return {
            class: entry.class,
            conductScore: Math.round(avgConduct * 10) / 10,
            academicScore: Math.round(avgAcademic * 10) / 10,
            totalScore: Math.round((avgConduct + avgAcademic) * 10) / 10,
            violationCount: entry.violationCount,
            ranking: 0
        };
    });

    // Sort
    summaries.sort((a,b) => b.totalScore - a.totalScore);
    summaries.forEach((s, i) => s.ranking = i + 1);

    const report = {
        period: periodName,
        summaries,
        violations: violations.length > 200 ? violations.slice(0, 200) : violations, // Limit violations if too many
        summary: {
            totalClasses: summaries.length,
            totalViolations: violations.length,
            topClass: summaries[0] || null,
            bottomClass: summaries[summaries.length - 1] || null
        }
    };

    return sendResponse(res, 200, true, 'Lấy báo cáo thành công', { report });

  } catch (error) {
    next(error);
  }
};

/**
 * Lấy báo cáo ngày (Deprecated - use custom)
 * @route GET /api/reports/daily
 * @access Authenticated
 */
const getDailyReport = async (req, res, next) => {
    // Forward to custom with from=date, to=date
    if (req.query.date) {
        req.query.from = req.query.date;
        req.query.to = req.query.date;
    }
    return getCustomReport(req, res, next);
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
  getCustomReport,
};

