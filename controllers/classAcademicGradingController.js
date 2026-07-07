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

    // Resolve `schoolYear` early so the (weekNumber → ObjectId) resolution
    // is always scoped to a specific school year. If the client did not
    // pass schoolYear, fall back to the active one.
    let resolvedSchoolYear = schoolYear;
    if (!resolvedSchoolYear) {
      const active = await SchoolYear.findOne({ status: 'Hoạt động' }).sort({ updatedAt: -1 }).select('_id');
      if (active) resolvedSchoolYear = active._id;
    }
    if (resolvedSchoolYear) filter.schoolYear = resolvedSchoolYear;

    if (week) {
        // If week is a valid ObjectId, use it directly (and pin schoolYear too)
        if (week.match(/^[0-9a-fA-F]{24}$/)) {
            filter.week = week;
            // Defense in depth: confirm the supplied week belongs to the
            // resolved school year, otherwise the result set is empty.
            const weekDoc = await Week.findById(week).select('schoolYear');
            if (weekDoc && resolvedSchoolYear &&
                weekDoc.schoolYear.toString() !== resolvedSchoolYear.toString()) {
                return res.status(200).json({ success: true, count: 0, data: [] });
            }
        } else {
            // Otherwise treat `week` as weekNumber. We MUST scope by schoolYear
            // to avoid resolving to a week from a different year (which is the
            // root cause of the "no data" / "đã tồn tại" mismatch).
            if (!resolvedSchoolYear) {
                // No schoolYear context at all → return empty rather than
                // picking an arbitrary week.
                return res.status(200).json({ success: true, count: 0, data: [] });
            }
            const weekObj = await Week.findOne({
                weekNumber: parseInt(week),
                schoolYear: resolvedSchoolYear,
            });
            if (weekObj) {
                filter.week = weekObj._id;
            } else {
                return res.status(200).json({ success: true, count: 0, data: [] });
            }
        }
    }

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

    // Look up the week's schoolYear so we can disambiguate. The (class, week)
    // pair is unique only within a single school year, since `week` ObjectId
    // is per-school-year. Without this, requests for a week from a different
    // school year would either return the wrong record or 404 unpredictably.
    const weekDoc = await Week.findById(weekId).select('schoolYear');
    if (!weekDoc) {
      return res.status(404).json({
        success: false,
        message: 'Tuần không tìm thấy',
      });
    }

    const academicGrading = await ClassAcademicGrading.findOne({
      class: classId,
      week: weekId,
      schoolYear: weekDoc.schoolYear,
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
    // Resolve schoolYear from the week, then check (class, schoolYear, week)
    // uniqueness. Looking up by (class, week) alone collides across years.
    const weekDoc = await Week.findById(req.body.week).select('schoolYear');
    if (!weekDoc) {
      return res.status(404).json({
        success: false,
        message: 'Tuần không tìm thấy',
      });
    }
    const resolvedSchoolYear =
      req.body.schoolYear || weekDoc.schoolYear;

    const existing = await ClassAcademicGrading.findOne({
      class: req.body.class,
      schoolYear: resolvedSchoolYear,
      week: req.body.week,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu chấm điểm cho lớp và tuần này đã tồn tại',
      });
    }

    // Ensure schoolYear is set on the body so the unique index agrees
    req.body.schoolYear = resolvedSchoolYear;

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
    // H1: Race condition — duplicate key error from unique index
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu chấm điểm cho lớp và tuần này đã tồn tại',
      });
    }
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

    // Check if already exists — scope by (class, schoolYear, week) so that
    // records from previous school years do not block creation in the
    // current one. The (class, week) tuple alone is ambiguous across years
    // because `week` ObjectId is regenerated each year.
    const weekDoc = await Week.findById(week);
    if (!weekDoc) {
      return res.status(404).json({
        success: false,
        message: 'Tuần không tìm thấy',
      });
    }
    const existing = await ClassAcademicGrading.findOne({
      class: classId,
      schoolYear: weekDoc.schoolYear,
      week,
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu chấm điểm cho lớp và tuần này đã tồn tại',
        data: existing,
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
    // H1: Race condition — duplicate key error from unique index
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu chấm điểm cho lớp và tuần này đã tồn tại',
      });
    }
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

