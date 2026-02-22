/**
 * Branches Routes - API-071, API-072, API-073, API-074
 * Segun diseno en 04_apis_lista.md linea 4522
 */
const express = require('express');
const router = express.Router();
const {
  list,
  create,
  update,
  remove,
  getById
} = require('../controllers/branchesController');

// GET /api/v1/branches - API-071 Listar sedes
router.get('/', list);

// POST /api/v1/branches - API-072 Crear sede
router.post('/', create);

// GET /api/v1/branches/:id - Obtener sede por ID (auxiliar)
router.get('/:id', getById);

// PUT /api/v1/branches/:id - API-073 Actualizar sede
router.put('/:id', update);

// DELETE /api/v1/branches/:id - API-074 Eliminar sede
router.delete('/:id', remove);

module.exports = router;
