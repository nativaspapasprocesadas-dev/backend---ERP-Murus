/**
 * Wasabi S3 Service - Almacenamiento de objetos en la nube
 * Compatible con AWS S3 API
 */
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

// Configuracion del cliente S3 para Wasabi
const s3Client = new S3Client({
  region: process.env.WASABI_REGION || 'us-east-1',
  endpoint: process.env.WASABI_ENDPOINT || 'https://s3.us-east-1.wasabisys.com',
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY,
    secretAccessKey: process.env.WASABI_SECRET_KEY
  },
  forcePathStyle: true
});

const BUCKET_NAME = process.env.WASABI_BUCKET || 'erp-papas-uploads';

/**
 * Generar nombre de archivo unico
 * @param {string} prefix - Prefijo del archivo (product, voucher, comunicado)
 * @param {string} originalName - Nombre original del archivo
 * @returns {string} Nombre unico del archivo
 */
const generateFileName = (prefix, originalName) => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const ext = path.extname(originalName).toLowerCase();
  return `${prefix}_${timestamp}_${random}${ext}`;
};

/**
 * Subir archivo a Wasabi S3
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} folder - Carpeta destino (products, vouchers, comunication)
 * @param {string} fileName - Nombre del archivo
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {Promise<{success: boolean, url: string, key: string}>}
 */
const uploadFile = async (fileBuffer, folder, fileName, mimeType) => {
  const key = `${folder}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    ACL: 'public-read'
  });

  try {
    await s3Client.send(command);

    // Construir URL publica de Wasabi
    const region = process.env.WASABI_REGION || 'us-east-1';
    const url = `https://s3.${region}.wasabisys.com/${BUCKET_NAME}/${key}`;

    return {
      success: true,
      url,
      key
    };
  } catch (error) {
    console.error('Error subiendo archivo a Wasabi:', error);
    throw new Error(`Error al subir archivo: ${error.message}`);
  }
};

/**
 * Eliminar archivo de Wasabi S3
 * @param {string} fileUrl - URL completa del archivo o key
 * @returns {Promise<{success: boolean}>}
 */
const deleteFile = async (fileUrl) => {
  if (!fileUrl) return { success: true };

  try {
    let key = fileUrl;

    // Si es una URL completa de Wasabi, extraer el key
    if (fileUrl.includes('wasabisys.com')) {
      const urlParts = fileUrl.split(`${BUCKET_NAME}/`);
      key = urlParts[1] || fileUrl;
    }
    // Si es una URL local antigua (/uploads/...), convertir a key
    else if (fileUrl.startsWith('/uploads/')) {
      key = fileUrl.replace('/uploads/', '');
    }

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);
    console.log(`Archivo eliminado de Wasabi: ${key}`);

    return { success: true };
  } catch (error) {
    console.error('Error eliminando archivo de Wasabi:', error);
    // No lanzar error para no interrumpir el flujo principal
    return { success: false, error: error.message };
  }
};

/**
 * Subir imagen de producto
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} originalName - Nombre original
 * @param {string} mimeType - Tipo MIME
 * @returns {Promise<{success: boolean, url: string}>}
 */
const uploadProductImage = async (fileBuffer, originalName, mimeType) => {
  const fileName = generateFileName('product', originalName);
  return uploadFile(fileBuffer, 'products', fileName, mimeType);
};

/**
 * Subir voucher de pago
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} originalName - Nombre original
 * @param {string} mimeType - Tipo MIME
 * @returns {Promise<{success: boolean, url: string}>}
 */
const uploadVoucher = async (fileBuffer, originalName, mimeType) => {
  const fileName = generateFileName('voucher', originalName);
  return uploadFile(fileBuffer, 'vouchers', fileName, mimeType);
};

/**
 * Subir imagen de comunicado
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} originalName - Nombre original
 * @param {string} mimeType - Tipo MIME
 * @returns {Promise<{success: boolean, url: string}>}
 */
const uploadComunicationImage = async (fileBuffer, originalName, mimeType) => {
  const fileName = generateFileName('comunicado', originalName);
  return uploadFile(fileBuffer, 'comunication', fileName, mimeType);
};

/**
 * Verificar si el servicio de Wasabi esta configurado
 * @returns {boolean}
 */
const isConfigured = () => {
  return !!(
    process.env.WASABI_ACCESS_KEY &&
    process.env.WASABI_SECRET_KEY &&
    process.env.WASABI_BUCKET
  );
};

module.exports = {
  uploadFile,
  deleteFile,
  uploadProductImage,
  uploadVoucher,
  uploadComunicationImage,
  isConfigured,
  generateFileName,
  s3Client,
  BUCKET_NAME
};
