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

    // Mức độ vi phạm
    severity: {
      type: String,
      enum: {
        values: ['Nhẹ', 'Trung bình', 'Nặng'],
        message: 'Mức độ phải là: Nhẹ, Trung bình, hoặc Nặng',
      },
      default: 'Trung bình',
    },

    // Điểm trừ mặc định cho loại vi phạm này
    defaultPenalty: {
      type: Number,
      default: 1,
      min: 0,
    },

    // Danh mục vi phạm (ví dụ: Nề nếp, Học tập, Kỷ luật)
    category: {
      type: String,
      enum: {
        values: ['Nề nếp', 'Học tập', 'Kỷ luật', 'Khác'],
        message: 'Danh mục phải là: Nề nếp, Học tập, Kỷ luật, hoặc Khác',
      },
      default: 'Nề nếp',
    },

    // Trạng thái (hoạt động/không hoạt động)
    isActive: {
      type: Boolean,
      default: true,
    },

    // Thứ tự hiển thị
    order: {
      type: Number,
      default: 0,
    },

    // Màu sắc để hiển thị trên UI (hex color)
    color: {
      type: String,
      default: '#FF6B6B',
      match: [/^#[0-9A-F]{6}$/i, 'Màu phải là mã hex hợp lệ'],
    },

    // Biểu tượng (icon name)
    icon: String,

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
violationTypeSchema.index({ category: 1 });
violationTypeSchema.index({ severity: 1 });
violationTypeSchema.index({ isActive: 1 });

module.exports = mongoose.model('ViolationType', violationTypeSchema);

