const ClassAcademicGrading = require('../models/ClassAcademicGrading');
const Class = require('../models/Class');
const Week = require('../models/Week');
const SchoolYear = require('../models/SchoolYear');
const { updateWeeklySummary } = require('../utils/weeklySummaryHelper');

// Helper function để populate
const populateOptions = [
  { path: 'class', select: 'name grade' },
  { path: 'week', select: 'weekNumber startDate endDate' },
  { path: 'schoolYear', select: 'year' },
  { path: 'createdBy', select: 'fullName' },
  { path: 'updatedBy', select: 'fullName' },
];

// @desc    Lấy tất cả ClassAcademicGrading
// @route   GET /api/class-academic-grading
// @access  Private
exports.getAll = async (req, res) => {
  try {
    const { classId, week, schoolYear, status, semester } = req.query;
    const filter = {};

    if (classId) filter.class = classId;
    if (week) {
        const mongoose = require('mongoose');
        if (mongoose.Types.ObjectId.isValid(week)) {
             filter.week = week;
        } else if (!isNaN(week)) {
             const weekDoc = await Week.findOne({ weekNumber: parseInt(week) });
             if (weekDoc) {
                 filter.week = weekDoc._id;
             }
        }
    }
    if (schoolYear) filter.schoolYear = schoolYear;
    if (status) filter.status = status;
    if (semester) filter.semester = parseInt(semester);

    const academicGradings = await ClassAcademicGrading.find(filter)
      .populate(populateOptions)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: academicGradings.length,
      data: academicGradings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Lấy ClassAcademicGrading theo ID
// @route   GET /api/class-academic-grading/:id
// @access  Private
exports.getById = async (req, res) => {
  try {
    const academicGrading = await ClassAcademicGrading.findById(req.params.id)
      .populate(populateOptions);

    if (!academicGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    res.status(200).json({
      success: true,
      data: academicGrading,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Lấy ClassAcademicGrading theo lớp và tuần
// @route   GET /api/class-academic-grading/class/:classId/week/:weekId
// @access  Private
exports.getByClassAndWeek = async (req, res) => {
  try {
    const { classId, weekId } = req.params;

    const academicGrading = await ClassAcademicGrading.findOne({
      class: classId,
      week: weekId,
    }).populate(populateOptions);

    if (!academicGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    res.status(200).json({
      success: true,
      data: academicGrading,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Tạo ClassAcademicGrading mới
// @route   POST /api/class-academic-grading
// @access  Private
exports.create = async (req, res) => {
  try {
    // Kiểm tra xem đã tồn tại chưa
    const existing = await ClassAcademicGrading.findOne({
      class: req.body.class,
      week: req.body.week,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu chấm điểm cho lớp và tuần này đã tồn tại',
      });
    }

    // Thêm người tạo nếu có req.user
    if (req.user) {
      req.body.createdBy = req.user._id;
    }

    const academicGrading = await ClassAcademicGrading.create(req.body);

    const populated = await ClassAcademicGrading.findById(academicGrading._id)
      .populate(populateOptions);

    res.status(201).json({
      success: true,
      message: 'Tạo dữ liệu thành công',
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Cập nhật ClassAcademicGrading
// @route   PUT /api/class-academic-grading/:id
// @access  Private
exports.update = async (req, res) => {
  try {
    let academicGrading = await ClassAcademicGrading.findById(req.params.id);

    if (!academicGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    // Kiểm tra trạng thái khóa
    if (academicGrading.status === 'Khóa') {
      return res.status(400).json({
        success: false,
        message: 'Không thể chỉnh sửa dữ liệu đã khóa',
      });
    }

    // Update fields from request body
    if (req.body.dayGradings) academicGrading.dayGradings = req.body.dayGradings;
    if (req.body.status) academicGrading.status = req.body.status;
    if (req.body.notes !== undefined) academicGrading.notes = req.body.notes;

    // Thêm người cập nhật nếu có req.user
    if (req.user) {
      academicGrading.updatedBy = req.user._id;
    }

    // Save will trigger pre-save hook to recalculate scores
    await academicGrading.save();

    // Auto-update WeeklySummary
    await updateWeeklySummary(academicGrading.week, academicGrading.class, req.user?._id);

    // Populate and return
    await academicGrading.populate(populateOptions);

    res.status(200).json({
      success: true,
      message: 'Cập nhật dữ liệu thành công',
      data: academicGrading,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};


// @desc    Xóa ClassAcademicGrading
// @route   DELETE /api/class-academic-grading/:id
// @access  Private
exports.delete = async (req, res) => {
  try {
    const academicGrading = await ClassAcademicGrading.findById(req.params.id);

    if (!academicGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    // Kiểm tra trạng thái khóa
    if (academicGrading.status === 'Khóa') {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa dữ liệu đã khóa',
      });
    }

    await ClassAcademicGrading.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Xóa dữ liệu thành công',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Cập nhật trạng thái
// @route   PATCH /api/class-academic-grading/:id/status
// @access  Private
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Nháp', 'Đã duyệt', 'Khóa'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Trạng thái không hợp lệ',
      });
    }

    let academicGrading = await ClassAcademicGrading.findById(req.params.id);

    if (!academicGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    // Kiểm tra logic chuyển trạng thái
    if (academicGrading.status === 'Khóa' && status !== 'Khóa') {
      return res.status(400).json({
        success: false,
        message: 'Không thể mở khóa dữ liệu đã khóa',
      });
    }

    const updateData = { status };
    if (req.user) {
      updateData.updatedBy = req.user._id;
    }

    academicGrading = await ClassAcademicGrading.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate(populateOptions);

    res.status(200).json({
      success: true,
      message: `Cập nhật trạng thái thành "${status}" thành công`,
      data: academicGrading,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Tính toán lại điểm
// @route   POST /api/class-academic-grading/:id/calculate
// @access  Private
exports.calculateScores = async (req, res) => {
  try {
    let academicGrading = await ClassAcademicGrading.findById(req.params.id);

    if (!academicGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    // Lưu lại để trigger pre-save hook tính toán
    await academicGrading.save();

    const populated = await ClassAcademicGrading.findById(req.params.id)
      .populate(populateOptions);

    res.status(200).json({
      success: true,
      message: 'Tính toán lại điểm thành công',
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Lấy thống kê theo năm học
// @route   GET /api/class-academic-grading/stats/:schoolYearId
// @access  Private
exports.getStatsBySchoolYear = async (req, res) => {
  try {
    const { schoolYearId } = req.params;

    const stats = await ClassAcademicGrading.aggregate([
      { $match: { schoolYear: require('mongoose').Types.ObjectId(schoolYearId) } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          avgFinalScore: { $avg: '$finalWeeklyScore' },
          avgGoodDayCount: { $avg: '$goodDayCount' },
          totalGoodWeeks: { $sum: { $cond: ['$isGoodWeek', 1, 0] } },
        },
      },
    ]);

    const totalRecords = await ClassAcademicGrading.countDocuments({ schoolYear: schoolYearId });

    res.status(200).json({
      success: true,
      data: {
        totalRecords,
        stats: stats[0] || {
          count: 0,
          avgFinalScore: 0,
          avgGoodDayCount: 0,
          totalGoodWeeks: 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Bắt đầu chấm điểm học tập (tạo record mới với default dayGradings)
// @route   POST /api/class-academic-grading/start
// @access  Private
exports.startGrading = async (req, res) => {
  try {
    const { week, class: classId } = req.body;

    if (!week || !classId) {
      return res.status(400).json({
        success: false,
        message: 'Tuần và Lớp là bắt buộc',
      });
    }

    // Check if already exists
    const existing = await ClassAcademicGrading.findOne({ class: classId, week });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu chấm điểm cho lớp và tuần này đã tồn tại',
        data: existing,
      });
    }

    // Get week info
    const weekDoc = await Week.findById(week);
    if (!weekDoc) {
      return res.status(404).json({
        success: false,
        message: 'Tuần không tìm thấy',
      });
    }

    // Default dayGradings for days 2-6 (Thứ 2 - Thứ 6)
    const dayGradings = [2, 3, 4, 5, 6].map(day => ({
      day,
      excellent: 0,
      good: 0,
      average: 0,
      poor: 0,
      bad: 0,
      totalPeriods: 0,
      dailyScore: 0,
      isGoodDay: false,
    }));

    // Create new ClassAcademicGrading
    const academicGrading = new ClassAcademicGrading({
      class: classId,
      week,
      schoolYear: weekDoc.schoolYear,
      semester: 1, // Default semester
      weekStartDate: weekDoc.startDate,
      weekEndDate: weekDoc.endDate,
      dayGradings,
      status: 'Nháp',
      createdBy: req.userId || req.user?._id,
    });

    await academicGrading.save();

    const populated = await ClassAcademicGrading.findById(academicGrading._id)
      .populate(populateOptions);

    res.status(201).json({
      success: true,
      message: 'Bắt đầu chấm điểm học tập thành công',
      data: populated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

