const mongoose = require('mongoose');

const violationTypeSchema = new mongoose.Schema(
  {
    // Tên loại vi phạm (ví dụ: Đi học muộn, Đeo thẻ, v.v.)
    name: {
      type: String,
      required: [true, 'Tên loại vi phạm là bắt buộc'],
      unique: true,
      trim: true,
    },

    // Mô tả chi tiết loại vi phạm
    description: {
      type: String,
      trim: true,
    },

    // Điểm trừ mặc định cho loại vi phạm này
    defaultPenalty: {
      type: Number,
      default: 1,
      min: 0,
    },

    // Danh mục vi phạm
    category: {
      type: String,
      enum: {
        values: ['Nề nếp', 'Học tập', 'Kỷ luật', 'Khác'],
        message: 'Danh mục phải là: Nề nếp, Học tập, Kỷ luật, hoặc Khác',
      },
      default: 'Khác',
    },

    // Mức độ vi phạm
    severity: {
      type: String,
      enum: {
        values: ['Nhẹ', 'Trung bình', 'Nặng'],
        message: 'Mức độ phải là: Nhẹ, Trung bình, hoặc Nặng',
      },
      default: 'Nhẹ',
    },

    // Trạng thái (hoạt động/không hoạt động)
    isActive: {
      type: Boolean,
      default: true,
    },

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
violationTypeSchema.index({ name: 1 });
violationTypeSchema.index({ isActive: 1 });

module.exports = mongoose.model('ViolationType', violationTypeSchema);

