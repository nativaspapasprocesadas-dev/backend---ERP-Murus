const jwt = require('jsonwebtoken');

/**
 * Middleware para verificar token JWT
 */
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // Contiene: id, role_name, branch_id, etc.
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Middleware para verificar roles permitidos
 * @param {Array<string>} allowedRoles - Lista de roles permitidos (case-insensitive)
 * @returns {Function} Middleware function
 */
function checkRole(allowedRoles) {
  // Normalizar roles permitidos a minúsculas para comparación case-insensitive
  const normalizedAllowedRoles = allowedRoles.map(role => role.toLowerCase());

  return (req, res, next) => {
    // req.user debe haber sido establecido por verificarToken
    if (!req.user || !req.user.role_name) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    // Verificar si el rol del usuario está en los roles permitidos (case-insensitive)
    const userRole = req.user.role_name.toLowerCase();
    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'No tiene permisos para realizar esta operación'
      });
    }

    next();
  };
}

// VERSIÓN SIMULADA (para pruebas sin frontend/login)
// function verificarToken(req, res, next) {
//   req.user = { id: 1, role_name: 'SUPERADMINISTRADOR', branch_id: 1 };
//   next();
// }

// Exportar ambas funciones
module.exports = {
  verificarToken,
  verifyToken: verificarToken, // Alias para compatibilidad
  checkRole
};
