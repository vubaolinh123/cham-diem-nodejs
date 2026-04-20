const DisciplineGrading = require('../models/DisciplineGrading');
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

    let disciplineGrading = await DisciplineGrading.findOne({
      class: classId,
      week: weekId,
    }).populate(populateOptions);

    if (!disciplineGrading) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy dữ liệu',
      });
    }

    // Auto-fix: ensure day 6 (Thứ 6) is present in applicableDays and dayScores
    // for items that should apply on all weekdays (legacy data may lack day 6)
    const maxPointsPerItem = disciplineGrading.maxPointsPerItem || disciplineGrading.items?.[0]?.maxScore || 5;
    let needsSave = false;
    
    if (disciplineGrading.items && Array.isArray(disciplineGrading.items)) {
      for (const item of disciplineGrading.items) {
        // Skip Monday-only items like "Sinh hoạt dưới cờ"
        const isMondayOnly = item.applicableDays?.length === 1 && item.applicableDays.includes(2);
        
        if (!isMondayOnly && item.applicableDays && !item.applicableDays.includes(6)) {
          // Add day 6 to applicableDays
          item.applicableDays.push(6);
          item.applicableDays.sort((a, b) => a - b);
          
          // Add day 6 to dayScores with full marks
          const day6Exists = item.dayScores?.some(ds => ds.day === 6);
          if (!day6Exists) {
            if (!item.dayScores) item.dayScores = [];
            item.dayScores.push({
              day: 6,
              violations: 0,
              score: item.maxScore || maxPointsPerItem,
              violatingStudentIds: [],
            });
            item.dayScores.sort((a, b) => a.day - b.day);
          }
          
          // Recalculate totalScore
          item.totalScore = item.dayScores.reduce((sum, ds) => sum + (ds.score || 0), 0);
          needsSave = true;
        }
      }
    }
    
    if (needsSave) {
      await disciplineGrading.save();
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

    // Auto-update WeeklySummary
    await updateWeeklySummary(disciplineGrading.week, disciplineGrading.class, req.user?._id);

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
    let rawConductItems = [];
    if (schoolYear.conductConfiguration && schoolYear.conductConfiguration.items && schoolYear.conductConfiguration.items.length > 0) {
      // Ensure we have plain objects, not Mongoose documents
      rawConductItems = schoolYear.conductConfiguration.items.map(item => 
        typeof item.toObject === 'function' ? item.toObject() : item
      );
    } else {
      rawConductItems = [
        { name: 'Sinh hoạt dưới cờ', applicableDays: [2] },
        { name: 'Truy bài', applicableDays: [3, 4, 5, 6] },
        { name: 'Đeo thẻ', applicableDays: [2, 3, 4, 5, 6] },
        { name: 'Vệ sinh lớp + khu vực', applicableDays: [2, 3, 4, 5, 6] },
        { name: 'Đi học đúng giờ', applicableDays: [2, 3, 4, 5, 6] },
        { name: 'Nếp sống văn minh', applicableDays: [2, 3, 4, 5, 6] },
      ];
    }
    
    // Support Monday through Friday (day 2-6)
    // Auto-fix: ensure day 6 (Thứ 6) is included for items that should apply on all weekdays
    const daysPerWeek = schoolYear.conductConfiguration?.daysPerWeek || 5;
    const allWeekdays = [2, 3, 4, 5, 6]; // Mon-Fri
    const allDaysIncludingSat = [2, 3, 4, 5, 6]; // Currently Mon-Fri only
    
    const conductItems = rawConductItems.map(item => {
      let days = (item.applicableDays || allWeekdays).filter(day => day >= 2 && day <= 6);
      
      // Auto-fix legacy data: if daysPerWeek >= 5 and item has days 2-5 but missing day 6,
      // add day 6 (except for "Sinh hoạt dưới cờ" which is only on Monday)
      if (daysPerWeek >= 5 && days.length >= 4 && !days.includes(6)) {
        // Only add day 6 if this isn't "Sinh hoạt dưới cờ" (Monday-only item)
        const isMondayOnly = days.length === 1 && days.includes(2);
        if (!isMondayOnly) {
          days.push(6);
          days.sort();
        }
      }
      
      // Ensure at least all weekdays are present for items that apply on all days
      if (days.length === 0) {
        days = allWeekdays;
      }
      
      return {
        ...item,
        applicableDays: days,
      };
    });
    
    const maxPointsPerItem = schoolYear.conductConfiguration?.maxPointsPerItem || 5;

    // Build items with default scores (full marks)
    const items = conductItems.map((item, index) => {
      const validDays = item.applicableDays.length > 0 ? item.applicableDays : [2, 3, 4, 5, 6];
      const dayScores = validDays.map(day => ({
        day,
        violations: 0,
        score: maxPointsPerItem,
        violatingStudentIds: [],
      }));

      return {
        itemId: index + 1,
        itemName: item.name,
        maxScore: maxPointsPerItem,
        applicableDays: validDays,
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

// @desc    Sync student violations from conduct grading to ViolationLog
// @route   POST /api/discipline-grading/:id/sync-violations
// @access  Private
exports.syncViolations = async (req, res) => {
  try {
    const ViolationLog = require('../models/ViolationLog');
    const ViolationType = require('../models/ViolationType');
    
    const disciplineGrading = await DisciplineGrading.findById(req.params.id);
    if (!disciplineGrading) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy dữ liệu' });
    }

    const { itemId, day, studentIds, violationTypeName, description, evidence } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách học sinh là bắt buộc' });
    }

    // Find or use violation type
    let violationTypeDoc = await ViolationType.findOne({ name: violationTypeName });
    if (!violationTypeDoc) {
      // Use first active violation type as fallback
      violationTypeDoc = await ViolationType.findOne({ isActive: true });
    }
    if (!violationTypeDoc) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy loại vi phạm' });
    }

    // Calculate the date for this day of week within the grading week
    const weekStart = new Date(disciplineGrading.weekStartDate);
    const dayOffset = day - 2; // day 2 (Monday) = offset 0
    const violationDate = new Date(weekStart);
    violationDate.setDate(violationDate.getDate() + dayOffset);

    const createdViolations = [];
    const skippedDuplicates = [];

    // Compute start/end of day once (outside loop)
    const startOfDay = new Date(violationDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(violationDate);
    endOfDay.setHours(23, 59, 59, 999);

    for (const studentId of studentIds) {
      // Atomic upsert: find existing or create new — race-safe
      const filter = {
        student: studentId,
        class: disciplineGrading.class,
        week: disciplineGrading.week,
        violationType: violationTypeDoc._id,
        date: { $gte: startOfDay, $lte: endOfDay },
        source: 'conduct_grading',
      };

      const result = await ViolationLog.findOneAndUpdate(
        filter,
        {
          $setOnInsert: {
            student: studentId,
            class: disciplineGrading.class,
            week: disciplineGrading.week,
            violationType: violationTypeDoc._id,
            date: violationDate,
            description: description || `Vi phạm ${violationTypeName} - ${itemId ? 'Mục ' + itemId : ''}`,
            reportedBy: req.userId || req.user?._id,
            status: 'Chờ duyệt',
            severity: violationTypeDoc.severity || 'Nhẹ',
            category: 'Nề nếp',
            source: 'conduct_grading',
            ...(evidence && evidence.length > 0 ? { evidence } : {}),
          },
        },
        { upsert: true, new: true, rawResult: true }
      );

      if (result.lastErrorObject?.updatedExisting) {
        skippedDuplicates.push(studentId);
      } else {
        createdViolations.push(result.value);
      }
    }

    // Auto-update WeeklySummary
    await updateWeeklySummary(disciplineGrading.week, disciplineGrading.class, req.userId || req.user?._id);

    res.status(201).json({
      success: true,
      message: `Đã tạo ${createdViolations.length} vi phạm, bỏ qua ${skippedDuplicates.length} trùng lặp`,
      data: {
        created: createdViolations.length,
        skipped: skippedDuplicates.length,
        violations: createdViolations,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

// @desc    Remove student violations synced from conduct grading
// @route   DELETE /api/discipline-grading/:id/sync-violations
// @access  Private
exports.removeSyncedViolations = async (req, res) => {
  try {
    const ViolationLog = require('../models/ViolationLog');
    
    const disciplineGrading = await DisciplineGrading.findById(req.params.id);
    if (!disciplineGrading) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy dữ liệu' });
    }

    const { studentIds, day, violationTypeName } = req.body;
    
    if (!studentIds || !Array.isArray(studentIds)) {
      return res.status(400).json({ success: false, message: 'Danh sách học sinh là bắt buộc' });
    }

    // Calculate the date for this day of week
    const weekStart = new Date(disciplineGrading.weekStartDate);
    const dayOffset = day - 2;
    const violationDate = new Date(weekStart);
    violationDate.setDate(violationDate.getDate() + dayOffset);
    
    const startOfDay = new Date(violationDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(violationDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Find violation type if specified
    const ViolationType = require('../models/ViolationType');
    let filter = {
      student: { $in: studentIds },
      class: disciplineGrading.class,
      week: disciplineGrading.week,
      date: { $gte: startOfDay, $lte: endOfDay },
    };

    if (violationTypeName) {
      const vType = await ViolationType.findOne({ name: violationTypeName });
      if (vType) filter.violationType = vType._id;
    }

    const result = await ViolationLog.deleteMany(filter);

    // Auto-update WeeklySummary
    await updateWeeklySummary(disciplineGrading.week, disciplineGrading.class, req.userId || req.user?._id);

    res.status(200).json({
      success: true,
      message: `Đã xóa ${result.deletedCount} vi phạm`,
      data: { deleted: result.deletedCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
  }
};

