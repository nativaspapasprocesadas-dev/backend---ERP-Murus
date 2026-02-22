/**
 * Upload Middleware - Configuracion de Multer para archivos
 * Usa almacenamiento en memoria para subir a Wasabi S3
 */
const multer = require('multer');
const path = require('path');

// Almacenamiento en memoria para S3/Wasabi
const memoryStorage = multer.memoryStorage();

// Filtro de tipos de archivo para imagenes
const imageFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se aceptan imagenes JPG, PNG, GIF y WEBP'), false);
  }
};

// Filtro de tipos de archivo para vouchers (imagenes y PDF)
const voucherFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];

  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) && allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se aceptan imagenes (JPG, PNG, GIF, WEBP) y PDF'), false);
  }
};

// Configuracion de multer para productos (memoria)
const uploadProduct = multer({
  storage: memoryStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB maximo
  }
});

// Configuracion de multer para comunicados (memoria)
const uploadComunication = multer({
  storage: memoryStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB maximo
  }
});

// Configuracion de multer para vouchers (memoria)
const uploadVoucher = multer({
  storage: memoryStorage,
  fileFilter: voucherFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB maximo
  }
});

// Middleware para manejo de errores de multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'El archivo excede el tamano maximo permitido de 5MB'
      });
    }
    return res.status(400).json({
      success: false,
      error: `Error al subir archivo: ${err.message}`
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
  next();
};

module.exports = {
  uploadProductImage: uploadProduct.single('imagen'),
  uploadComunicationImage: uploadComunication.single('imagen'),
  uploadVoucher: uploadVoucher.single('voucher'),
  handleMulterError
};
