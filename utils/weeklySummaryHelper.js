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
    // Recalculate maxPossible from items to avoid stale DB values
    const calculatedConductMaxPossible = disciplineGrading?.items?.reduce(
      (sum, item) => sum + (item.maxScore || 5) * (item.applicableDays?.length || 0), 0
    ) || 0;
    // Recalculate conductTotal from items to avoid stale DB values
    // Prefer item.totalScore; fall back to summing dayScores if totalScore is missing
    const calculatedConductTotal = disciplineGrading?.items?.reduce((sum, item) => {
      const itemTotal = (typeof item.totalScore === 'number')
        ? item.totalScore
        : (item.dayScores?.reduce((ds, s) => ds + (s.score || 0), 0) || 0);
      return sum + itemTotal;
    }, 0) || 0;
    const conductTotal = calculatedConductTotal || (disciplineGrading?.totalWeeklyScore || 0);
    const conductMaxPossible = calculatedConductMaxPossible > 0 ? calculatedConductMaxPossible : (disciplineGrading?.maxPossibleScore || 100);
    const conductPercentage = conductMaxPossible > 0 ? Math.round((conductTotal / conductMaxPossible) * 100) : 0;

    const conductScores = {
      total: conductTotal,
      average: 0,
      maxPossible: conductMaxPossible,
      percentage: conductPercentage,
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
      // Calculate average based on actual number of days with scores
      const dayCount = disciplineGrading?.items?.[0]?.applicableDays?.length || 5;
      conductScores.average = Math.round(conductScores.total / dayCount);
    }

    // Calculate academic scores
    // finalWeeklyScore ALREADY includes goodDayBonus and goodWeekBonus from ClassAcademicGrading pre-save hook
    // So we use it as-is and do NOT add bonuses again
    const academicBaseScore = academicGrading?.averageScore || 0;
    const academicGoodDayBonus = academicGrading?.goodDayBonus || 0;
    const academicGoodWeekBonus = academicGrading?.goodWeekBonus || 0;
    const academicTotal = academicGrading?.finalWeeklyScore || 0;

    const academicScores = {
      total: academicTotal,
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

    // Bonuses are already included in finalWeeklyScore (from ClassAcademicGrading pre-save hook)
    // So we record them for display purposes only, NOT adding them again to totalScore
    const bonuses = {
      goodDayBonus: academicGoodDayBonus,
      goodWeekBonus: academicGoodWeekBonus,
      total: academicGoodDayBonus + academicGoodWeekBonus,
    };

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
          approvedCount: 0,
          severity,
          penaltyPerViolation: defaultPenalty,
          totalPenalty: 0,
        };
      }
      violationsByType[typeId].count++;
      if (v.status === 'Đã duyệt') {
        violationsByType[typeId].approvedCount++;
        violationsByType[typeId].totalPenalty += defaultPenalty;
      }

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
    // Formula: Total = Conduct Score + Academic Score - Violation Penalty
    // Bonuses are ALREADY included in academicScore (finalWeeklyScore = averageScore + goodDayBonus + goodWeekBonus)
    // So we do NOT add bonuses again here
    const conductScoreValue = conductScores.total || 0;
    const academicScoreValue = academicScores.total || 0;
    const penaltyDeduction = violationPenaltyTotal || 0;
    
    // Total = Conduct (0-conductMaxPossible) + Academic (0-academicMaxPossible) - Penalties
    const totalScore = conductScoreValue + academicScoreValue - penaltyDeduction;
    
    // Calculate academic max possible score
    // academicScore max = maxAverageScore + maxBonus
    // maxAverageScore = 20 (all periods excellent), maxBonus depends on goodWeek or goodDays
    // For a good week: 20 + goodWeekBonus (e.g. 80)
    // For non-good week: 20 + goodDays * goodDayBonus (e.g. 5 * 20 = 100, max 100)
    // We use the actual academic total as-is since it's already computed with bonuses
    // The max possible = maxAverage(20) + maxBonus(from school year config)
    const bonusConfig = schoolYear.bonusConfiguration || {};
    const schoolDayCount = disciplineGrading?.items?.[0]?.applicableDays?.length || 5;
    const goodWeekThreshold = schoolDayCount >= 5 ? 5 : schoolDayCount;
    const maxGoodDayBonus = (bonusConfig.goodDayBonus || 0) * schoolDayCount;
    const maxGoodWeekBonus = bonusConfig.goodWeekBonus || 0;
    // Academic max: use the greater of goodWeekBonus vs maxGoodDayBonus since only one applies
    const academicMaxBonus = Math.max(maxGoodDayBonus, maxGoodWeekBonus);
    const academicMaxPossible = 20 + academicMaxBonus; // max average (20) + max bonus
    
    // Calculate max total possible score
    const maxTotal = (conductScores.maxPossible || 0) + academicMaxPossible;
    const percentage = maxTotal > 0 ? Math.round((totalScore / maxTotal) * 100) : 0;
    // Get classification thresholds from school year
    // Flag is now manually assigned by admin, no auto-calculation
    // Keep existing flag if summary exists, otherwise set null
    const existingFlag = (await WeeklySummary.findOne({ week: weekId, class: classId }))?.classification?.flag || 'Chưa xếp cờ';
    const flag = existingFlag;

    const classification = {
      flag,
      totalScore,
      maxTotalScore: maxTotal, // Track max possible total (conduct max + academic max)
      penaltyDeduction,
      percentage,
      ranking: null, // Will be calculated separately when comparing classes
    };

    // Find existing or create new summary
    let summary = await WeeklySummary.findOne({ week: weekId, class: classId });

    if (summary) {
      // Always update scores data, but preserve status and manually-assigned flag
      // This ensures the duyệt/khóa tuần page always shows the latest data
      const preservedStatus = summary.status;
      const preservedFlag = summary.classification?.flag || 'Chưa xếp cờ';

      summary.conductScores = conductScores;
      summary.academicScores = academicScores;
      summary.bonuses = bonuses;
      summary.violations = violationsSummary;
      summary.classification = {
        ...classification,
        flag: preservedFlag,
      };
      // Restore the original status (don't auto-change from Duyệt/Khóa)
      summary.status = preservedStatus;
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
  // Flag is now manually assigned by admin, no auto-recalculation
  // This function is kept for backward compatibility but does nothing
  console.log('recalculateFlag: Skipped - flag is now manually assigned');
  return null;
};

module.exports = {
  updateWeeklySummary,
  calculateFlag,
  recalculateFlag,
};
