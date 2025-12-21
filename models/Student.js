const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    // Mã học sinh (MSSV)
    studentId: {
      type: String,
      required: [true, 'Mã học sinh là bắt buộc'],
      unique: true,
      trim: true,
    },

    // Họ và tên
    fullName: {
      type: String,
      required: [true, 'Họ và tên là bắt buộc'],
      trim: true,
    },

    // Giới tính
    gender: {
      type: String,
      enum: {
        values: ['Nam', 'Nữ', 'Khác'],
        message: 'Giới tính phải là: Nam, Nữ, hoặc Khác',
      },
    },

    // Ngày sinh
    dateOfBirth: Date,

    // Lớp hiện tại
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Lớp là bắt buộc'],
    },

    // Năm học
    schoolYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolYear',
      required: [true, 'Năm học là bắt buộc'],
    },

    // Địa chỉ
    address: String,

    // Số điện thoại liên hệ
    phone: String,

    // Email
    email: {
      type: String,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email không hợp lệ'],
    },

    // Tên phụ huynh
    parentName: String,

    // Số điện thoại phụ huynh
    parentPhone: String,

    // Trạng thái học sinh
    status: {
      type: String,
      enum: {
        values: ['Đang học', 'Bỏ học', 'Chuyển lớp', 'Tốt nghiệp'],
        message: 'Trạng thái phải là: Đang học, Bỏ học, Chuyển lớp, hoặc Tốt nghiệp',
      },
      default: 'Đang học',
    },

    // Lớp trưởng
    isClassLeader: {
      type: Boolean,
      default: false,
    },

    // Lớp phó
    isViceClassLeader: {
      type: Boolean,
      default: false,
    },

    // Ghi chú
    notes: String,

    // Người tạo
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Người cập nhật cuối cùng
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Index cho tìm kiếm nhanh
studentSchema.index({ studentId: 1 });
studentSchema.index({ fullName: 1 });
studentSchema.index({ class: 1 });
studentSchema.index({ schoolYear: 1 });
studentSchema.index({ status: 1 });
studentSchema.index({ class: 1, schoolYear: 1 });

module.exports = mongoose.model('Student', studentSchema);

