const mongoose = require('mongoose');

const classAcademicGradingSchema = new mongoose.Schema(
  {
    // Lớp
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Lớp là bắt buộc'],
    },

    // Tuần học
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Week',
      required: [true, 'Tuần học là bắt buộc'],
    },

    // Năm học
    schoolYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolYear',
      required: [true, 'Năm học là bắt buộc'],
    },

    // Học kỳ
    semester: {
      type: Number,
      enum: [1, 2],
      required: [true, 'Học kỳ là bắt buộc'],
    },

    // Ngày bắt đầu tuần
    weekStartDate: {
      type: Date,
      required: true,
    },

    // Ngày kết thúc tuần
    weekEndDate: {
      type: Date,
      required: true,
    },

    // Điểm theo từng ngày
    dayGradings: [
      {
        // Thứ trong tuần (2=Thứ 2, ..., 6=Thứ 6)
        day: {
          type: Number,
          min: 2,
          max: 6,
          required: true,
        },

        // Số tiết học Tốt
        excellent: {
          type: Number,
          default: 0,
          min: 0,
        },

        // Số tiết học Khá
        good: {
          type: Number,
          default: 0,
          min: 0,
        },

        // Số tiết học Trung bình
        average: {
          type: Number,
          default: 0,
          min: 0,
        },

        // Số tiết học Yếu
        poor: {
          type: Number,
          default: 0,
          min: 0,
        },

        // Số tiết học Kém
        bad: {
          type: Number,
          default: 0,
          min: 0,
        },

        // Tổng số tiết trong ngày
        totalPeriods: {
          type: Number,
          default: 0,
        },

        // Điểm tiết trong ngày: 20*Tốt + 10*Khá + 0*TB - 10*Yếu - 20*Kém
        dailyScore: {
          type: Number,
          default: 0,
        },

        // Ngày học tốt = tất cả tiết đều xếp loại Tốt
        isGoodDay: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Tổng số tiết trong tuần
    totalWeeklyPeriods: {
      type: Number,
      default: 0,
    },

    // Tổng điểm tiết trong tuần (chưa chia)
    totalWeeklyScore: {
      type: Number,
      default: 0,
    },

    // Điểm tiết trung bình = totalWeeklyScore / totalWeeklyPeriods
    averageScore: {
      type: Number,
      default: 0,
    },

    // Số ngày học tốt
    goodDayCount: {
      type: Number,
      default: 0,
    },

    // Tuần học tốt = tất cả tiết trong tuần đều xếp loại Tốt
    isGoodWeek: {
      type: Boolean,
      default: false,
    },

    // Thưởng tuần tốt: 80 điểm nếu đạt
    goodWeekBonus: {
      type: Number,
      default: 0,
    },

    // Thưởng ngày tốt: số ngày tốt × 20; 0 nếu tuần tốt
    goodDayBonus: {
      type: Number,
      default: 0,
    },

    // Điểm cuối cùng = averageScore + goodWeekBonus + goodDayBonus
    finalWeeklyScore: {
      type: Number,
      default: 0,
    },

    // Trạng thái
    status: {
      type: String,
      enum: {
        values: ['Nháp', 'Đã duyệt', 'Khóa'],
        message: 'Trạng thái phải là: Nháp, Đã duyệt, hoặc Khóa',
      },
      default: 'Nháp',
    },

    // Người tạo
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Người cập nhật
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

// Pre-save hook để tính toán điểm
classAcademicGradingSchema.pre('save', function (next) {
  // Tính cho mỗi ngày
  this.dayGradings.forEach((day) => {
    // Tổng số tiết
    day.totalPeriods = day.excellent + day.good + day.average + day.poor + day.bad;

    // Điểm tiết: 20*Tốt + 10*Khá + 0*TB - 10*Yếu - 20*Kém
    day.dailyScore = 20 * day.excellent + 10 * day.good + 0 * day.average - 10 * day.poor - 20 * day.bad;

    // Ngày học tốt = tất cả tiết đều xếp loại Tốt
    day.isGoodDay = day.totalPeriods > 0 && day.excellent === day.totalPeriods;
  });

  // Tổng số tiết trong tuần
  this.totalWeeklyPeriods = this.dayGradings.reduce((sum, d) => sum + d.totalPeriods, 0);

  // Tổng điểm tiết trong tuần
  this.totalWeeklyScore = this.dayGradings.reduce((sum, d) => sum + d.dailyScore, 0);

  // Điểm trung bình
  this.averageScore = this.totalWeeklyPeriods > 0 
    ? this.totalWeeklyScore / this.totalWeeklyPeriods 
    : 0;

  // Số ngày tốt
  this.goodDayCount = this.dayGradings.filter((d) => d.isGoodDay).length;

  // Tuần tốt = tất cả ngày có tiết đều là ngày tốt
  const daysWithPeriods = this.dayGradings.filter((d) => d.totalPeriods > 0);
  this.isGoodWeek = daysWithPeriods.length > 0 && daysWithPeriods.every((d) => d.isGoodDay);

  // Thưởng tuần tốt: 80 điểm nếu đạt
  this.goodWeekBonus = this.isGoodWeek ? 80 : 0;

  // Thưởng ngày tốt: nếu tuần tốt thì = 0, ngược lại = số ngày tốt × 20
  this.goodDayBonus = this.isGoodWeek ? 0 : this.goodDayCount * 20;

  // Điểm cuối cùng
  this.finalWeeklyScore = this.averageScore + this.goodWeekBonus + this.goodDayBonus;

  next();
});

// Index cho tìm kiếm nhanh
classAcademicGradingSchema.index({ class: 1, week: 1 }, { unique: true });
classAcademicGradingSchema.index({ schoolYear: 1 });
classAcademicGradingSchema.index({ week: 1 });
classAcademicGradingSchema.index({ status: 1 });
classAcademicGradingSchema.index({ schoolYear: 1, week: 1 });

module.exports = mongoose.model('ClassAcademicGrading', classAcademicGradingSchema);
