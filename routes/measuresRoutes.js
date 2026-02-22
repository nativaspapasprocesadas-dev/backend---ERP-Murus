/**
 * Measures Routes - API-049, API-050, API-051, API-052
 * Segun diseno en 04_apis_lista.md
 * Path base: /api/v1/measures
 */
const express = require('express');
const router = express.Router();
const measuresController = require('../controllers/measuresController');
const { verifyToken } = require('../middleware/authMiddleware');

// API-049: GET /api/v1/measures - Listar medidas (paginado)
router.get('/', verifyToken, measuresController.list);

// API-050: POST /api/v1/measures - Crear medida
router.post('/', verifyToken, measuresController.create);

// GET /api/v1/measures/:id - Obtener medida por ID (auxiliar)
router.get('/:id', verifyToken, measuresController.getById);

// API-051: PUT /api/v1/measures/:id - Actualizar medida
router.put('/:id', verifyToken, measuresController.update);

// API-052: DELETE /api/v1/measures/:id - Eliminar medida
router.delete('/:id', verifyToken, measuresController.remove);

module.exports = router;
