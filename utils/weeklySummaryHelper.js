/**
 * Weekly Summary Helper
 * Auto-calculates and updates WeeklySummary when source data changes
 */

const WeeklySummary = require('../models/WeeklySummary');
const DisciplineGrading = require('../models/DisciplineGrading');
const ClassAcademicGrading = require('../models/ClassAcademicGrading');
const ViolationLog = require('../models/ViolationLog');
const Week = require('../models/Week');
const SchoolYear = require('../models/SchoolYear');

/**
 * Calculate flag based on score and thresholds
 * @param {number} percentage - Score percentage (0-100)
 * @param {Object} thresholds - Classification thresholds from SchoolYear config
 * @returns {string} Flag name
 */
const calculateFlag = (percentage, thresholds) => {
  const { redFlag = 90, greenFlag = 70, yellowFlag = 50 } = thresholds || {};
  
  if (percentage >= redFlag) return 'Cờ đỏ';
  if (percentage >= greenFlag) return 'Cờ xanh';
  if (percentage >= yellowFlag) return 'Cờ vàng';
  return 'Không xếp cờ';
};

/**
 * Update or create WeeklySummary for a specific week and class
 * Called automatically when DisciplineGrading, ClassAcademicGrading, or ViolationLog changes
 * 
 * @param {string} weekId - Week ObjectId
 * @param {string} classId - Class ObjectId
 * @param {string} userId - User who triggered the update (optional)
 */
