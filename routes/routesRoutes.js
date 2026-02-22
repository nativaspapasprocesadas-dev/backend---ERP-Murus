/**
 * Routes Routes - API-036, API-037, API-038, API-039, API-040, API-041, API-042, API-043
 * Segun diseno en 04_apis_lista.md (lineas 2369-2682)
 * Path base: /api/v1/routes
 */
const express = require('express');
const router = express.Router();
const {
  createConfig,
  updateConfig,
  exportPdf,
  list,
  getById,
  dispatch,
  complete,
  reopen,
  listConfig,
  getScheduleStatus
} = require('../controllers/routesController');

// GET /api/v1/routes - API-036 Listar rutas del dia
router.get('/', list);

// GET /api/v1/routes/config - API-040 Listar configuracion de rutas
// IMPORTANTE: Esta ruta debe estar ANTES de /:id para evitar conflictos
router.get('/config', listConfig);

// POST /api/v1/routes/config - API-041 Crear configuracion de ruta
router.post('/config', createConfig);

// GET /api/v1/routes/config/:id/schedule-status - Validar estado de horario de ruta
router.get('/config/:id/schedule-status', getScheduleStatus);

// PUT /api/v1/routes/config/:id - API-042 Actualizar configuracion de ruta
router.put('/config/:id', updateConfig);

// GET /api/v1/routes/:id - API-037 Obtener detalle de ruta
router.get('/:id', getById);

// POST /api/v1/routes/:id/dispatch - API-038 Asignar chofer y enviar ruta
router.post('/:id/dispatch', dispatch);

// POST /api/v1/routes/:id/complete - API-039 Completar ruta
router.post('/:id/complete', complete);

// POST /api/v1/routes/:id/reopen - Reabrir ruta (revertir envío para agregar más pedidos)
router.post('/:id/reopen', reopen);

// GET /api/v1/routes/:id/export/pdf - API-043 Exportar ruta a PDF
router.get('/:id/export/pdf', exportPdf);

module.exports = router;
