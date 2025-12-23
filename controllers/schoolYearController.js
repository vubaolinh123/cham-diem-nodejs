const SchoolYear = require('../models/SchoolYear');
const Week = require('../models/Week');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy tất cả năm học
 * @route GET /api/school-years
 * @access Admin
 */
const getAllSchoolYears = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const schoolYears = await SchoolYear.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ year: -1 });

    const total = await SchoolYear.countDocuments(filter);

    return sendResponse(res, 200, true, 'Lấy danh sách năm học thành công', {
      schoolYears,
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
 * Lấy năm học theo ID
 * @route GET /api/school-years/:id
 * @access Admin
 */
const getSchoolYearById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const schoolYear = await SchoolYear.findById(id)
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email');

    if (!schoolYear) {
      return sendError(res, 404, 'Năm học không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin năm học thành công', {
      schoolYear,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy năm học hiện tại (hoạt động)
 * @route GET /api/school-years/current
 * @access Public
 */
const getCurrentSchoolYear = async (req, res, next) => {
  try {
    const schoolYear = await SchoolYear.findOne({ status: 'Hoạt động' })
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email');

    if (!schoolYear) {
      return sendError(res, 404, 'Không có năm học hoạt động');
    }

    return sendResponse(res, 200, true, 'Lấy năm học hiện tại thành công', {
      schoolYear,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo năm học mới
 * @route POST /api/school-years
 * @access Admin
 */
const createSchoolYear = async (req, res, next) => {
  try {
    const {
      year,
      startDate,
      endDate,
      academicScoringCoefficients,
      bonusConfiguration,
      classificationThresholds,
      conductConfiguration,
      weekConfiguration,
      notes,
      autoGenerateWeeks,
    } = req.body;

    // Kiểm tra năm học đã tồn tại
    const existingYear = await SchoolYear.findOne({ year });
    if (existingYear) {
      return sendError(res, 400, 'Năm học này đã tồn tại');
    }

    // Kiểm tra ngày hợp lệ
    if (new Date(startDate) >= new Date(endDate)) {
      return sendError(res, 400, 'Ngày bắt đầu phải trước ngày kết thúc');
    }

    const schoolYear = new SchoolYear({
      year,
      startDate,
      endDate,
      academicScoringCoefficients,
      bonusConfiguration,
      classificationThresholds,
      conductConfiguration,
      weekConfiguration,
      notes,
      createdBy: req.userId,
    });

    await schoolYear.save();

    let createdWeeks = [];

    // Auto generate weeks if requested
    if (autoGenerateWeeks) {
      // Week always starts on Monday and ends on Sunday
      // JS Date.getDay(): 0=Sunday, 1=Monday, 2=Tuesday, ..., 6=Saturday
      
      let currentDate = new Date(startDate);
      currentDate.setHours(0, 0, 0, 0); // Reset to start of day
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999); // End of day
      
      // Get current day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
      const dayOfWeek = currentDate.getDay();
      
      // If startDate is not Monday, find the NEXT Monday
      // Monday = 1 in JS Date.getDay()
      if (dayOfWeek !== 1) {
        // Calculate days to add to reach next Monday
        // If Sunday (0): add 1 day
        // If Tuesday (2): add 6 days
        // If Wednesday (3): add 5 days
        // If Thursday (4): add 4 days
        // If Friday (5): add 3 days
        // If Saturday (6): add 2 days
        const daysToMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
        currentDate.setDate(currentDate.getDate() + daysToMonday);
      }

      const weeksToCreate = [];
      let weekNumber = 1;

      while (currentDate <= endDateObj) {
        // Week end is Sunday = start date + 6 days
        const weekEndDate = new Date(currentDate);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        weekEndDate.setHours(23, 59, 59, 999);

        // Don't create week if Sunday exceeds school year end date
        if (weekEndDate > endDateObj) break;

        weeksToCreate.push({
          schoolYear: schoolYear._id,
          weekNumber,
          startDate: new Date(currentDate),
          endDate: new Date(weekEndDate),
          status: 'Nháp',
        });

        // Move to next Monday (7 days later)
        currentDate.setDate(currentDate.getDate() + 7);
        weekNumber++;
      }

      if (weeksToCreate.length > 0) {
        createdWeeks = await Week.insertMany(weeksToCreate);
      }
    }

    return sendResponse(res, 201, true, 
      autoGenerateWeeks && createdWeeks.length > 0 
        ? `Tạo năm học thành công và đã tạo ${createdWeeks.length} tuần` 
        : 'Tạo năm học thành công', 
      {
        schoolYear,
        weeksCreated: createdWeeks.length,
      }
    );
  } catch (error) {
    next(error);
  }
};


/**
 * Cập nhật năm học
 * @route PUT /api/school-years/:id
 * @access Admin
 */
const updateSchoolYear = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      startDate,
      endDate,
      status,
      academicScoringCoefficients,
      bonusConfiguration,
      classificationThresholds,
      conductConfiguration,
      weekConfiguration,
      notes,
    } = req.body;

    const schoolYear = await SchoolYear.findById(id);

    if (!schoolYear) {
      return sendError(res, 404, 'Năm học không tìm thấy');
    }

    // Kiểm tra ngày hợp lệ nếu cập nhật
    if (startDate && endDate) {
      if (new Date(startDate) >= new Date(endDate)) {
        return sendError(res, 400, 'Ngày bắt đầu phải trước ngày kết thúc');
      }
      schoolYear.startDate = startDate;
      schoolYear.endDate = endDate;
    }

    if (status) schoolYear.status = status;
    if (academicScoringCoefficients) {
      schoolYear.academicScoringCoefficients = {
        ...schoolYear.academicScoringCoefficients,
        ...academicScoringCoefficients,
      };
    }
    if (bonusConfiguration) {
      schoolYear.bonusConfiguration = {
        ...schoolYear.bonusConfiguration,
        ...bonusConfiguration,
      };
    }
    if (classificationThresholds) {
      schoolYear.classificationThresholds = {
        ...schoolYear.classificationThresholds,
        ...classificationThresholds,
      };
    }
    if (conductConfiguration) {
      schoolYear.conductConfiguration = {
        ...schoolYear.conductConfiguration,
        ...conductConfiguration,
      };
    }
    if (weekConfiguration) {
      schoolYear.weekConfiguration = {
        ...schoolYear.weekConfiguration,
        ...weekConfiguration,
      };
    }
    if (notes) schoolYear.notes = notes;

    schoolYear.updatedBy = req.userId;
    await schoolYear.save();

    return sendResponse(res, 200, true, 'Cập nhật năm học thành công', {
      schoolYear,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xem trước dữ liệu sẽ bị xóa khi xóa năm học
 * @route GET /api/school-years/:id/delete-preview
 * @access Admin
 */
const getDeletePreview = async (req, res, next) => {
  try {
    const { id } = req.params;

    const schoolYear = await SchoolYear.findById(id);
    if (!schoolYear) {
      return sendError(res, 404, 'Năm học không tìm thấy');
    }

    // Import all related models
    const Class = require('../models/Class');
    const Student = require('../models/Student');
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');
    const ViolationLog = require('../models/ViolationLog');
    const WeeklySummary = require('../models/WeeklySummary');
    const MonthlySummary = require('../models/MonthlySummary');

    // Get all classes for this school year to count their related data
    const classes = await Class.find({ schoolYear: id });
    const classIds = classes.map(c => c._id);

    // Count all related data
    const [
      weeksCount,
      classesCount,
      studentsCount,
      disciplineGradingsCount,
      academicGradingsCount,
      violationsCount,
      weeklySummariesCount,
      monthlySummariesCount,
    ] = await Promise.all([
      Week.countDocuments({ schoolYear: id }),
      Class.countDocuments({ schoolYear: id }),
      Student.countDocuments({ class: { $in: classIds } }),
      DisciplineGrading.countDocuments({ schoolYear: id }),
      ClassAcademicGrading.countDocuments({ schoolYear: id }),
      ViolationLog.countDocuments({ class: { $in: classIds } }),
      WeeklySummary.countDocuments({ class: { $in: classIds } }),
      MonthlySummary.countDocuments({ schoolYear: id }),
    ]);

    const total = weeksCount + classesCount + studentsCount + disciplineGradingsCount + 
                  academicGradingsCount + violationsCount + weeklySummariesCount + monthlySummariesCount;

    return sendResponse(res, 200, true, 'Lấy thông tin xóa thành công', {
      item: {
        _id: schoolYear._id,
        year: schoolYear.year,
        status: schoolYear.status,
      },
      willDelete: {
        weeks: weeksCount,
        classes: classesCount,
        students: studentsCount,
        disciplineGradings: disciplineGradingsCount,
        academicGradings: academicGradingsCount,
        violations: violationsCount,
        weeklySummaries: weeklySummariesCount,
        monthlySummaries: monthlySummariesCount,
        total,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa năm học và tất cả dữ liệu liên quan
 * @route DELETE /api/school-years/:id
 * @access Admin
 */
const deleteSchoolYear = async (req, res, next) => {
  try {
    const { id } = req.params;

    const schoolYear = await SchoolYear.findById(id);
    if (!schoolYear) {
      return sendError(res, 404, 'Năm học không tìm thấy');
    }

    // Don't allow deleting active school year
    if (schoolYear.status === 'Hoạt động') {
      return sendError(res, 400, 'Không thể xóa năm học đang hoạt động');
    }

    // Import all related models
    const Class = require('../models/Class');
    const Student = require('../models/Student');
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');
    const ViolationLog = require('../models/ViolationLog');
    const WeeklySummary = require('../models/WeeklySummary');
    const MonthlySummary = require('../models/MonthlySummary');
    const ConductScore = require('../models/ConductScore');
    const AcademicScore = require('../models/AcademicScore');

    // Get all classes for this school year to delete their related data
    const classes = await Class.find({ schoolYear: id });
    const classIds = classes.map(c => c._id);

    // Delete all related data and get counts
    const [
      weeksResult,
      studentsResult,
      disciplineResult,
      academicResult,
      violationsResult,
      weeklySummariesResult,
      monthlySummariesResult,
      conductResult,
      academicScoreResult,
    ] = await Promise.all([
      Week.deleteMany({ schoolYear: id }),
      Student.deleteMany({ class: { $in: classIds } }),
      DisciplineGrading.deleteMany({ schoolYear: id }),
      ClassAcademicGrading.deleteMany({ schoolYear: id }),
      ViolationLog.deleteMany({ class: { $in: classIds } }),
      WeeklySummary.deleteMany({ class: { $in: classIds } }),
      MonthlySummary.deleteMany({ schoolYear: id }),
      ConductScore.deleteMany({ class: { $in: classIds } }),
      AcademicScore.deleteMany({ class: { $in: classIds } }),
    ]);

    // Delete all classes
    const classesResult = await Class.deleteMany({ schoolYear: id });

    // Delete the school year itself
    await SchoolYear.findByIdAndDelete(id);

    const deleted = {
      schoolYear: {
        _id: schoolYear._id,
        year: schoolYear.year,
      },
      weeks: weeksResult.deletedCount,
      classes: classesResult.deletedCount,
      students: studentsResult.deletedCount,
      disciplineGradings: disciplineResult.deletedCount,
      academicGradings: academicResult.deletedCount,
      violations: violationsResult.deletedCount,
      weeklySummaries: weeklySummariesResult.deletedCount,
      monthlySummaries: monthlySummariesResult.deletedCount,
      conductScores: conductResult.deletedCount,
      academicScores: academicScoreResult.deletedCount,
      total: weeksResult.deletedCount + classesResult.deletedCount + studentsResult.deletedCount +
             disciplineResult.deletedCount + academicResult.deletedCount + violationsResult.deletedCount +
             weeklySummariesResult.deletedCount + monthlySummariesResult.deletedCount +
             conductResult.deletedCount + academicScoreResult.deletedCount,
    };

    return sendResponse(res, 200, true, 'Xóa năm học và dữ liệu liên quan thành công', { deleted });
  } catch (error) {
    next(error);
  }
};

/**
 * Tự động tạo tuần cho năm học
 * @route POST /api/school-years/:id/generate-weeks
 * @access Admin
 */
const generateWeeks = async (req, res, next) => {
  try {
    const { id } = req.params;

    const schoolYear = await SchoolYear.findById(id);

    if (!schoolYear) {
      return sendError(res, 404, 'Năm học không tìm thấy');
    }

    // Check if weeks already exist
    const existingWeeks = await Week.countDocuments({ schoolYear: id });
    if (existingWeeks > 0) {
      return sendError(res, 400, 'Năm học này đã có tuần học được tạo');
    }

    // Generate weeks from startDate to endDate
    const weeks = [];
    let currentDate = new Date(schoolYear.startDate);
    const endDate = new Date(schoolYear.endDate);
    let weekNumber = 1;

    // Find the first Monday
    while (currentDate.getDay() !== 1 && currentDate < endDate) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    while (currentDate < endDate) {
      const weekStart = new Date(currentDate);
      const weekEnd = new Date(currentDate);
      weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

      // Don't exceed school year end date
      if (weekEnd > endDate) {
        weekEnd.setTime(endDate.getTime());
      }

      weeks.push({
        schoolYear: id,
        weekNumber,
        startDate: weekStart,
        endDate: weekEnd,
        status: 'Chờ',
        createdBy: req.userId,
      });

      weekNumber++;
      currentDate.setDate(currentDate.getDate() + 7); // Next Monday
    }

    if (weeks.length === 0) {
      return sendError(res, 400, 'Không thể tạo tuần nào với khoảng thời gian này');
    }

    const createdWeeks = await Week.insertMany(weeks);

    return sendResponse(res, 201, true, `Tạo ${createdWeeks.length} tuần thành công`, {
      weeks: createdWeeks,
      count: createdWeeks.length,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllSchoolYears,
  getSchoolYearById,
  getCurrentSchoolYear,
  createSchoolYear,
  updateSchoolYear,
  deleteSchoolYear,
  generateWeeks,
  getDeletePreview,
};