const updateWeeklySummary = async (weekId, classId, userId = null) => {
  try {
    if (!weekId || !classId) {
      console.log('updateWeeklySummary: Missing weekId or classId');
      return null;
    }

    // Get week data to find school year
    const week = await Week.findById(weekId);
    if (!week) {
      console.log('updateWeeklySummary: Week not found');
      return null;
    }

    // Get school year config for thresholds and bonus configuration
    const schoolYear = await SchoolYear.findById(week.schoolYear);
    if (!schoolYear) {
      console.log('updateWeeklySummary: SchoolYear not found');
      return null;
    }

    // Get DisciplineGrading data
    const disciplineGrading = await DisciplineGrading.findOne({
      week: weekId,
      class: classId,
    });

    // Get ClassAcademicGrading data
    const academicGrading = await ClassAcademicGrading.findOne({
      week: weekId,
      class: classId,
    });

    // Get ViolationLog data
    const violations = await ViolationLog.find({
      week: weekId,
      class: classId,
    }).populate('violationType', 'name category severity defaultPenalty');

    // Calculate conduct scores
    const conductScores = {
      total: disciplineGrading?.totalWeeklyScore || 0,
      average: 0,
      maxPossible: disciplineGrading?.maxPossibleScore || 100,
      percentage: disciplineGrading?.percentage || 0,
      byDay: [],
      byItem: disciplineGrading?.items?.map(item => ({
        itemName: item.itemName,
        totalScore: item.totalScore,
        maxScore: item.maxScore * item.applicableDays.length,
        percentage: item.applicableDays.length > 0 
          ? Math.round((item.totalScore / (item.maxScore * item.applicableDays.length)) * 100) 
          : 0,
      })) || [],
    };

    if (conductScores.maxPossible > 0) {
      conductScores.average = Math.round(conductScores.total / 4); // Average per day (4 days/week)
    }

    // Calculate academic scores
    const academicScores = {
      total: academicGrading?.finalWeeklyScore || 0,
      average: academicGrading?.averageScore || 0,
      goodDays: academicGrading?.goodDayCount || 0,
      byDay: academicGrading?.dayGradings?.map(day => ({
        date: null, // Date not stored in dayGradings explicitly usually, or calculated
        dayOfWeek: day.day,
        score: day.dailyScore || 0,
        isGoodDay: day.isGoodDay || false,
      })) || [],
      lessonStatistics: {
        excellent: 0,
        good: 0,
        average: 0,
        poor: 0,
        failing: 0,
        total: 0,
      },
    };

    // Count lesson statistics from academic grading
    if (academicGrading?.dayGradings) {
      academicScores.lessonStatistics.total = academicGrading.totalWeeklyPeriods || 0;
      academicGrading.dayGradings.forEach(day => {
         academicScores.lessonStatistics.excellent += day.excellent || 0;
         academicScores.lessonStatistics.good += day.good || 0;
         academicScores.lessonStatistics.average += day.average || 0;
         academicScores.lessonStatistics.poor += day.poor || 0;
         academicScores.lessonStatistics.failing += day.bad || 0;
      });
    }

    // goodDays is already in the model, no need to recalculate from array if trust model
    // But helper implementation recalculates it. Model has goodDayCount.
    // academicScores.goodDays = academicScores.byDay.filter(d => d.isGoodDay).length; // redundant if taking from model

    // Calculate bonuses based on school year config
    const bonusConfig = schoolYear.bonusConfiguration || {};
    const bonuses = {
      goodDayBonus: academicScores.goodDays * (bonusConfig.goodDayBonus || 0),
      goodWeekBonus: academicScores.goodDays >= 4 ? (bonusConfig.goodWeekBonus || 0) : 0,
      total: 0,
    };
    bonuses.total = bonuses.goodDayBonus + bonuses.goodWeekBonus;

    // Calculate violations summary and penalties
    let violationPenaltyTotal = 0;
    const violationsSummary = {
      total: violations.length,
      approved: violations.filter(v => v.status === 'Đã duyệt').length,
      pending: violations.filter(v => v.status === 'Chờ duyệt').length,
      rejected: violations.filter(v => v.status === 'Từ chối').length,
      totalPenalty: 0,
      byType: [],
      topViolators: [],
    };

    // Group violations by type
    const violationsByType = {};
    const violationsByStudent = {};

    violations.forEach(v => {
      const typeId = v.violationType?._id?.toString() || 'unknown';
      const typeName = v.violationType?.name || 'Khác';
      const severity = v.violationType?.severity || 'Nhẹ';
      const defaultPenalty = v.violationType?.defaultPenalty || 0;
      
      // Calculate penalty if approved
      if (v.status === 'Đã duyệt') {
        violationPenaltyTotal += defaultPenalty;
      }

      if (!violationsByType[typeId]) {
        violationsByType[typeId] = {
          violationType: v.violationType?._id,
          typeName,
          count: 0,
          severity,
        };
      }
      violationsByType[typeId].count++;

      // Count by student
      const studentId = v.student?.toString();
      if (studentId) {
        if (!violationsByStudent[studentId]) {
          violationsByStudent[studentId] = { student: v.student, count: 0 };
        }
        violationsByStudent[studentId].count++;
      }
    });
    
    violationsSummary.totalPenalty = violationPenaltyTotal;

    violationsSummary.byType = Object.values(violationsByType);
    violationsSummary.topViolators = Object.values(violationsByStudent)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 violators

    // Calculate total score and classification
    // Total = conduct percentage (weighted) + bonuses - violation penalties
    const conductWeight = 1.0; // Full weight for conduct
    const totalScore = Math.max(0, conductScores.total + bonuses.total - violationPenaltyTotal); // Ensure not negative?? Or allow? Usually allows logic to go down. But let's cap at 0 for now or follow user rule? User didn't specify min 0. Let's keep it Math.max(0, ...) safe logic for now unless requested otherwise.
    
    // Recalculate percentage based on maxPossible
    const percentage = conductScores.maxPossible > 0 
      ? Math.round((totalScore / conductScores.maxPossible) * 100)
      : 0;

    // Get classification thresholds from school year
    const thresholds = schoolYear.classificationThresholds || {};
    const flag = calculateFlag(percentage, thresholds);

    const classification = {
      flag,
      totalScore,
      percentage,
      ranking: null, // Will be calculated separately when comparing classes
    };

    // Find existing or create new summary
    let summary = await WeeklySummary.findOne({ week: weekId, class: classId });

    if (summary) {
      // Update existing
      summary.conductScores = conductScores;
      summary.academicScores = academicScores;
      summary.bonuses = bonuses;
      summary.violations = violationsSummary;
      summary.classification = classification;
      if (userId) summary.updatedBy = userId;
    } else {
      // Create new
      summary = new WeeklySummary({
        week: weekId,
        class: classId,
        conductScores,
        academicScores,
        bonuses,
        violations: violationsSummary,
        classification,
        status: 'Nháp',
        createdBy: userId,
      });
    }

    await summary.save();
    
    console.log(`updateWeeklySummary: Updated summary for week ${weekId}, class ${classId}, flag: ${flag}`);
    
    return summary;
  } catch (error) {
    console.error('updateWeeklySummary error:', error);
    return null;
  }
};

/**
 * Recalculate flag for an existing WeeklySummary
 * Used when school year thresholds change
 */
const recalculateFlag = async (summaryId) => {
  try {
    const summary = await WeeklySummary.findById(summaryId).populate({
      path: 'week',
      populate: { path: 'schoolYear' }
    });
    
    if (!summary) return null;
    
    const thresholds = summary.week?.schoolYear?.classificationThresholds || {};
    const percentage = summary.classification?.percentage || 0;
    const flag = calculateFlag(percentage, thresholds);
    
    summary.classification.flag = flag;
    await summary.save();
    
    return summary;
  } catch (error) {
    console.error('recalculateFlag error:', error);
    return null;
  }
};

module.exports = {
  updateWeeklySummary,
  calculateFlag,
  recalculateFlag,
};
