/**
 * Catalog Routes - API-014, API-015
 * Segun diseno en 04_apis_lista.md (lineas 891-1045)
 * Base path: /api/v1/catalog
 */
const express = require('express');
const router = express.Router();
const catalogController = require('../controllers/catalogController');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');

// Roles permitidos segun diseno
const CATALOG_ROLES = ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR', 'CLIENTE'];

/**
 * API-014: GET /api/v1/catalog/products
 * Listar productos del catalogo con paginacion y filtros
 */
router.get('/products', verifyToken, checkRole(CATALOG_ROLES), catalogController.listProducts);

/**
 * API-015: GET /api/v1/catalog/products/:id
 * Obtener detalle de un producto
 */
router.get('/products/:id', verifyToken, checkRole(CATALOG_ROLES), catalogController.getProductById);

/**
 * Auxiliares para filtros (no definidas en diseno pero necesarias para UX)
 */
router.get('/species', verifyToken, checkRole(CATALOG_ROLES), catalogController.listSpecies);
router.get('/measures', verifyToken, checkRole(CATALOG_ROLES), catalogController.listMeasures);
router.get('/presentations', verifyToken, checkRole(CATALOG_ROLES), catalogController.listPresentations);

module.exports = router;
