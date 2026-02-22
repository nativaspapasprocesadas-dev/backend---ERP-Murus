/**
 * Users Controller - API-067 a API-070
 * Segun diseno en 04_apis_lista.md
 */
const {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserById,
  getRoleById
} = require('../models/usersModel');
const jwt = require('jsonwebtoken');

/**
 * Decodificar token JWT
 */
const decodeToken = (req) => {
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
 * Validar roles permitidos (case-insensitive)
 */
const checkRoles = (decoded, allowedRoles) => {
  if (!decoded || !decoded.role_name) return false;
  const userRole = decoded.role_name.toLowerCase();
  const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());
  return normalizedAllowedRoles.includes(userRole);
};

/**
 * GET /api/v1/users - API-067
 * Listar usuarios
 */
const list = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { page, pageSize, roleId, branchId, isActive } = req.query;

    const result = await listUsers({
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      roleId: roleId ? parseInt(roleId) : null,
      branchId: branchId ? parseInt(branchId) : null,
      isActive,
      currentUserRole: decoded.role_name,
      currentUserBranchId: decoded.branch_id
    });

    // Response segun diseno API-067
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error listando usuarios:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/users - API-068
 * Crear usuario
 */
const create = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { name, email, password, roleId, branchId, phone } = req.body;

    // Validaciones segun diseno API-068
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'name es requerido' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'email debe tener un formato valido' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: 'password debe tener al menos 6 caracteres' });
    }
    if (!roleId) {
      return res.status(400).json({ success: false, error: 'roleId es requerido' });
    }

    // Verificar que el rol existe
    const role = await getRoleById(parseInt(roleId));
    if (!role) {
      return res.status(400).json({ success: false, error: 'roleId invalido - rol no existe' });
    }

    // ADMIN no puede crear SUPERADMIN (case-insensitive)
    if (decoded.role_name?.toLowerCase() === 'administrador' && role.name?.toLowerCase() === 'superadministrador') {
      return res.status(403).json({ success: false, error: 'No puede crear usuarios con rol SUPERADMINISTRADOR' });
    }

    // ADMIN solo puede crear usuarios de su sede
    let assignedBranchId = branchId ? parseInt(branchId) : null;
    if (decoded.role_name?.toLowerCase() === 'administrador') {
      assignedBranchId = decoded.branch_id;
    }

    const result = await createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      roleId: parseInt(roleId),
      branchId: assignedBranchId,
      phone: phone ? phone.trim() : null,
      currentUserId: decoded.id
    });

    // Response segun diseno API-068
    res.status(201).json({
      success: true,
      id: result.id,
      name: result.name,
      email: result.email,
      role: result.role,
      branch: result.branch,
      isActive: result.isActive
    });

  } catch (error) {
    console.error('Error creando usuario:', error);
    if (error.message.includes('email')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/v1/users/:id - API-069
 * Actualizar usuario
 */
const update = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { id } = req.params;
    const { name, roleId, branchId, isActive, phone } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de usuario invalido' });
    }

    const userId = parseInt(id);

    // Verificar que el usuario existe
    const existingUser = await getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    // Regla: No puede desactivarse a si mismo
    if (isActive === false && userId === decoded.id) {
      return res.status(400).json({ success: false, error: 'No puede desactivarse a si mismo' });
    }

    // Si es ADMIN, verificar permisos adicionales
    if (decoded.role_name?.toLowerCase() === 'administrador') {
      // No puede editar usuarios de otra sede
      if (existingUser.branchId && existingUser.branchId !== decoded.branch_id) {
        return res.status(403).json({ success: false, error: 'No puede editar usuarios de otra sede' });
      }

      // No puede cambiar a rol SUPERADMIN (case-insensitive)
      if (roleId) {
        const newRole = await getRoleById(parseInt(roleId));
        if (newRole && newRole.name?.toLowerCase() === 'superadministrador') {
          return res.status(403).json({ success: false, error: 'No puede asignar rol SUPERADMINISTRADOR' });
        }
      }
    }

    const result = await updateUser(userId, {
      name,
      roleId: roleId ? parseInt(roleId) : undefined,
      branchId: branchId !== undefined ? (branchId ? parseInt(branchId) : null) : undefined,
      isActive,
      phone,
      currentUserId: decoded.id
    });

    // Response segun diseno API-069
    res.json({
      success: true,
      id: result.id,
      name: result.name,
      email: result.email,
      role: result.role,
      branch: result.branch,
      isActive: result.isActive
    });

  } catch (error) {
    console.error('Error actualizando usuario:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('No hay campos')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/v1/users/:id - API-070
 * Eliminar usuario
 */
const remove = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de usuario invalido' });
    }

    const userId = parseInt(id);

    // Regla: No puede eliminarse a si mismo
    if (userId === decoded.id) {
      return res.status(400).json({ success: false, error: 'No puede eliminarse a si mismo' });
    }

    // Verificar que el usuario existe
    const existingUser = await getUserById(userId);
    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    // Si es ADMIN, verificar permisos adicionales
    if (decoded.role_name?.toLowerCase() === 'administrador') {
      // No puede eliminar usuarios de otra sede
      if (existingUser.branchId && existingUser.branchId !== decoded.branch_id) {
        return res.status(403).json({ success: false, error: 'No puede eliminar usuarios de otra sede' });
      }

      // No puede eliminar SUPERADMIN (case-insensitive)
      if (existingUser.role?.toLowerCase() === 'superadministrador') {
        return res.status(403).json({ success: false, error: 'No puede eliminar usuarios con rol SUPERADMINISTRADOR' });
      }
    }

    const result = await deleteUser(userId, decoded.id);

    // Response segun diseno API-070
    res.json({
      success: result.success
    });

  } catch (error) {
    console.error('Error eliminando usuario:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  list,
  create,
  update,
  remove
};
