const mongoose = require('mongoose');

const conductScoreSchema = new mongoose.Schema(
  {
    // Tuần học
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Week',
      required: [true, 'Tuần học là bắt buộc'],
    },

    // Lớp
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Lớp là bắt buộc'],
    },

    // Ngày chấm điểm (Thứ 2 - Thứ 6)
    date: {
      type: Date,
      required: [true, 'Ngày chấm điểm là bắt buộc'],
    },

    // Thứ trong tuần (2=Thứ 2, 3=Thứ 3, ..., 6=Thứ 6)
    dayOfWeek: {
      type: Number,
      required: true,
      min: 2,
      max: 6,
    },

    // Danh sách các mục nề nếp được chấm
    items: [
      {
        // Tên mục nề nếp (ví dụ: Sinh hoạt dưới cờ, Truy bài, Đeo thẻ, v.v.)
        itemName: {
          type: String,
          required: true,
        },

        // Số lỗi được ghi nhận
        violationCount: {
          type: Number,
          default: 0,
          min: 0,
        },

        // Điểm tính được (5 - violationCount, tối thiểu 0)
        score: {
          type: Number,
          default: 5,
          min: 0,
        },

        // Danh sách học sinh vi phạm mục này
        violatingStudents: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student',
          },
        ],

        // Thứ tự mục
        order: Number,
      },
    ],

    // Tổng điểm nề nếp trong ngày
    totalDailyScore: {
      type: Number,
      default: 0,
    },

    // Người chấm điểm (Cờ đỏ trực tuần)
    scoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Trạng thái chấm điểm
    status: {
      type: String,
      enum: {
        values: ['Nháp', 'Hoàn thành', 'Duyệt', 'Khóa'],
        message: 'Trạng thái phải là: Nháp, Hoàn thành, Duyệt, hoặc Khóa',
      },
      default: 'Nháp',
    },

    // Ghi chú
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Index cho tìm kiếm nhanh
conductScoreSchema.index({ week: 1, class: 1, date: 1 }, { unique: true });
conductScoreSchema.index({ week: 1, class: 1 });
conductScoreSchema.index({ date: 1 });
conductScoreSchema.index({ class: 1 });
conductScoreSchema.index({ status: 1 });
conductScoreSchema.index({ scoredBy: 1 });

module.exports = mongoose.model('ConductScore', conductScoreSchema);

