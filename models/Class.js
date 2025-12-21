const mongoose = require('mongoose');

const classSchema = new mongoose.Schema(
  {
    // Tên lớp (ví dụ: 10A, 11B, 12C)
    name: {
      type: String,
      required: [true, 'Tên lớp là bắt buộc'],
      trim: true,
    },

    // Năm học
    schoolYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolYear',
      required: [true, 'Năm học là bắt buộc'],
    },

    // Khối lớp (10, 11, 12)
    grade: {
      type: Number,
      required: [true, 'Khối lớp là bắt buộc'],
      min: 10,
      max: 12,
    },

    // Giáo viên chủ nhiệm (GVCN)
    homeRoomTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Phó đoàn/Bí thư lớp (có quyền khóa tuần)
    classLeader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Phó bí thư lớp
    viceClassLeader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Danh sách học sinh trong lớp
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
      },
    ],

    // Số lượng học sinh
    studentCount: {
      type: Number,
      default: 0,
    },

    // Phòng học
    classroom: String,

    // Sức chứa lớp
    capacity: {
      type: Number,
      min: 1,
    },

    // Trạng thái lớp
    status: {
      type: String,
      enum: {
        values: ['Hoạt động', 'Tạm dừng', 'Kết thúc'],
        message: 'Trạng thái phải là: Hoạt động, Tạm dừng, hoặc Kết thúc',
      },
      default: 'Hoạt động',
    },

    // Mô tả lớp
    description: String,

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

    // Ghi chú
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Index cho tìm kiếm nhanh
classSchema.index({ name: 1, schoolYear: 1 }, { unique: true });
classSchema.index({ schoolYear: 1 });
classSchema.index({ grade: 1 });
classSchema.index({ homeRoomTeacher: 1 });
classSchema.index({ status: 1 });

module.exports = mongoose.model('Class', classSchema);

