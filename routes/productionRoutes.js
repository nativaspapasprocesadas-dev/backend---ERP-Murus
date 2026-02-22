/**
 * Production Routes - API-044
 * Segun diseno en 04_apis_lista.md
 * Path base: /api/v1/production
 */
const express = require('express');
const router = express.Router();
const { getBoard, getItemsListosController, toggleItemListoController, toggleItemsListoBatchController } = require('../controllers/productionController');

// GET /api/v1/production/board - API-044
router.get('/board', getBoard);

// GET /api/v1/production/items-listos - Obtener items marcados como listos
router.get('/items-listos', getItemsListosController);

// POST /api/v1/production/toggle-item-listo - Marcar/desmarcar item como listo
router.post('/toggle-item-listo', toggleItemListoController);

// POST /api/v1/production/toggle-items-listo-batch - Marcar/desmarcar MULTIPLES items como listos
router.post('/toggle-items-listo-batch', toggleItemsListoBatchController);

module.exports = router;
