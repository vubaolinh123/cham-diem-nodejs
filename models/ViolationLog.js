const mongoose = require('mongoose');

const violationLogSchema = new mongoose.Schema(
  {
    // Tuần học
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Week',
      required: [true, 'Tuần học là bắt buộc'],
    },

    // Ngày vi phạm
    date: {
      type: Date,
      required: [true, 'Ngày vi phạm là bắt buộc'],
    },

    // Học sinh vi phạm
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Học sinh là bắt buộc'],
    },

    // Lớp của học sinh
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Lớp là bắt buộc'],
    },

    // Loại vi phạm
    violationType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ViolationType',
      required: [true, 'Loại vi phạm là bắt buộc'],
    },

    // Mô tả chi tiết vi phạm
    description: {
      type: String,
      required: [true, 'Mô tả chi tiết là bắt buộc'],
      trim: true,
    },

    // Thời gian vi phạm (nếu có)
    violationTime: String,

    // Địa điểm vi phạm
    location: String,

    // Minh chứng (ảnh/tài liệu)
    evidence: [
      {
        // URL hoặc đường dẫn tệp
        url: String,
        // Loại tệp (image, document, v.v.)
        type: {
          type: String,
          enum: ['image', 'document', 'video'],
        },
        // Mô tả tệp
        description: String,
        // Ngày tải lên
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Người ghi nhận vi phạm (Cờ đỏ trực tuần)
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Người ghi nhận là bắt buộc'],
    },

    // Trạng thái duyệt
    status: {
      type: String,
      enum: {
        values: ['Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Gộp'],
        message: 'Trạng thái phải là: Chờ duyệt, Đã duyệt, Từ chối, hoặc Gộp',
      },
      default: 'Chờ duyệt',
    },

    // Người duyệt (GVCN hoặc Phó đoàn)
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Ngày duyệt
    approvedDate: Date,

    // Ghi chú khi duyệt/từ chối
    approvalNotes: String,

    // Phát hiện trùng lặp
    isDuplicate: {
      type: Boolean,
      default: false,
    },

    // Nếu là trùng lặp, liên kết đến bản ghi gốc
    duplicateOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ViolationLog',
    },

    // Ghi chú bổ sung (nếu gộp với bản ghi khác)
    supplementaryNotes: String,

    // Mức độ vi phạm (được sao chép từ ViolationType)
    severity: {
      type: String,
      enum: {
        values: ['Nhẹ', 'Trung bình', 'Nặng'],
        message: 'Mức độ phải là: Nhẹ, Trung bình, hoặc Nặng',
      },
    },

    // Danh mục vi phạm (được sao chép từ ViolationType)
    category: {
      type: String,
      enum: {
        values: ['Nề nếp', 'Học tập', 'Kỷ luật', 'Khác'],
        message: 'Danh mục phải là: Nề nếp, Học tập, Kỷ luật, hoặc Khác',
      },
    },

    // Ghi chú
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Index cho tìm kiếm nhanh
violationLogSchema.index({ week: 1 });
violationLogSchema.index({ date: 1 });
violationLogSchema.index({ student: 1 });
violationLogSchema.index({ class: 1 });
violationLogSchema.index({ violationType: 1 });
violationLogSchema.index({ status: 1 });
violationLogSchema.index({ reportedBy: 1 });
violationLogSchema.index({ approvedBy: 1 });
violationLogSchema.index({ student: 1, violationType: 1, date: 1 });
violationLogSchema.index({ isDuplicate: 1 });
violationLogSchema.index({ week: 1, class: 1, status: 1 });

module.exports = mongoose.model('ViolationLog', violationLogSchema);

