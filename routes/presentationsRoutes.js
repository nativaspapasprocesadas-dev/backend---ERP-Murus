/**
 * Presentations Routes - API-053, API-054, API-055, API-056
 * Segun diseno en 04_apis_lista.md
 * Path base: /api/v1/presentations
 */
const express = require('express');
const router = express.Router();
const presentationsController = require('../controllers/presentationsController');
const { verifyToken } = require('../middleware/authMiddleware');

// API-053: GET /api/v1/presentations - Listar presentaciones (paginado)
router.get('/', verifyToken, presentationsController.list);

// API-054: POST /api/v1/presentations - Crear presentacion
router.post('/', verifyToken, presentationsController.create);

// GET /api/v1/presentations/:id - Obtener presentacion por ID (auxiliar)
router.get('/:id', verifyToken, presentationsController.getById);

// API-055: PUT /api/v1/presentations/:id - Actualizar presentacion
router.put('/:id', verifyToken, presentationsController.update);

// API-056: DELETE /api/v1/presentations/:id - Eliminar presentacion
router.delete('/:id', verifyToken, presentationsController.remove);

module.exports = router;
