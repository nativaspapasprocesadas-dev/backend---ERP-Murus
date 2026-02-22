/**
 * Species Routes - API-045, API-046, API-047, API-048
 * Segun diseno en 04_apis_lista.md
 * Path base: /api/v1/species
 */
const express = require('express');
const router = express.Router();
const {
  list,
  create,
  update,
  remove
} = require('../controllers/speciesController');

// GET /api/v1/species - API-045
router.get('/', list);

// POST /api/v1/species - API-046
router.post('/', create);

// PUT /api/v1/species/:id - API-047
router.put('/:id', update);

// DELETE /api/v1/species/:id - API-048
router.delete('/:id', remove);

module.exports = router;
