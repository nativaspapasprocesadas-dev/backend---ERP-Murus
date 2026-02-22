/**
 * Drivers Routes - API-032, API-033, API-034, API-035
 * Segun diseno en 04_apis_lista.md (lineas 2122-2363)
 *
 * Rutas implementadas:
 *   GET    /api/v1/drivers      - API-032 Listar choferes
 *   POST   /api/v1/drivers      - API-033 Crear chofer
 *   GET    /api/v1/drivers/:id  - Obtener chofer por ID (adicional)
 *   PUT    /api/v1/drivers/:id  - API-034 Actualizar chofer
 *   DELETE /api/v1/drivers/:id  - API-035 Eliminar chofer
 */
const express = require('express');
const router = express.Router();
const {
  list,
  getById,
  create,
  update,
  remove
} = require('../controllers/driversController');

// GET /api/v1/drivers - API-032
router.get('/', list);

// POST /api/v1/drivers - API-033
router.post('/', create);

// GET /api/v1/drivers/:id - Adicional para obtener detalle
router.get('/:id', getById);

// PUT /api/v1/drivers/:id - API-034
router.put('/:id', update);

// DELETE /api/v1/drivers/:id - API-035
router.delete('/:id', remove);

module.exports = router;
