/**
 * Comments Routes
 * Sistema polimórfico de comentarios para ELM-015
 */
const express = require('express');
const router = express.Router();
const {
  listByEntityHandler,
  createHandler,
  updateHandler,
  deleteHandler
} = require('../controllers/commentsController');

// GET /api/v1/comments/:entidadTipo/:entidadId - Listar comentarios de una entidad
router.get('/:entidadTipo/:entidadId', listByEntityHandler);

// POST /api/v1/comments - Crear comentario
router.post('/', createHandler);

// PUT /api/v1/comments/:id - Actualizar comentario
router.put('/:id', updateHandler);

// DELETE /api/v1/comments/:id - Eliminar comentario (soft delete)
router.delete('/:id', deleteHandler);

module.exports = router;
