const mongoose = require('mongoose');

const schoolYearSchema = new mongoose.Schema(
  {
    // Năm học (ví dụ: 2025-2026)
    year: {
      type: String,
      required: [true, 'Năm học là bắt buộc'],
      unique: true,
      match: [/^\d{4}-\d{4}$/, 'Năm học phải có định dạng YYYY-YYYY'],
    },

    // Ngày bắt đầu năm học
    startDate: {
      type: Date,
      required: [true, 'Ngày bắt đầu là bắt buộc'],
    },

    // Ngày kết thúc năm học
    endDate: {
      type: Date,
      required: [true, 'Ngày kết thúc là bắt buộc'],
    },

    // Trạng thái năm học (hoạt động, kết thúc, v.v.)
    status: {
      type: String,
      enum: {
        values: ['Hoạt động', 'Kết thúc', 'Tạm dừng'],
        message: 'Trạng thái phải là: Hoạt động, Kết thúc, hoặc Tạm dừng',
      },
      default: 'Hoạt động',
    },

    // Cấu hình hệ số điểm tiết học
    academicScoringCoefficients: {
      // Điểm cho tiết học tốt
      excellent: {
        type: Number,
        default: 20,
        min: 0,
      },
      // Điểm cho tiết học khá
      good: {
        type: Number,
        default: 10,
        min: 0,
      },
      // Điểm cho tiết học trung bình
      average: {
        type: Number,
        default: 0,
      },
      // Điểm cho tiết học yếu
      poor: {
        type: Number,
        default: -10,
        max: 0,
      },
      // Điểm cho tiết học kém
      failing: {
        type: Number,
        default: -20,
        max: 0,
      },
    },

    // Cấu hình thưởng
    bonusConfiguration: {
      // Thưởng cho ngày học tốt (không có tiết yếu/kém)
      goodDayBonus: {
        type: Number,
        default: 20,
        min: 0,
      },
      // Thưởng cho tuần học tốt
      goodWeekBonus: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Cấu hình ngưỡng xếp loại
    classificationThresholds: {
      // Cờ đỏ (Red Flag - Excellent)
      redFlag: {
        type: Number,
        default: 100,
        min: 0,
      },
      // Cờ xanh lá (Green Flag - Good)
      greenFlag: {
        type: Number,
        default: 80,
        min: 0,
      },
      // Cờ vàng (Yellow Flag - Fair)
      yellowFlag: {
        type: Number,
        default: 60,
        min: 0,
      },
      // Không xếp cờ (No Flag - Below threshold)
      noFlag: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    // Cấu hình nề nếp (conduct)
    conductConfiguration: {
      // Điểm tối đa cho mỗi mục nề nếp
      maxPointsPerItem: {
        type: Number,
        default: 5,
        min: 1,
      },
      // Số ngày áp dụng trong tuần
      daysPerWeek: {
        type: Number,
        default: 5,
        min: 1,
        max: 7,
      },
      // Danh sách các mục nề nếp
      items: [
        {
          name: {
            type: String,
            required: true,
          },
          // Các ngày áp dụng (2=Thứ 2, 3=Thứ 3, 4=Thứ 4, 5=Thứ 5)
          applicableDays: [
            {
              type: Number,
              min: 2,
              max: 5,
            },
          ],
          // Thứ tự hiển thị
          order: Number,
        },
      ],
    },

    // Cấu hình tuần học
    weekConfiguration: {
      // Ngày bắt đầu tuần (2=Thứ 2, 3=Thứ 3, ...)
      weekStartDay: {
        type: Number,
        default: 2,
        min: 1,
        max: 7,
      },
      // Ngày kết thúc tuần
      weekEndDay: {
        type: Number,
        default: 6,
        min: 1,
        max: 7,
      },
    },

    // Người tạo cấu hình
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
schoolYearSchema.index({ year: 1 });
schoolYearSchema.index({ status: 1 });
schoolYearSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('SchoolYear', schoolYearSchema);

