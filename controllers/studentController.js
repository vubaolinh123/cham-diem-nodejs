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
 * Xóa học sinh
 * @route DELETE /api/students/:id
 * @access Admin
 */
const deleteStudent = async (req, res, next) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id);

    if (!student) {
      return sendError(res, 404, 'Học sinh không tìm thấy');
    }

    const classId = student.class;

    await Student.findByIdAndDelete(id);

    // Update studentCount in Class
    if (classId) {
      await Class.findByIdAndUpdate(classId, { $inc: { studentCount: -1 } });
    }

    return sendResponse(res, 200, true, 'Xóa học sinh thành công');
  } catch (error) {
    next(error);
  }
};

/**
 * Import học sinh từ Excel
 * @route POST /api/students/import
 * @access Admin
 * @description Nhập danh sách học sinh từ file Excel
 */
const importStudents = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'Vui lòng chọn file Excel');
    }

    // TODO: Implement Excel parsing logic
    // Sử dụng thư viện xlsx để đọc file
    // Validate dữ liệu
    // Bulk insert vào database

    return sendResponse(res, 200, true, 'Import học sinh thành công', {
      message: 'Chức năng import sẽ được triển khai',
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
  importStudents,
};

