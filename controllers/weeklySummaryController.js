const WeeklySummary = require('../models/WeeklySummary');
const Week = require('../models/Week');
const Class = require('../models/Class');
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
 * Lấy tổng hợp tuần theo lớp và tuần
 * @route GET /api/weekly-summaries/class/:classId/week/:weekId
 * @access Authenticated
 */
const getWeeklySummaryByClassAndWeek = async (req, res, next) => {
  try {
    const { classId, weekId } = req.params;

    const summary = await WeeklySummary.findOne({
      week: weekId,
      class: classId,
    })
      .populate('week', 'weekNumber startDate endDate')
      .populate('class', 'name grade')
      .populate('violations.byType.violationType', 'name category')
      .populate('violations.topViolators.student', 'studentId fullName');

    if (!summary) {
      return sendError(res, 404, 'Tổng hợp tuần không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy tổng hợp tuần theo lớp và tuần thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
/**
 * Tạo/Cập nhật tổng hợp tuần (dùng weeklySummaryHelper để lấy đúng dữ liệu từ DisciplineGrading/ClassAcademicGrading)
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

    // Use the helper which correctly reads from DisciplineGrading, ClassAcademicGrading, ViolationLog
    const { updateWeeklySummary } = require('../utils/weeklySummaryHelper');
    const summary = await updateWeeklySummary(week, classId, req.userId);

    if (!summary) {
      return sendError(res, 404, 'Không tìm thấy dữ liệu điểm nề nếp hoặc học tập cho tuần và lớp này');
    }

    await summary.populate([
      { path: 'week', select: 'weekNumber startDate endDate' },
      { path: 'class', select: 'name grade' },
    ]);

    return sendResponse(res, 200, true, 'Tổng hợp tuần thành công', {
      summary,
    });
  } catch (error) {
    next(error);
  }
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

    // Delegate to the helper to ensure single source of truth for score calculations
    // (conduct from items × applicableDays, academic from finalWeeklyScore, penalty from violations,
    //  totalScore = conduct + academic - penalty, maxTotalScore = conductMax + academicMax)
    const { updateWeeklySummary: helperUpdateWeeklySummary } = require('../utils/weeklySummaryHelper');
    const summary = await helperUpdateWeeklySummary(week, classId, req.userId);

    if (!summary) {
      return sendError(res, 404, 'Không tìm thấy dữ liệu điểm nề nếp hoặc học tập cho tuần và lớp này');
    }

    // Determine final status: prefer explicit status from request; otherwise inherit lock from DisciplineGrading
    let finalStatus = status || 'Nháp';
    const disciplineGrading = await DisciplineGrading.findOne({ week, class: classId });
    if (!status && disciplineGrading && disciplineGrading.status === 'Khóa') {
      finalStatus = 'Khóa';
    }

    summary.status = finalStatus;
    if (notes !== undefined) summary.notes = notes;
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
    if (classification) {
      // Allow manual flag assignment
      if (classification.flag !== undefined) summary.classification.flag = classification.flag;
      if (classification.totalScore !== undefined) summary.classification.totalScore = classification.totalScore;
      if (classification.ranking !== undefined) summary.classification.ranking = classification.ranking;
    }
    if (status) {
      // Record approval metadata when transitioning to Duyệt
      if (status === 'Duyệt' && summary.status !== 'Duyệt') {
        summary.approvedBy = req.userId;
        summary.approvedDate = new Date();
      }
      summary.status = status;
    }
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

/**
 * Tự động tạo tổng hợp tuần cho tất cả các tuần+lop có điểm nề nếp hoặc học tập
 * @route POST /api/weekly-summaries/auto-generate-all
 * @access Admin
 */
const autoGenerateAllWeeklySummaries = async (req, res, next) => {
  try {
    const { updateExisting = false } = req.body;

    // Find all week+class pairs that have DisciplineGrading or ClassAcademicGrading
    const disciplineGradings = await DisciplineGrading.find({}, 'week class');
    const academicGradings = await ClassAcademicGrading.find({}, 'week class');

    // Combine unique week+class pairs
    const weekClassPairs = new Map();
    [...disciplineGradings, ...academicGradings].forEach((doc) => {
      const key = `${doc.week}_${doc.class}`;
      if (!weekClassPairs.has(key)) {
        weekClassPairs.set(key, { week: doc.week.toString(), class: doc.class.toString() });
      }
    });

    if (weekClassPairs.size === 0) {
      return sendResponse(res, 200, true, 'Không có dữ liệu điểm nề nếp hoặc học tập để tổng hợp', {
        created: 0,
        updated: 0,
        skipped: 0,
        summaries: [],
      });
    }

    // Use the helper to generate/update summaries
    const { updateWeeklySummary } = require('../utils/weeklySummaryHelper');
    const results = { created: 0, updated: 0, skipped: 0, summaries: [] };

    for (const [, pair] of weekClassPairs) {
      try {
        // Check if summary already exists
        const existing = await WeeklySummary.findOne({ week: pair.week, class: pair.class });

        if (existing && !updateExisting) {
          // Skip if already exists and updateExisting is false
          const populated = await WeeklySummary.findById(existing._id)
            .populate('week', 'weekNumber startDate endDate')
            .populate('class', 'name grade');
          results.skipped++;
          results.summaries.push(populated);
          continue;
        }

        // Generate/update using the helper
        const summary = await updateWeeklySummary(pair.week, pair.class, req.userId);
        if (summary) {
          const populated = await WeeklySummary.findById(summary._id)
            .populate('week', 'weekNumber startDate endDate')
            .populate('class', 'name grade');
          if (existing) {
            results.updated++;
          } else {
            results.created++;
          }
          results.summaries.push(populated);
        }
      } catch (err) {
        console.error(`autoGenerateAllWeeklySummaries: Error for week ${pair.week}, class ${pair.class}:`, err.message);
      }
    }

    return sendResponse(res, 200, true, `Tổng hợp tuần thành công: ${results.created} mới, ${results.updated} cập nhật, ${results.skipped} bỏ qua`, results);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllWeeklySummaries,
  getWeeklySummaryById,
  getWeeklySummaryByClassAndWeek,
  generateWeeklySummary,
  createWeeklySummary,
  updateWeeklySummary,
  deleteWeeklySummary,
  unlockWeeklySummary,
  autoGenerateAllWeeklySummaries,
};


