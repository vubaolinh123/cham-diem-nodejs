const mongoose = require('mongoose');

const weeklySummarySchema = new mongoose.Schema(
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

    // Điểm nề nếp
    conductScores: {
      // Tổng điểm nề nếp trong tuần
      total: {
        type: Number,
        default: 0,
      },
      // Điểm trung bình mỗi ngày
      average: {
        type: Number,
        default: 0,
      },
      // Chi tiết từng ngày
      byDay: [
        {
          date: Date,
          dayOfWeek: Number,
          score: Number,
        },
      ],
      // Chi tiết từng mục
      byItem: [
        {
          itemName: String,
          totalScore: Number,
          maxScore: Number,
          percentage: Number,
        },
      ],
    },

    // Điểm học tập
    academicScores: {
      // Tổng điểm học tập trong tuần
      total: {
        type: Number,
        default: 0,
      },
      // Điểm trung bình mỗi ngày
      average: {
        type: Number,
        default: 0,
      },
      // Số ngày học tốt
      goodDays: {
        type: Number,
        default: 0,
      },
      // Chi tiết từng ngày
      byDay: [
        {
          date: Date,
          dayOfWeek: Number,
          score: Number,
          isGoodDay: Boolean,
        },
      ],
      // Thống kê tiết học
      lessonStatistics: {
        excellent: Number,
        good: Number,
        average: Number,
        poor: Number,
        failing: Number,
        total: Number,
      },
    },

    // Thưởng
    bonuses: {
      // Thưởng ngày học tốt
      goodDayBonus: {
        type: Number,
        default: 0,
      },
      // Thưởng tuần học tốt
      goodWeekBonus: {
        type: Number,
        default: 0,
      },
      // Tổng thưởng
      total: {
        type: Number,
        default: 0,
      },
    },

    // Vi phạm
    violations: {
      // Tổng số vi phạm
      total: {
        type: Number,
        default: 0,
      },
      // Vi phạm đã duyệt
      approved: {
        type: Number,
        default: 0,
      },
      // Vi phạm chờ duyệt
      pending: {
        type: Number,
        default: 0,
      },
      // Chi tiết theo loại vi phạm
      byType: [
        {
          violationType: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ViolationType',
          },
          count: Number,
          severity: String,
        },
      ],
      // Học sinh vi phạm nhiều nhất
      topViolators: [
        {
          student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Student',
          },
          count: Number,
        },
      ],
    },

    // Xếp loại lớp
    classification: {
      // Cờ xếp được (Cờ đỏ, Cờ xanh, Cờ vàng, Không xếp cờ)
      flag: {
        type: String,
        enum: {
          values: ['Cờ đỏ', 'Cờ xanh', 'Cờ vàng', 'Không xếp cờ'],
          message: 'Cờ phải là: Cờ đỏ, Cờ xanh, Cờ vàng, hoặc Không xếp cờ',
        },
      },
      // Tổng điểm (nề nếp + học tập + thưởng)
      totalScore: {
        type: Number,
        default: 0,
      },
      // Xếp hạng trong khối
      ranking: Number,
    },

    // Trạng thái tổng hợp
    status: {
      type: String,
      enum: {
        values: ['Nháp', 'Hoàn thành', 'Duyệt', 'Khóa'],
        message: 'Trạng thái phải là: Nháp, Hoàn thành, Duyệt, hoặc Khóa',
      },
      default: 'Nháp',
    },

    // Người tạo tổng hợp
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Người duyệt
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Ngày duyệt
    approvedDate: Date,

    // Ghi chú
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Index cho tìm kiếm nhanh
weeklySummarySchema.index({ week: 1, class: 1 }, { unique: true });
weeklySummarySchema.index({ week: 1 });
weeklySummarySchema.index({ class: 1 });
weeklySummarySchema.index({ status: 1 });
weeklySummarySchema.index({ 'classification.flag': 1 });

module.exports = mongoose.model('WeeklySummary', weeklySummarySchema);

