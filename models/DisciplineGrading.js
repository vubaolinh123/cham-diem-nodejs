const mongoose = require('mongoose');

const disciplineGradingSchema = new mongoose.Schema(
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

    // Danh sách các mục nề nếp
    items: [
      {
        // ID mục nề nếp
        itemId: {
          type: Number,
          required: true,
        },

        // Tên mục nề nếp
        itemName: {
          type: String,
          required: true,
        },

        // Điểm tối đa cho mỗi ngày
        maxScore: {
          type: Number,
          default: 5,
        },

        // Các ngày áp dụng (2=Thứ 2, 3=Thứ 3, 4=Thứ 4, 5=Thứ 5)
        applicableDays: [
          {
            type: Number,
            min: 2,
            max: 5,
          },
        ],

        // Điểm theo từng ngày
        dayScores: [
          {
            // Thứ trong tuần
            day: {
              type: Number,
              min: 2,
              max: 5,
              required: true,
            },

            // Số lần vi phạm
            violations: {
              type: Number,
              default: 0,
              min: 0,
            },

            // Điểm (5 - violations, tối thiểu 0)
            score: {
              type: Number,
              default: 5,
              min: 0,
            },

            // Danh sách học sinh vi phạm
            violatingStudentIds: [
              {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Student',
              },
            ],
          },
        ],

        // Tổng điểm của mục trong tuần
        totalScore: {
          type: Number,
          default: 0,
        },
      },
    ],

    // Tổng điểm nề nếp trong tuần
    totalWeeklyScore: {
      type: Number,
      default: 0,
    },

    // Điểm tối đa có thể đạt được
    maxPossibleScore: {
      type: Number,
      default: 100,
    },

    // Phần trăm đạt được
    percentage: {
      type: Number,
      default: 0,
    },

    // Xếp cờ
    flag: {
      type: String,
      enum: {
        values: ['Cờ đỏ', 'Cờ xanh', 'Cờ vàng', 'Không xếp cờ'],
        message: 'Cờ phải là: Cờ đỏ, Cờ xanh, Cờ vàng, hoặc Không xếp cờ',
      },
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
disciplineGradingSchema.pre('save', function (next) {
  // Tính tổng điểm cho mỗi item
  this.items.forEach((item) => {
    item.totalScore = item.dayScores.reduce((sum, ds) => sum + ds.score, 0);
  });

  // Tính tổng điểm tuần
  this.totalWeeklyScore = this.items.reduce((sum, item) => sum + item.totalScore, 0);

  // Tính phần trăm
  if (this.maxPossibleScore > 0) {
    this.percentage = Math.round((this.totalWeeklyScore / this.maxPossibleScore) * 100);
  }

  // Xếp cờ dựa trên phần trăm
  if (this.percentage >= 90) {
    this.flag = 'Cờ đỏ';
  } else if (this.percentage >= 70) {
    this.flag = 'Cờ xanh';
  } else if (this.percentage >= 50) {
    this.flag = 'Cờ vàng';
  } else {
    this.flag = 'Không xếp cờ';
  }

  next();
});

// Method tính điểm tối đa có thể đạt được
disciplineGradingSchema.methods.calculateMaxPossibleScore = function () {
  let total = 0;
  this.items.forEach((item) => {
    total += item.maxScore * item.applicableDays.length;
  });
  return total;
};

// Index cho tìm kiếm nhanh
disciplineGradingSchema.index({ class: 1, week: 1 }, { unique: true });
disciplineGradingSchema.index({ schoolYear: 1 });
disciplineGradingSchema.index({ week: 1 });
disciplineGradingSchema.index({ status: 1 });
disciplineGradingSchema.index({ flag: 1 });
disciplineGradingSchema.index({ schoolYear: 1, week: 1 });

module.exports = mongoose.model('DisciplineGrading', disciplineGradingSchema);
