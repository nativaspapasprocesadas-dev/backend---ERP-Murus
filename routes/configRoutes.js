/**
 * Config Routes - API-077, API-078
 * Segun diseno en 04_apis_lista.md linea 4862 (API-077), linea 4918 (API-078)
 */
const express = require('express');
const router = express.Router();
const { get, update } = require('../controllers/configController');

// GET /api/v1/config - API-077 Obtener configuracion del sistema
router.get('/', get);

// PUT /api/v1/config - API-078 Actualizar configuracion del sistema
router.put('/', update);

module.exports = router;
