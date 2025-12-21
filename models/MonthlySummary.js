const mongoose = require('mongoose');

const monthlySummarySchema = new mongoose.Schema(
  {
    // Năm học
    schoolYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolYear',
      required: [true, 'Năm học là bắt buộc'],
    },

    // Tháng (1-12)
    month: {
      type: Number,
      required: [true, 'Tháng là bắt buộc'],
      min: 1,
      max: 12,
    },

    // Năm (ví dụ: 2025)
    year: {
      type: Number,
      required: [true, 'Năm là bắt buộc'],
    },

    // Lớp
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Lớp là bắt buộc'],
    },

    // Danh sách các tuần trong tháng
    weeks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Week',
      },
    ],

    // Điểm nề nếp
    conductScores: {
      // Tổng điểm nề nếp trong tháng
      total: {
        type: Number,
        default: 0,
      },
      // Điểm trung bình mỗi tuần
      average: {
        type: Number,
        default: 0,
      },
      // Chi tiết từng tuần
      byWeek: [
        {
          week: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Week',
          },
          score: Number,
        },
      ],
    },

    // Điểm học tập
    academicScores: {
      // Tổng điểm học tập trong tháng
      total: {
        type: Number,
        default: 0,
      },
      // Điểm trung bình mỗi tuần
      average: {
        type: Number,
        default: 0,
      },
      // Số ngày học tốt
      goodDays: {
        type: Number,
        default: 0,
      },
      // Chi tiết từng tuần
      byWeek: [
        {
          week: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Week',
          },
          score: Number,
          goodDays: Number,
        },
      ],
    },

    // Thưởng
    bonuses: {
      // Tổng thưởng trong tháng
      total: {
        type: Number,
        default: 0,
      },
      // Chi tiết từng tuần
      byWeek: [
        {
          week: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Week',
          },
          bonus: Number,
        },
      ],
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
          violations: [
            {
              type: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'ViolationType',
              },
              count: Number,
            },
          ],
        },
      ],
    },

    // Xếp loại lớp
    classification: {
      // Cờ xếp được
      flag: {
        type: String,
        enum: {
          values: ['Cờ đỏ', 'Cờ xanh', 'Cờ vàng', 'Không xếp cờ'],
          message: 'Cờ phải là: Cờ đỏ, Cờ xanh, Cờ vàng, hoặc Không xếp cờ',
        },
      },
      // Tổng điểm
      totalScore: {
        type: Number,
        default: 0,
      },
      // Xếp hạng trong khối
      ranking: Number,
    },

    // Danh sách danh dự (học sinh xuất sắc)
    honorRoll: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Student',
        },
        reason: String,
      },
    ],

    // Danh sách phê bình (học sinh cần cải thiện)
    criticalList: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Student',
        },
        reason: String,
        violationCount: Number,
      },
    ],

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
monthlySummarySchema.index({ schoolYear: 1, month: 1, year: 1, class: 1 }, { unique: true });
monthlySummarySchema.index({ schoolYear: 1, month: 1, year: 1 });
monthlySummarySchema.index({ class: 1 });
monthlySummarySchema.index({ status: 1 });
monthlySummarySchema.index({ 'classification.flag': 1 });

module.exports = mongoose.model('MonthlySummary', monthlySummarySchema);

