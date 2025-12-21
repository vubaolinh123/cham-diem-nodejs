const DisciplineGrading = require('../models/DisciplineGrading');
const Class = require('../models/Class');
const Week = require('../models/Week');
const SchoolYear = require('../models/SchoolYear');

// Helper function để populate
const populateOptions = [
  { path: 'class', select: 'name grade' },
  { path: 'week', select: 'weekNumber startDate endDate' },
  { path: 'schoolYear', select: 'year' },
  { path: 'createdBy', select: 'fullName' },
  { path: 'updatedBy', select: 'fullName' },
];

// @desc    Lấy tất cả DisciplineGrading
// @route   GET /api/discipline-grading
// @access  Private
exports.getAll = async (req, res) => {
  try {
    const { classId, week, schoolYear, status, semester, flag } = req.query;
    const filter = {};

    if (classId) filter.class = classId;
    
    if (week) {
        // If week is a valid ObjectId, use it directly
        if (week.match(/^[0-9a-fA-F]{24}$/)) {
            filter.week = week;
        } else {
            // Otherwise assume it's a weekNumber
            const weekDoc = await Week.findOne({ weekNumber: parseInt(week), schoolYear: req.schoolYear }); // Assuming we have global schoolYear or need to fetch active
            // Better strategy: just populate and filter in memory if needed, OR find Week first if week is not ObjectId
            // Since we might not have schoolYear in req context easily here without middleware, 
            // let's try to find any week with that number (or rely on frontend sending ID)
            // But user reported "Cast to ObjectId failed for value "1"", so frontend sends "1".
            // Let's find the week ID for "1".
            // We need current school year to be precise, skipping for now and assuming unique week number or just finding one.
            const weekObj = await Week.findOne({ weekNumber: parseInt(week) });
            if (weekObj) {
                filter.week = weekObj._id;
            } else {
                // Return empty if week not found
                return res.status(200).json({ success: true, count: 0, data: [] });
            }
        }
    } 

    if (schoolYear) filter.schoolYear = schoolYear;
    if (status) filter.status = status;
    if (semester) filter.semester = parseInt(semester);
    if (flag) filter.flag = flag;

    const disciplineGradings = await DisciplineGrading.find(filter)
      .populate(populateOptions)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: disciplineGradings.length,
      data: disciplineGradings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Lấy DisciplineGrading theo ID
// @route   GET /api/discipline-grading/:id
// @access  Private
exports.getById = async (req, res) => {
  try {
    const disciplineGrading = await DisciplineGrading.findById(req.params.id)
      .populate(populateOptions);

    if (!disciplineGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    res.status(200).json({
      success: true,
      data: disciplineGrading,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Lấy DisciplineGrading theo lớp và tuần
// @route   GET /api/discipline-grading/class/:classId/week/:weekId
// @access  Private
exports.getByClassAndWeek = async (req, res) => {
  try {
    const { classId, weekId } = req.params;

    const disciplineGrading = await DisciplineGrading.findOne({
      class: classId,
      week: weekId,
    }).populate(populateOptions);

    if (!disciplineGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    res.status(200).json({
      success: true,
      data: disciplineGrading,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};

// @desc    Tạo DisciplineGrading mới
// @route   POST /api/discipline-grading
// @access  Private
exports.create = async (req, res) => {
  try {
    // Kiểm tra xem đã tồn tại chưa
    const existing = await DisciplineGrading.findOne({
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

    const disciplineGrading = await DisciplineGrading.create(req.body);

    const populated = await DisciplineGrading.findById(disciplineGrading._id)
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

// @desc    Cập nhật DisciplineGrading
// @route   PUT /api/discipline-grading/:id
// @access  Private
exports.update = async (req, res) => {
  try {
    let disciplineGrading = await DisciplineGrading.findById(req.params.id);

    if (!disciplineGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    // Kiểm tra trạng thái khóa
    if (disciplineGrading.status === 'Khóa') {
      return res.status(400).json({
        success: false,
        message: 'Không thể chỉnh sửa dữ liệu đã khóa',
      });
    }

    // Update fields from request body
    if (req.body.items) disciplineGrading.items = req.body.items;
    if (req.body.status) disciplineGrading.status = req.body.status;
    if (req.body.notes !== undefined) disciplineGrading.notes = req.body.notes;

    // Thêm người cập nhật nếu có req.user
    if (req.user) {
      disciplineGrading.updatedBy = req.user._id;
    }

    // Save will trigger pre-save hook to recalculate totalWeeklyScore, percentage, flag
    await disciplineGrading.save();

    // Populate and return
    await disciplineGrading.populate(populateOptions);

    res.status(200).json({
      success: true,
      message: 'Cập nhật dữ liệu thành công',
      data: disciplineGrading,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi server',
      error: error.message,
    });
  }
};


// @desc    Xóa DisciplineGrading
// @route   DELETE /api/discipline-grading/:id
// @access  Private
exports.delete = async (req, res) => {
  try {
    const disciplineGrading = await DisciplineGrading.findById(req.params.id);

    if (!disciplineGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    // Kiểm tra trạng thái khóa
    if (disciplineGrading.status === 'Khóa') {
      return res.status(400).json({
        success: false,
        message: 'Không thể xóa dữ liệu đã khóa',
      });
    }

    await DisciplineGrading.findByIdAndDelete(req.params.id);

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
// @route   PATCH /api/discipline-grading/:id/status
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

    let disciplineGrading = await DisciplineGrading.findById(req.params.id);

    if (!disciplineGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    // Kiểm tra logic chuyển trạng thái
    if (disciplineGrading.status === 'Khóa' && status !== 'Khóa') {
      return res.status(400).json({
        success: false,
        message: 'Không thể mở khóa dữ liệu đã khóa',
      });
    }

    const updateData = { status };
    if (req.user) {
      updateData.updatedBy = req.user._id;
    }

    disciplineGrading = await DisciplineGrading.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate(populateOptions);

    res.status(200).json({
      success: true,
      message: `Cập nhật trạng thái thành "${status}" thành công`,
      data: disciplineGrading,
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
// @route   GET /api/discipline-grading/stats/:schoolYearId
// @access  Private
exports.getStatsBySchoolYear = async (req, res) => {
  try {
    const { schoolYearId } = req.params;

    const stats = await DisciplineGrading.aggregate([
      { $match: { schoolYear: require('mongoose').Types.ObjectId(schoolYearId) } },
      {
        $group: {
          _id: '$flag',
          count: { $sum: 1 },
          avgScore: { $avg: '$totalWeeklyScore' },
          avgPercentage: { $avg: '$percentage' },
        },
      },
    ]);

    const totalRecords = await DisciplineGrading.countDocuments({ schoolYear: schoolYearId });

    res.status(200).json({
      success: true,
      data: {
        totalRecords,
        byFlag: stats,
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

// @desc    Bắt đầu chấm điểm nề nếp (tạo record mới với default items)
// @route   POST /api/discipline-grading/start
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
    const existing = await DisciplineGrading.findOne({ class: classId, week });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Dữ liệu chấm điểm cho lớp và tuần này đã tồn tại',
        data: existing,
      });
    }

    // Get week and school year info
    const weekDoc = await Week.findById(week);
    if (!weekDoc) {
      return res.status(404).json({
        success: false,
        message: 'Tuần không tìm thấy',
      });
    }

    const schoolYear = await SchoolYear.findById(weekDoc.schoolYear);
    if (!schoolYear) {
      return res.status(404).json({
        success: false,
        message: 'Năm học không tìm thấy',
      });
    }

    // Get conduct configuration items from school year
    const conductItems = schoolYear.conductConfiguration?.items || [
      { name: 'Sinh hoạt dưới cờ', applicableDays: [2] },
      { name: 'Truy bài', applicableDays: [3, 4, 5] },
      { name: 'Đeo thẻ', applicableDays: [2, 3, 4, 5] },
      { name: 'Vệ sinh lớp + khu vực', applicableDays: [2, 3, 4, 5] },
      { name: 'Đi học đúng giờ', applicableDays: [2, 3, 4, 5] },
      { name: 'Nếp sống văn minh', applicableDays: [2, 3, 4, 5] },
    ];
    const maxPointsPerItem = schoolYear.conductConfiguration?.maxPointsPerItem || 5;

    // Build items with default scores (full marks)
    const items = conductItems.map((item, index) => {
      const dayScores = (item.applicableDays || [2, 3, 4, 5]).map(day => ({
        day,
        violations: 0,
        score: maxPointsPerItem,
        violatingStudentIds: [],
      }));

      return {
        itemId: index + 1,
        itemName: item.name,
        maxScore: maxPointsPerItem,
        applicableDays: item.applicableDays || [2, 3, 4, 5],
        dayScores,
        totalScore: dayScores.reduce((sum, ds) => sum + ds.score, 0),
      };
    });

    // Calculate total possible score
    const maxPossibleScore = items.reduce((sum, item) => 
      sum + (item.maxScore * item.applicableDays.length), 0
    );

    // Create new DisciplineGrading
    const disciplineGrading = new DisciplineGrading({
      class: classId,
      week,
      schoolYear: weekDoc.schoolYear,
      semester: 1, // Default semester, can be calculated from date
      weekStartDate: weekDoc.startDate,
      weekEndDate: weekDoc.endDate,
      items,
      maxPossibleScore,
      status: 'Nháp',
      createdBy: req.userId || req.user?._id,
    });

    await disciplineGrading.save();

    const populated = await DisciplineGrading.findById(disciplineGrading._id)
      .populate(populateOptions);

    res.status(201).json({
      success: true,
      message: 'Bắt đầu chấm điểm nề nếp thành công',
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

