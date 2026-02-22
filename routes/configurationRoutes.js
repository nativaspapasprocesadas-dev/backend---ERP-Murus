/**
 * Configuration Routes
 * Rutas para gestion de configuraciones del sistema
 */
const express = require('express');
const router = express.Router();
const {
  list,
  listByModule,
  getOne,
  update,
  updateBatch,
  getPublicSocialConfig
} = require('../controllers/configurationController');
const { verifyToken } = require('../middleware/authMiddleware');

// Rutas publicas (sin autenticacion) - DEBEN IR ANTES del middleware
// GET /api/v1/configurations/public/social - Redes sociales para login
router.get('/public/social', getPublicSocialConfig);

// A partir de aqui, todas las rutas requieren autenticacion
router.use(verifyToken);

// GET /api/v1/configurations - Listar todas las configuraciones
router.get('/', list);

// GET /api/v1/configurations/module/:modulo - Listar por modulo
router.get('/module/:modulo', listByModule);

// PUT /api/v1/configurations/batch - Actualizar multiples configuraciones
router.put('/batch', updateBatch);

// GET /api/v1/configurations/:clave - Obtener una configuracion
router.get('/:clave', getOne);

// PUT /api/v1/configurations/:clave - Actualizar una configuracion
router.put('/:clave', update);

module.exports = router;
