/**
 * Users Routes - API-067 a API-070
 * Segun diseno en 04_apis_lista.md
 */
const express = require('express');
const router = express.Router();
const {
  list,
  create,
  update,
  remove
} = require('../controllers/usersController');

// GET /api/v1/users - API-067
router.get('/', list);

// POST /api/v1/users - API-068
router.post('/', create);

// PUT /api/v1/users/:id - API-069
router.put('/:id', update);

// DELETE /api/v1/users/:id - API-070
router.delete('/:id', remove);

module.exports = router;
