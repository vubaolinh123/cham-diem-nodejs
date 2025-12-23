const Student = require('../models/Student');
const Class = require('../models/Class');
const { sendResponse, sendError } = require('../utils/helpers');

/**
 * Lấy tất cả học sinh
 * @route GET /api/students
 * @access Authenticated
 */
const getAllStudents = async (req, res, next) => {
  try {
    const { class: classId, classId: classIdParam, schoolYear, status, search, page = 1, limit = 50 } = req.query;
    const finalClassId = classId || classIdParam;

    const filter = {};
    if (finalClassId) filter.class = finalClassId;
    if (schoolYear) filter.schoolYear = schoolYear;
    if (status) filter.status = status;

    // Tìm kiếm theo tên hoặc mã học sinh
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const students = await Student.find(filter)
      .populate('class', 'name grade')
      .populate('schoolYear', 'year')
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

/**
 * Lấy học sinh theo ID
 * @route GET /api/students/:id
 * @access Authenticated
 */
const getStudentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id)
      .populate('class', 'name grade')
      .populate('schoolYear', 'year')
      .populate('createdBy', 'fullName email');

    if (!student) {
      return sendError(res, 404, 'Học sinh không tìm thấy');
    }

    return sendResponse(res, 200, true, 'Lấy thông tin học sinh thành công', {
      student,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo học sinh mới
 * @route POST /api/students
 * @access Admin
 */
const createStudent = async (req, res, next) => {
  try {
    const {
      studentId,
      fullName,
      gender,
      dateOfBirth,
      class: classId,
      schoolYear,
      address,
      phone,
      email,
      parentName,
      parentPhone,
      notes,
    } = req.body;

    // Kiểm tra mã học sinh đã tồn tại
    const existingStudent = await Student.findOne({ studentId });
    if (existingStudent) {
      return sendError(res, 400, 'Mã học sinh này đã tồn tại');
    }

    // Kiểm tra lớp tồn tại
    if (classId) {
      const classData = await Class.findById(classId);
      if (!classData) {
        return sendError(res, 400, 'Lớp không tìm thấy');
      }
    }

    const student = new Student({
      studentId,
      fullName,
      gender,
      dateOfBirth,
      class: classId,
      schoolYear,
      address,
      phone,
      email,
      parentName,
      parentPhone,
      notes,
      createdBy: req.userId,
    });

    await student.save();

    // Update studentCount in Class
    if (classId) {
      await Class.findByIdAndUpdate(classId, { $inc: { studentCount: 1 } });
    }

    await student.populate([
      { path: 'class', select: 'name grade' },
      { path: 'schoolYear', select: 'year' },
    ]);

    return sendResponse(res, 201, true, 'Tạo học sinh thành công', {
      student,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật học sinh
 * @route PUT /api/students/:id
 * @access Admin
 */
const updateStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      fullName,
      gender,
      dateOfBirth,
      class: classId,
      address,
      phone,
      email,
      parentName,
      parentPhone,
      status,
      notes,
    } = req.body;

    const student = await Student.findById(id);

    if (!student) {
      return sendError(res, 404, 'Học sinh không tìm thấy');
    }

    if (fullName) student.fullName = fullName;
    if (gender) student.gender = gender;
    if (dateOfBirth) student.dateOfBirth = dateOfBirth;
    if (classId) {
      const classData = await Class.findById(classId);
      if (!classData) {
        return sendError(res, 400, 'Lớp không tìm thấy');
      }
      student.class = classId;
    }
    if (address) student.address = address;
    if (phone) student.phone = phone;
    if (email) student.email = email;
    if (parentName) student.parentName = parentName;
    if (parentPhone) student.parentPhone = parentPhone;
    if (status) student.status = status;
    if (notes) student.notes = notes;

    student.updatedBy = req.userId;
    await student.save();
    await student.populate([
      { path: 'class', select: 'name grade' },
      { path: 'schoolYear', select: 'year' },
    ]);

    return sendResponse(res, 200, true, 'Cập nhật học sinh thành công', {
      student,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xem trước dữ liệu sẽ bị xóa khi xóa học sinh
 * @route GET /api/students/:id/delete-preview
 * @access Admin
 */
const getDeletePreview = async (req, res, next) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id).populate('class', 'name grade');
    if (!student) {
      return sendError(res, 404, 'Học sinh không tìm thấy');
    }

    // Import related models
    const ViolationLog = require('../models/ViolationLog');
    const DisciplineGrading = require('../models/DisciplineGrading');

    // Count related data
    const [violationsCount, disciplineGradingsWithStudent] = await Promise.all([
      ViolationLog.countDocuments({ student: id }),
      // Count how many discipline grading records have this student in violatingStudentIds
      DisciplineGrading.countDocuments({ 'items.dayScores.violatingStudentIds': id }),
    ]);

    const total = violationsCount + disciplineGradingsWithStudent;

    return sendResponse(res, 200, true, 'Lấy thông tin xóa thành công', {
      item: {
        _id: student._id,
        studentId: student.studentId,
        fullName: student.fullName,
        className: student.class?.name,
      },
      willDelete: {
        violations: violationsCount,
        disciplineRecords: disciplineGradingsWithStudent,
        total,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa học sinh và dữ liệu liên quan
 * @route DELETE /api/students/:id
 * @access Admin
 */
const deleteStudent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id).populate('class', 'name grade');
    if (!student) {
      return sendError(res, 404, 'Học sinh không tìm thấy');
    }

    const classId = student.class?._id || student.class;

    // Import related models
    const ViolationLog = require('../models/ViolationLog');
    const DisciplineGrading = require('../models/DisciplineGrading');

    // Delete violations
    const violationsResult = await ViolationLog.deleteMany({ student: id });

    // Remove student from discipline grading violatingStudentIds
    const disciplineResult = await DisciplineGrading.updateMany(
      { 'items.dayScores.violatingStudentIds': id },
      { $pull: { 'items.$[].dayScores.$[].violatingStudentIds': id } }
    );

    // Delete the student
    await Student.findByIdAndDelete(id);

    // Update studentCount in Class
    if (classId) {
      await Class.findByIdAndUpdate(classId, { $inc: { studentCount: -1 } });
    }

    const deleted = {
      student: {
        _id: student._id,
        studentId: student.studentId,
        fullName: student.fullName,
        className: student.class?.name,
      },
      violations: violationsResult.deletedCount,
      disciplineRecordsUpdated: disciplineResult.modifiedCount,
      total: violationsResult.deletedCount + disciplineResult.modifiedCount,
    };

    return sendResponse(res, 200, true, 'Xóa học sinh và dữ liệu liên quan thành công', { deleted });
  } catch (error) {
    next(error);
  }
};

/**
 * Xem trước dữ liệu sẽ bị xóa khi xóa nhiều học sinh
 * @route POST /api/students/bulk-delete-preview
 * @access Admin
 */
const getBulkDeletePreview = async (req, res, next) => {
  try {
    const { studentIds } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return sendError(res, 400, 'Danh sách học sinh không hợp lệ');
    }

    // Get students info
    const students = await Student.find({ _id: { $in: studentIds } })
      .populate('class', 'name grade');

    // Import related models
    const ViolationLog = require('../models/ViolationLog');
    const DisciplineGrading = require('../models/DisciplineGrading');

    // Count related data
    const [violationsCount, disciplineGradingsCount] = await Promise.all([
      ViolationLog.countDocuments({ student: { $in: studentIds } }),
      DisciplineGrading.countDocuments({ 'items.dayScores.violatingStudentIds': { $in: studentIds } }),
    ]);

    const total = violationsCount + disciplineGradingsCount;

    return sendResponse(res, 200, true, 'Lấy thông tin xóa thành công', {
      students: students.map(s => ({
        _id: s._id,
        studentId: s.studentId,
        fullName: s.fullName,
        className: s.class?.name,
      })),
      willDelete: {
        students: students.length,
        violations: violationsCount,
        disciplineRecords: disciplineGradingsCount,
        total: students.length + total,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa nhiều học sinh cùng lúc
 * @route DELETE /api/students/bulk
 * @access Admin
 */
const bulkDeleteStudents = async (req, res, next) => {
  try {
    const { studentIds } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return sendError(res, 400, 'Danh sách học sinh không hợp lệ');
    }

    // Get students to find their classes
    const students = await Student.find({ _id: { $in: studentIds } })
      .populate('class', 'name grade');

    // Group by class for updating studentCount
    const classCounts = {};
    students.forEach(s => {
      const classId = s.class?._id?.toString() || s.class?.toString();
      if (classId) {
        classCounts[classId] = (classCounts[classId] || 0) + 1;
      }
    });

    // Import related models
    const ViolationLog = require('../models/ViolationLog');
    const DisciplineGrading = require('../models/DisciplineGrading');

    // Delete violations
    const violationsResult = await ViolationLog.deleteMany({ student: { $in: studentIds } });

    // Remove students from discipline grading violatingStudentIds
    const disciplineResult = await DisciplineGrading.updateMany(
      { 'items.dayScores.violatingStudentIds': { $in: studentIds } },
      { $pullAll: { 'items.$[].dayScores.$[].violatingStudentIds': studentIds } }
    );

    // Delete the students
    const studentsResult = await Student.deleteMany({ _id: { $in: studentIds } });

    // Update studentCount in each affected class
    for (const [classId, count] of Object.entries(classCounts)) {
      await Class.findByIdAndUpdate(classId, { $inc: { studentCount: -count } });
    }

    const deleted = {
      students: studentsResult.deletedCount,
      violations: violationsResult.deletedCount,
      disciplineRecordsUpdated: disciplineResult.modifiedCount,
      classesUpdated: Object.keys(classCounts).length,
      total: studentsResult.deletedCount + violationsResult.deletedCount + disciplineResult.modifiedCount,
    };

    return sendResponse(res, 200, true, 'Xóa học sinh và dữ liệu liên quan thành công', { deleted });
  } catch (error) {
    next(error);
  }
};

/**
 * Import nhiều học sinh cùng lúc (Bulk Import)
 * @route POST /api/students/bulk
 * @access Admin
 * @description Thêm nhiều học sinh cùng lúc, trả về danh sách lỗi chi tiết cho từng học sinh nếu có
 */
const bulkCreateStudents = async (req, res, next) => {
  try {
    const { students } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return sendError(res, 400, 'Vui lòng cung cấp danh sách học sinh');
    }

    const results = {
      success: [],
      errors: [],
    };

    // Helper function to translate field names
    const translateFieldName = (field) => {
      const fieldMap = {
        'studentId': 'mã học sinh',
        'fullName': 'họ và tên',
        'dateOfBirth': 'ngày sinh',
        'gender': 'giới tính',
        'class': 'lớp',
        'schoolYear': 'năm học',
        'email': 'email',
        'phone': 'số điện thoại',
        'address': 'địa chỉ',
        'parentName': 'tên phụ huynh',
        'parentPhone': 'số điện thoại phụ huynh',
        'status': 'trạng thái',
      };
      return fieldMap[field] || field;
    };

    // Helper function to translate error message
    const translateError = (err, studentIdentifier) => {
      if (err.name === 'ValidationError') {
        const messages = Object.entries(err.errors).map(([field, e]) => {
          if (e.name === 'CastError') {
            const fieldName = translateFieldName(e.path);
            if (e.kind === 'date' || e.kind === 'Date') {
              return `${fieldName}: Định dạng không hợp lệ. Giá trị "${e.value}" không phải là ngày hợp lệ (định dạng đúng: YYYY-MM-DD)`;
            }
            if (e.kind === 'ObjectId') {
              return `${fieldName}: Không hợp lệ hoặc không tồn tại`;
            }
            return `${fieldName}: Giá trị không hợp lệ`;
          }
          return e.message;
        });
        return messages;
      }
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        return [`${translateFieldName(field)}: Đã tồn tại trong hệ thống`];
      }
      return [err.message || 'Lỗi không xác định'];
    };

    // Process each student individually
    for (let i = 0; i < students.length; i++) {
      const studentData = students[i];
      const studentIdentifier = studentData.studentId || studentData.fullName || `Học sinh thứ ${i + 1}`;

      try {
        // Validate required fields manually first
        const manualErrors = [];
        if (!studentData.studentId || !studentData.studentId.trim()) {
          manualErrors.push('Mã học sinh là bắt buộc');
        }
        if (!studentData.fullName || !studentData.fullName.trim()) {
          manualErrors.push('Họ và tên là bắt buộc');
        }
        if (!studentData.class) {
          manualErrors.push('Lớp là bắt buộc');
        }
        if (!studentData.schoolYear) {
          manualErrors.push('Năm học là bắt buộc');
        }

        if (manualErrors.length > 0) {
          results.errors.push({
            studentId: studentData.studentId || '',
            fullName: studentData.fullName || '',
            index: i + 1,
            errors: manualErrors,
          });
          continue;
        }

        // Check if studentId already exists
        const existingStudent = await Student.findOne({ studentId: studentData.studentId });
        if (existingStudent) {
          results.errors.push({
            studentId: studentData.studentId,
            fullName: studentData.fullName,
            index: i + 1,
            errors: ['Mã học sinh đã tồn tại trong hệ thống'],
          });
          continue;
        }

        // Check if class exists
        const classData = await Class.findById(studentData.class);
        if (!classData) {
          results.errors.push({
            studentId: studentData.studentId,
            fullName: studentData.fullName,
            index: i + 1,
            errors: ['Lớp không tồn tại trong hệ thống'],
          });
          continue;
        }

        // Create student
        const student = new Student({
          studentId: studentData.studentId,
          fullName: studentData.fullName,
          gender: studentData.gender,
          dateOfBirth: studentData.dateOfBirth,
          class: studentData.class,
          schoolYear: studentData.schoolYear,
          address: studentData.address,
          phone: studentData.phone,
          email: studentData.email,
          parentName: studentData.parentName,
          parentPhone: studentData.parentPhone,
          notes: studentData.notes,
          createdBy: req.userId,
        });

        await student.save();

        // Update studentCount in Class
        await Class.findByIdAndUpdate(studentData.class, { $inc: { studentCount: 1 } });

        results.success.push({
          studentId: studentData.studentId,
          fullName: studentData.fullName,
          _id: student._id,
        });

      } catch (err) {
        const errorMessages = translateError(err, studentIdentifier);
        results.errors.push({
          studentId: studentData.studentId || '',
          fullName: studentData.fullName || '',
          index: i + 1,
          errors: errorMessages,
        });
      }
    }

    // Determine response status and message
    const totalStudents = students.length;
    const successCount = results.success.length;
    const errorCount = results.errors.length;

    let message;
    let statusCode;

    if (errorCount === 0) {
      message = `Thêm thành công ${successCount} học sinh`;
      statusCode = 201;
    } else if (successCount === 0) {
      message = `Thêm học sinh thất bại. ${errorCount} học sinh có lỗi`;
      statusCode = 400;
    } else {
      message = `Thêm thành công ${successCount}/${totalStudents} học sinh. ${errorCount} học sinh có lỗi`;
      statusCode = 207; // Multi-Status
    }

    return res.status(statusCode).json({
      success: errorCount === 0,
      message,
      data: {
        total: totalStudents,
        successCount,
        errorCount,
        successStudents: results.success,
        errorStudents: results.errors,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkCreateStudents,
  getDeletePreview,
  getBulkDeletePreview,
  bulkDeleteStudents,
};


