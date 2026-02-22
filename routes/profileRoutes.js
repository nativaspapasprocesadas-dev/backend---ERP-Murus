/**
 * Profile Routes - API-075, API-076
 * Segun diseno en 04_apis_lista.md linea 4746 (API-075), linea 4803 (API-076)
 */
const express = require('express');
const router = express.Router();
const { get, changePassword } = require('../controllers/profileController');
const { verificarToken } = require('../middleware/authMiddleware');

// GET /api/v1/profile - API-075 Obtener perfil de usuario
// Requiere autenticacion - todos los usuarios autenticados pueden ver su perfil
router.get('/', verificarToken, get);

// POST /api/v1/profile/change-password - API-076 Cambiar contrasena
// Requiere autenticacion - todos los usuarios autenticados pueden cambiar su contrasena
router.post('/change-password', verificarToken, changePassword);

module.exports = router;
