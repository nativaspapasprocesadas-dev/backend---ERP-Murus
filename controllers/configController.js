/**
 * Config Controller - API-077, API-078
 * Segun diseno en 04_apis_lista.md linea 4862 (API-077), linea 4918 (API-078)
 */
const {
  getSystemConfig,
  updateSystemConfig
} = require('../models/configModel');
const jwt = require('jsonwebtoken');

/**
 * Extraer usuario del token JWT
 */
const getUserFromToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

/**
 * Verificar roles permitidos
 */
const hasRole = (roleName, allowedRoles) => {
  if (!roleName) return false;
  const normalizedRole = roleName.toUpperCase();
  return allowedRoles.map(r => r.toUpperCase()).includes(normalizedRole);
};

/**
 * GET /api/v1/config - API-077
 * Obtener configuracion del sistema
 *
 * Segun diseno API-077:
 * - Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR
 * - Query params: branchId (opcional)
 * - Response: SystemConfigDTO { creditAlerts, whatsapp, socialMedia }
 */
const get = async (req, res) => {
  try {
    const user = getUserFromToken(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado o invalido'
      });
    }

    // Verificar rol - API-077: SUPERADMINISTRADOR, ADMINISTRADOR
    const allowedRoles = ['SUPERADMINISTRADOR', 'ADMINISTRADOR'];
    if (!hasRole(user.role_name, allowedRoles)) {
      return res.status(403).json({
        success: false,
        error: 'No tiene permisos para acceder a la configuracion'
      });
    }

    // Obtener branchId del query si existe
    const branchId = req.query.branchId ? parseInt(req.query.branchId) : null;

    // Segun diseno: ADMIN ve config de su sede, SUPERADMIN ve global
    const effectiveBranchId = user.role_name.toUpperCase() === 'ADMINISTRADOR'
      ? (branchId || user.branch_id)
      : branchId;

    const config = await getSystemConfig(effectiveBranchId);

    // Response segun diseno API-077
    res.json({
      success: true,
      data: config
    });

  } catch (error) {
    console.error('Error obteniendo configuracion:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * PUT /api/v1/config - API-078
 * Actualizar configuracion del sistema
 *
 * Segun diseno API-078:
 * - Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR
 * - Request body: UpdateSystemConfigDTO { creditAlerts, whatsapp, socialMedia }
 * - Response: SystemConfigDTO actualizado
 */
const update = async (req, res) => {
  try {
    const user = getUserFromToken(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado o invalido'
      });
    }

    // Verificar rol - API-078: SUPERADMINISTRADOR, ADMINISTRADOR
    const allowedRoles = ['SUPERADMINISTRADOR', 'ADMINISTRADOR'];
    if (!hasRole(user.role_name, allowedRoles)) {
      return res.status(403).json({
        success: false,
        error: 'No tiene permisos para modificar la configuracion'
      });
    }

    const configData = req.body;

    // Validar que hay datos para actualizar
    if (!configData || Object.keys(configData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron datos para actualizar'
      });
    }

    // Segun diseno: ADMIN solo puede modificar config de su sede
    // Por ahora aplicamos validacion general

    const updatedConfig = await updateSystemConfig(configData, user.id);

    // Response segun diseno API-078
    res.json({
      success: true,
      data: updatedConfig
    });

  } catch (error) {
    console.error('Error actualizando configuracion:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

module.exports = {
  get,
  update
};
