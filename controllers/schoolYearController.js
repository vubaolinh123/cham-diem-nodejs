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
      const weekStartDay = weekConfiguration?.weekStartDay || 2;
      const weekEndDay = weekConfiguration?.weekEndDay || 6;

      let currentDate = new Date(startDate);
      const endDateObj = new Date(endDate);
      const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay();
      
      if (dayOfWeek !== weekStartDay) {
        const daysToAdd = (weekStartDay - dayOfWeek + 7) % 7;
        currentDate.setDate(currentDate.getDate() + daysToAdd);
      }

      const weeksToCreate = [];
      let weekNumber = 1;

      while (currentDate <= endDateObj) {
        const weekEndDate = new Date(currentDate);
        weekEndDate.setDate(weekEndDate.getDate() + (weekEndDay - weekStartDay));

        if (weekEndDate > endDateObj) break;

        weeksToCreate.push({
          schoolYear: schoolYear._id,
          weekNumber,
          startDate: new Date(currentDate),
          endDate: new Date(weekEndDate),
          status: 'Nháp',
        });

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
 * Xóa năm học
 * @route DELETE /api/school-years/:id
 * @access Admin
 */
const deleteSchoolYear = async (req, res, next) => {
  try {
    const { id } = req.params;

    const schoolYear = await SchoolYear.findByIdAndDelete(id);

    if (!schoolYear) {
      return sendError(res, 404, 'Năm học không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Xóa năm học thành công');
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

    // Check if weeks already exist for this school year
    const existingWeeks = await Week.find({ schoolYear: id });
    if (existingWeeks.length > 0) {
      return sendError(res, 400, `Đã có ${existingWeeks.length} tuần được tạo cho năm học này. Xóa trước nếu muốn tạo lại.`);
    }

    const startDate = new Date(schoolYear.startDate);
    const endDate = new Date(schoolYear.endDate);
    const weekStartDay = schoolYear.weekConfiguration?.weekStartDay || 2; // Default Monday = 2
    const weekEndDay = schoolYear.weekConfiguration?.weekEndDay || 6; // Default Friday = 6

    // Find the first Monday (weekStartDay) on or after startDate
    let currentDate = new Date(startDate);
    const dayOfWeek = currentDate.getDay() === 0 ? 7 : currentDate.getDay(); // Convert Sunday 0 -> 7
    if (dayOfWeek !== weekStartDay) {
      const daysToAdd = (weekStartDay - dayOfWeek + 7) % 7;
      currentDate.setDate(currentDate.getDate() + daysToAdd);
    }

    const weeksToCreate = [];
    let weekNumber = 1;

    while (currentDate <= endDate) {
      // Calculate week end date
      const weekEndDate = new Date(currentDate);
      weekEndDate.setDate(weekEndDate.getDate() + (weekEndDay - weekStartDay));

      // Don't create week if end date is past school year end
      if (weekEndDate > endDate) break;

      weeksToCreate.push({
        schoolYear: id,
        weekNumber,
        startDate: new Date(currentDate),
        endDate: new Date(weekEndDate),
        status: 'Nháp',
      });

      // Move to next week
      currentDate.setDate(currentDate.getDate() + 7);
      weekNumber++;
    }

    if (weeksToCreate.length === 0) {
      return sendError(res, 400, 'Không thể tạo tuần nào với khoảng thời gian này');
    }

    const createdWeeks = await Week.insertMany(weeksToCreate);

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
};


