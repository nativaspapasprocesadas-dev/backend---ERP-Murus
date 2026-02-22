/**
 * Products Routes - API-057, API-058, API-059, API-060
 * Segun diseno en 04_apis_lista.md
 * Path base: /api/v1/products
 */
const express = require('express');
const router = express.Router();
const productsController = require('../controllers/productsController');
const { verifyToken } = require('../middleware/authMiddleware');
const { uploadProductImage, handleMulterError } = require('../middleware/uploadMiddleware');

// API-057: GET /api/v1/products - Listar productos (paginado con filtros)
router.get('/', verifyToken, productsController.list);

// GET /api/v1/products/for-orders - Listar TODOS los productos activos para pedidos
// Importante: Esta ruta debe ir ANTES de /:id para que no sea interceptada
router.get('/for-orders', verifyToken, productsController.listForOrders);

// API-058: POST /api/v1/products - Crear producto (con imagen opcional)
router.post('/', verifyToken, uploadProductImage, handleMulterError, productsController.create);

// GET /api/v1/products/:id - Obtener producto por ID (auxiliar)
router.get('/:id', verifyToken, productsController.getById);

// POST /api/v1/products/:id/image - Subir/actualizar imagen de producto existente
router.post('/:id/image', verifyToken, uploadProductImage, handleMulterError, productsController.uploadImage);

// API-059: PUT /api/v1/products/:id - Actualizar producto (con imagen opcional)
router.put('/:id', verifyToken, uploadProductImage, handleMulterError, productsController.update);

// API-060: DELETE /api/v1/products/:id - Eliminar producto
router.delete('/:id', verifyToken, productsController.remove);

module.exports = router;
