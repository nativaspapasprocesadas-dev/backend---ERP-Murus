/**
 * Customers Routes - API-016, API-017, API-018, API-019, API-020, API-080, API-081
 * Segun diseno en 04_apis_lista.md (lineas 1051-1387)
 * API-080: GET /api/v1/customers/{id}/product-prices (linea 5020)
 * API-081: PUT /api/v1/customers/{id}/product-prices
 * Base path: /api/v1/customers
 */
const express = require('express');
const router = express.Router();
const {
  list,
  getById,
  create,
  update,
  changeType,
  getProductPrices,
  updateProductPrices,
  getMe,
  remove
} = require('../controllers/customersController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');

// Roles permitidos segun diseno
const ADMIN_ROLES = ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'];
const SUPER_ADMIN_ROLES = ['SUPERADMINISTRADOR', 'ADMINISTRADOR'];

/**
 * API-016: GET /api/v1/customers
 * Listar clientes con paginacion y filtros
 */
router.get('/', verifyToken, checkRole(ADMIN_ROLES), list);

/**
 * GET /api/v1/customers/me
 * Obtener datos del cliente logueado (solo CLIENTE)
 * IMPORTANTE: Esta ruta debe estar ANTES de /:id
 */
router.get('/me', verifyToken, checkRole(['CLIENTE']), getMe);

/**
 * API-017: GET /api/v1/customers/:id
 * Obtener detalle de un cliente
 */
router.get('/:id', verifyToken, checkRole(ADMIN_ROLES), getById);

/**
 * API-018: POST /api/v1/customers
 * Crear nuevo cliente
 */
router.post('/', verifyToken, checkRole(ADMIN_ROLES), create);

/**
 * API-019: PUT /api/v1/customers/:id
 * Actualizar cliente existente
 */
router.put('/:id', verifyToken, checkRole(ADMIN_ROLES), update);

/**
 * API-020: PATCH /api/v1/customers/:id/type
 * Cambiar tipo de cliente (RECURRENTE/NO_RECURRENTE)
 */
router.patch('/:id/type', verifyToken, checkRole(ADMIN_ROLES), changeType);

/**
 * API-080: GET /api/v1/customers/:id/product-prices
 * Obtener precios personalizados de productos para un cliente
 */
router.get('/:id/product-prices', getProductPrices);

/**
 * API-081: PUT /api/v1/customers/:id/product-prices
 * Actualizar precios personalizados de productos para un cliente
 */
router.put('/:id/product-prices', updateProductPrices);

/**
 * DELETE /api/v1/customers/:id
 * Eliminar cliente (soft delete)
 * Solo SUPERADMINISTRADOR y ADMINISTRADOR
 */
router.delete('/:id', verifyToken, checkRole(SUPER_ADMIN_ROLES), remove);

module.exports = router;
