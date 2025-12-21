const mongoose = require('mongoose');

const weekSchema = new mongoose.Schema(
  {
    // Năm học liên kết
    schoolYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolYear',
      required: [true, 'Năm học là bắt buộc'],
    },

    // Số tuần trong năm học (1, 2, 3, ...)
    weekNumber: {
      type: Number,
      required: [true, 'Số tuần là bắt buộc'],
      min: 1,
    },

    // Ngày bắt đầu tuần (Thứ 2)
    startDate: {
      type: Date,
      required: [true, 'Ngày bắt đầu là bắt buộc'],
    },

    // Ngày kết thúc tuần (Thứ 6)
    endDate: {
      type: Date,
      required: [true, 'Ngày kết thúc là bắt buộc'],
    },

    // Trạng thái tuần
    status: {
      type: String,
      enum: {
        values: ['Nháp', 'Duyệt', 'Khóa'],
        message: 'Trạng thái phải là: Nháp, Duyệt, hoặc Khóa',
      },
      default: 'Nháp',
    },

    // Người duyệt tuần (GVCN hoặc Phó đoàn)
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Ngày duyệt
    approvedDate: Date,

    // Người khóa tuần (Bí thư/Phó bí thư)
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Ngày khóa
    lockedDate: Date,

    // Ghi chú khi duyệt
    approvalNotes: String,

    // Ghi chú khi khóa
    lockNotes: String,

    // Danh sách các lớp được phép chấm điểm cho tuần này
    // Ví dụ: Lớp 10A chấm cho lớp 11A, 11B
    assignedClasses: [
      {
        // Lớp chấm điểm (Cờ đỏ trực tuần)
        scoringClass: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Class',
        },
        // Lớp được chấm điểm
        targetClasses: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Class',
          },
        ],
      },
    ],

    // Tổng hợp dữ liệu tuần (được tính toán tự động)
    summary: {
      // Tổng số lỗi trong tuần
      totalViolations: {
        type: Number,
        default: 0,
      },
      // Số lớp hoàn thành chấm điểm
      completedClasses: {
        type: Number,
        default: 0,
      },
      // Số lớp chưa hoàn thành
      pendingClasses: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index cho tìm kiếm nhanh
weekSchema.index({ schoolYear: 1, weekNumber: 1 }, { unique: true });
weekSchema.index({ startDate: 1, endDate: 1 });
weekSchema.index({ status: 1 });
weekSchema.index({ schoolYear: 1, status: 1 });

module.exports = mongoose.model('Week', weekSchema);

