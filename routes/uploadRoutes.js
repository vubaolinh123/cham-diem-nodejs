const express = require('express');
const router = express.Router();
const { uploadImages } = require('../middlewares/upload');

// POST /api/uploads - Upload one or more images
router.post('/', uploadImages.array('files', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có file nào được tải lên',
      });
    }

    const folder = req.query.folder || 'evidence';
    const urls = req.files.map((file) => ({
      url: `/uploads/${folder}/${file.filename}`,
      type: 'image',
      originalName: file.originalname,
      size: file.size,
      uploadedAt: new Date(),
    }));

    res.status(201).json({
      success: true,
      message: `Tải lên ${urls.length} file thành công`,
      data: { files: urls },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi khi tải file',
      error: error.message,
    });
  }
});

// Error handling for multer
router.use((err, req, res, next) => {
  if (err instanceof require('multer').MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File quá lớn. Tối đa 5MB mỗi file.',
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Quá nhiều file. Tối đa 10 file mỗi lần tải.',
      });
    }
  }
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  next();
});

module.exports = router;
