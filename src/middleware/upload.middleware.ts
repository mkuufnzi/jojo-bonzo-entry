import multer from 'multer';

const storage = multer.memoryStorage();

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/html' || file.mimetype === 'application/xhtml+xml') {
      cb(null, true);
    } else {
      cb(new Error('Only HTML files are allowed'));
    }
  },
});
