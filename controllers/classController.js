const Class = require('../models/Class');
const Student = require('../models/Student');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy tất cả lớp
 * @route GET /api/classes
 * @access Authenticated
 */
const getAllClasses = async (req, res, next) => {
  try {
    const { schoolYear, grade, status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (schoolYear) filter.schoolYear = schoolYear;
    if (grade) filter.grade = parseInt(grade);
    if (status) filter.status = status;

    const limitNumber = parseInt(limit);
    let classes;
    let total;

    if (limit === '0') {
      classes = await Class.find(filter)
        .populate('schoolYear', 'year')
        .populate('homeRoomTeacher', 'fullName email')
        .populate('classLeader', 'fullName email')
        .populate('viceClassLeader', 'fullName email')
        .sort({ grade: 1, name: 1 });
      total = classes.length;
    } else {
      const skip = (page - 1) * limitNumber;
      classes = await Class.find(filter)
        .populate('schoolYear', 'year')
        .populate('homeRoomTeacher', 'fullName email')
        .populate('classLeader', 'fullName email')
        .populate('viceClassLeader', 'fullName email')
        .skip(skip)
        .limit(limitNumber)
        .sort({ grade: 1, name: 1 });
      total = await Class.countDocuments(filter);
    }

    return sendResponse(res, 200, true, 'Lấy danh sách lớp thành công', {
      classes,
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
 * Lấy lớp theo ID
 * @route GET /api/classes/:id
 * @access Authenticated
 */
const getClassById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const classData = await Class.findById(id)
      .populate('schoolYear', 'year')
      .populate('homeRoomTeacher', 'fullName email')
      .populate('classLeader', 'fullName email')
      .populate('viceClassLeader', 'fullName email')
      .populate('students', 'studentId fullName gender');

    if (!classData) {
      return sendError(res, 404, 'Lớp không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin lớp thành công', {
      class: classData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo lớp mới
 * @route POST /api/classes
 * @access Admin
 */
const createClass = async (req, res, next) => {
  try {
    const {
      name,
      schoolYear,
      grade,
      homeRoomTeacher,
      classLeader,
      viceClassLeader,
      notes,
    } = req.body;

    // Kiểm tra lớp đã tồn tại
    const existingClass = await Class.findOne({ name, schoolYear });
    if (existingClass) {
      return sendError(res, 400, 'Lớp này đã tồn tại trong năm học này');
    }

    // Kiểm tra grade hợp lệ
    if (![10, 11, 12].includes(grade)) {
      return sendError(res, 400, 'Khối lớp phải là 10, 11 hoặc 12');
    }

    const classData = new Class({
      name,
      schoolYear,
      grade,
      homeRoomTeacher,
      classLeader,
      viceClassLeader,
      notes,
      createdBy: req.userId,
    });

    await classData.save();
    await classData.populate([
      { path: 'schoolYear', select: 'year' },
      { path: 'homeRoomTeacher', select: 'fullName email' },
      { path: 'classLeader', select: 'fullName email' },
      { path: 'viceClassLeader', select: 'fullName email' },
    ]);

    return sendResponse(res, 201, true, 'Tạo lớp thành công', {
      class: classData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật lớp
 * @route PUT /api/classes/:id
 * @access Admin
 */
const updateClass = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      grade,
      homeRoomTeacher,
      classLeader,
      viceClassLeader,
      status,
      notes,
    } = req.body;

    const classData = await Class.findById(id);

    if (!classData) {
      return sendError(res, 404, 'Lớp không tìm thấy');
    }

    if (name) classData.name = name;
    if (grade) {
      if (![10, 11, 12].includes(grade)) {
        return sendError(res, 400, 'Khối lớp phải là 10, 11 hoặc 12');
      }
      classData.grade = grade;
    }
    if (homeRoomTeacher) classData.homeRoomTeacher = homeRoomTeacher;
    if (classLeader) classData.classLeader = classLeader;
    if (viceClassLeader) classData.viceClassLeader = viceClassLeader;
    if (status) classData.status = status;
    if (notes) classData.notes = notes;

    classData.updatedBy = req.userId;
    await classData.save();
    await classData.populate([
      { path: 'schoolYear', select: 'year' },
      { path: 'homeRoomTeacher', select: 'fullName email' },
      { path: 'classLeader', select: 'fullName email' },
      { path: 'viceClassLeader', select: 'fullName email' },
    ]);

    return sendResponse(res, 200, true, 'Cập nhật lớp thành công', {
      class: classData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xem trước dữ liệu sẽ bị xóa khi xóa lớp
 * @route GET /api/classes/:id/delete-preview
 * @access Admin
 */
const getDeletePreview = async (req, res, next) => {
  try {
    const { id } = req.params;

    const classData = await Class.findById(id).populate('schoolYear', 'year');
    if (!classData) {
      return sendError(res, 404, 'Lớp không tìm thấy');
    }

    // Count all related data
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');
    const ViolationLog = require('../models/ViolationLog');
    const WeeklySummary = require('../models/WeeklySummary');
    const ConductScore = require('../models/ConductScore');
    const AcademicScore = require('../models/AcademicScore');

    const [
      studentsCount,
      disciplineGradingsCount,
      academicGradingsCount,
      violationsCount,
      weeklySummariesCount,
      conductScoresCount,
      academicScoresCount,
    ] = await Promise.all([
      Student.countDocuments({ class: id }),
      DisciplineGrading.countDocuments({ class: id }),
      ClassAcademicGrading.countDocuments({ class: id }),
      ViolationLog.countDocuments({ class: id }),
      WeeklySummary.countDocuments({ class: id }),
      ConductScore.countDocuments({ class: id }),
      AcademicScore.countDocuments({ class: id }),
    ]);

    const total = studentsCount + disciplineGradingsCount + academicGradingsCount + 
                  violationsCount + weeklySummariesCount + conductScoresCount + academicScoresCount;

    return sendResponse(res, 200, true, 'Lấy thông tin xóa thành công', {
      item: {
        _id: classData._id,
        name: classData.name,
        grade: classData.grade,
        schoolYear: classData.schoolYear?.year,
      },
      willDelete: {
        students: studentsCount,
        disciplineGradings: disciplineGradingsCount,
        academicGradings: academicGradingsCount,
        violations: violationsCount,
        weeklySummaries: weeklySummariesCount,
        conductScores: conductScoresCount,
        academicScores: academicScoresCount,
        total,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa lớp và tất cả dữ liệu liên quan
 * @route DELETE /api/classes/:id
 * @access Admin
 */
const deleteClass = async (req, res, next) => {
  try {
    const { id } = req.params;

    const classData = await Class.findById(id).populate('schoolYear', 'year');
    if (!classData) {
      return sendError(res, 404, 'Lớp không tìm thấy');
    }

    // Import related models
    const DisciplineGrading = require('../models/DisciplineGrading');
    const ClassAcademicGrading = require('../models/ClassAcademicGrading');
    const ViolationLog = require('../models/ViolationLog');
    const WeeklySummary = require('../models/WeeklySummary');
    const ConductScore = require('../models/ConductScore');
    const AcademicScore = require('../models/AcademicScore');

    // Delete all related data and get counts
    const [
      studentsResult,
      disciplineResult,
      academicResult,
      violationsResult,
      summariesResult,
      conductResult,
      academicScoreResult,
    ] = await Promise.all([
      Student.deleteMany({ class: id }),
      DisciplineGrading.deleteMany({ class: id }),
      ClassAcademicGrading.deleteMany({ class: id }),
      ViolationLog.deleteMany({ class: id }),
      WeeklySummary.deleteMany({ class: id }),
      ConductScore.deleteMany({ class: id }),
      AcademicScore.deleteMany({ class: id }),
    ]);

    // Delete the class itself
    await Class.findByIdAndDelete(id);

    const deleted = {
      class: {
        _id: classData._id,
        name: classData.name,
        grade: classData.grade,
        schoolYear: classData.schoolYear?.year,
      },
      students: studentsResult.deletedCount,
      disciplineGradings: disciplineResult.deletedCount,
      academicGradings: academicResult.deletedCount,
      violations: violationsResult.deletedCount,
      weeklySummaries: summariesResult.deletedCount,
      conductScores: conductResult.deletedCount,
      academicScores: academicScoreResult.deletedCount,
      total: studentsResult.deletedCount + disciplineResult.deletedCount + 
             academicResult.deletedCount + violationsResult.deletedCount + 
             summariesResult.deletedCount + conductResult.deletedCount + 
             academicScoreResult.deletedCount,
    };

    return sendResponse(res, 200, true, 'Xóa lớp và dữ liệu liên quan thành công', { deleted });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy danh sách học sinh của lớp
 * @route GET /api/classes/:id/students
 * @access Authenticated
 */
const getClassStudents = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, page = 1, limit = 50 } = req.query;

    const classData = await Class.findById(id);

    if (!classData) {
      return sendError(res, 404, 'Lớp không tìm thấy');
    }

    const filter = { class: id };
    if (status) filter.status = status;

    const skip = (page - 1) * limit;

    const students = await Student.find(filter)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ fullName: 1 });

    const total = await Student.countDocuments(filter);

    return sendResponse(res, 200, true, 'Lấy danh sách học sinh thành công', {
      students,
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

module.exports = {
  getAllClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  getClassStudents,
  getDeletePreview,
};


