const mongoose = require('mongoose');

const academicScoreSchema = new mongoose.Schema(
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

    // Ngày chấm điểm
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

    // Danh sách các tiết học trong ngày
    lessons: [
      {
        // Số tiết (1, 2, 3, ...)
        lessonNumber: {
          type: Number,
          required: true,
          min: 1,
        },

        // Chất lượng tiết học
        quality: {
          type: String,
          enum: {
            values: ['Tốt', 'Khá', 'Trung bình', 'Yếu', 'Kém'],
            message: 'Chất lượng phải là: Tốt, Khá, Trung bình, Yếu, hoặc Kém',
          },
          required: true,
        },

        // Điểm tương ứng với chất lượng
        points: {
          type: Number,
          required: true,
        },

        // Ghi chú cho tiết học
        notes: String,
      },
    ],

    // Thống kê số tiết theo chất lượng
    lessonStatistics: {
      // Số tiết tốt
      excellent: {
        type: Number,
        default: 0,
      },
      // Số tiết khá
      good: {
        type: Number,
        default: 0,
      },
      // Số tiết trung bình
      average: {
        type: Number,
        default: 0,
      },
      // Số tiết yếu
      poor: {
        type: Number,
        default: 0,
      },
      // Số tiết kém
      failing: {
        type: Number,
        default: 0,
      },
      // Tổng số tiết
      totalLessons: {
        type: Number,
        default: 0,
      },
    },

    // Tính toán điểm học tập
    academicCalculation: {
      // Điểm từ tiết tốt (số tiết × 20)
      excellentPoints: {
        type: Number,
        default: 0,
      },
      // Điểm từ tiết khá (số tiết × 10)
      goodPoints: {
        type: Number,
        default: 0,
      },
      // Điểm từ tiết yếu (số tiết × -10)
      poorPoints: {
        type: Number,
        default: 0,
      },
      // Điểm từ tiết kém (số tiết × -20)
      failingPoints: {
        type: Number,
        default: 0,
      },
      // Tổng điểm trước thưởng
      subtotal: {
        type: Number,
        default: 0,
      },
      // Thưởng ngày học tốt (nếu không có tiết yếu/kém)
      goodDayBonus: {
        type: Number,
        default: 0,
      },
      // Tổng điểm sau thưởng
      totalDailyScore: {
        type: Number,
        default: 0,
      },
    },

    // Trạng thái ngày học tốt (không có tiết yếu/kém)
    isGoodDay: {
      type: Boolean,
      default: false,
    },

    // Người chấm điểm
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
academicScoreSchema.index({ week: 1, class: 1, date: 1 }, { unique: true });
academicScoreSchema.index({ week: 1, class: 1 });
academicScoreSchema.index({ date: 1 });
academicScoreSchema.index({ class: 1 });
academicScoreSchema.index({ status: 1 });
academicScoreSchema.index({ scoredBy: 1 });

module.exports = mongoose.model('AcademicScore', academicScoreSchema);

