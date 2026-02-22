/**
 * Profile Controller - API-075, API-076
 * Segun diseno en 04_apis_lista.md linea 4746 (API-075), linea 4803 (API-076)
 *
 * IMPORTANTE: Las rutas de perfil usan el middleware verificarToken,
 * por lo que req.user ya contiene los datos del usuario autenticado.
 */
const { getProfile, changePassword } = require('../models/profileModel');

/**
 * GET /api/v1/profile - API-075
 * Obtener perfil del usuario autenticado
 * req.user es establecido por el middleware verificarToken
 */
const get = async (req, res) => {
  try {
    // req.user viene del middleware verificarToken
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const profile = await getProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    // Response segun diseno API-075: ProfileDTO
    res.json({
      success: true,
      data: {
        id: profile.id,
        name: profile.name,
        username: profile.username,
        email: profile.email,
        phone: profile.phone,
        role: profile.role,
        branch: profile.branch
      }
    });

  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * POST /api/v1/profile/change-password - API-076
 * Cambiar contrasena del usuario autenticado
 *
 * Segun diseno API-076:
 * - Roles permitidos: TODOS (autenticados)
 * - Request body: { currentPassword, newPassword, confirmPassword }
 * - Response: { success, message }
 * - req.user es establecido por el middleware verificarToken
 */
const changePasswordHandler = async (req, res) => {
  try {
    // req.user viene del middleware verificarToken
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validaciones segun diseno API-076
    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        error: 'currentPassword es requerido'
      });
    }

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'newPassword es requerido'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'newPassword debe tener minimo 6 caracteres'
      });
    }

    if (!confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'confirmPassword es requerido'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'confirmPassword debe coincidir con newPassword'
      });
    }

    // Ejecutar cambio de contrasena
    await changePassword(userId, currentPassword, newPassword);

    // Response segun diseno API-076: SuccessResponseDTO
    res.json({
      success: true,
      message: 'Contrasena cambiada exitosamente'
    });

  } catch (error) {
    console.error('Error cambiando contrasena:', error);

    // Manejar errores especificos del modelo
    if (error.message === 'USUARIO_NO_ENCONTRADO') {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    if (error.message === 'USUARIO_INACTIVO') {
      return res.status(403).json({
        success: false,
        error: 'Usuario inactivo'
      });
    }

    if (error.message === 'CONTRASENA_INCORRECTA') {
      return res.status(400).json({
        success: false,
        error: 'Contrasena actual incorrecta'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

module.exports = {
  get,
  changePassword: changePasswordHandler
};
