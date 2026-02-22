/**
 * Users Model - API-067, API-068, API-069, API-070
 * Segun diseno en 04_apis_lista.md
 * Tablas reales: users, roles, branches
 */
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

/**
 * Listar usuarios con paginacion y filtros - API-067
 * @param {Object} params - Parametros de filtro y paginacion
 * @returns {Promise<Object>} Lista paginada de usuarios
 */
const listUsers = async ({ page = 1, pageSize = 20, roleId, branchId, isActive, currentUserRole, currentUserBranchId }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  let whereConditions = ["u.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  // Filtro por rol del usuario actual
  if (currentUserRole === 'ADMINISTRADOR' && currentUserBranchId) {
    // ADMIN solo ve usuarios de su sede
    whereConditions.push(`u.branch_id = $${paramIndex}`);
    params.push(currentUserBranchId);
    paramIndex++;
  }

  // Filtros opcionales
  if (roleId) {
    whereConditions.push(`u.role_id = $${paramIndex}`);
    params.push(roleId);
    paramIndex++;
  }
  if (branchId) {
    whereConditions.push(`u.branch_id = $${paramIndex}`);
    params.push(branchId);
    paramIndex++;
  }
  if (isActive !== undefined && isActive !== null && isActive !== '') {
    const isActiveValue = isActive === 'true' || isActive === true;
    whereConditions.push(`u.is_active = $${paramIndex}`);
    params.push(isActiveValue);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Query para contar total
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM users u
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Query para obtener datos
  const dataQuery = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u.is_active AS "isActive",
      u.role_id AS "roleId",
      u.branch_id AS "branchId",
      r.name AS role,
      b.name AS branch,
      u.date_time_registration AS "createdAt"
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN branches b ON u.branch_id = b.id
    ${whereClause}
    ORDER BY u.name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      roleId: row.roleId,
      branch: row.branch,
      branchId: row.branchId,
      isActive: row.isActive,
      createdAt: row.createdAt
    })),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
};

/**
 * Crear usuario - API-068
 * @param {Object} userData - Datos del usuario
 * @returns {Promise<Object>} Usuario creado
 */
const createUser = async ({ name, email, password, roleId, branchId, phone, currentUserId }) => {
  // Verificar si el email ya existe
  const checkEmail = `SELECT id FROM users WHERE email = $1 AND status = 'active'`;
  const emailResult = await pool.query(checkEmail, [email]);
  if (emailResult.rows.length > 0) {
    throw new Error('El email ya esta registrado');
  }

  // Hashear password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Insertar usuario
  const insertQuery = `
    INSERT INTO users (name, email, password, role_id, branch_id, phone, is_active, user_id_registration)
    VALUES ($1, $2, $3, $4, $5, $6, true, $7)
    RETURNING id, name, email, role_id, branch_id, is_active, date_time_registration
  `;

  const result = await pool.query(insertQuery, [
    name, email, hashedPassword, roleId, branchId || null, phone || null, currentUserId
  ]);

  const user = result.rows[0];

  // Obtener nombre del rol y sede
  const roleQuery = `SELECT name FROM roles WHERE id = $1`;
  const roleResult = await pool.query(roleQuery, [roleId]);

  let branchName = null;
  if (branchId) {
    const branchQuery = `SELECT name FROM branches WHERE id = $1`;
    const branchResult = await pool.query(branchQuery, [branchId]);
    branchName = branchResult.rows[0]?.name;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: roleResult.rows[0]?.name,
    roleId: user.role_id,
    branch: branchName,
    branchId: user.branch_id,
    isActive: user.is_active,
    createdAt: user.date_time_registration
  };
};

/**
 * Actualizar usuario - API-069
 * @param {number} userId - ID del usuario a actualizar
 * @param {Object} updateData - Datos a actualizar
 * @returns {Promise<Object>} Usuario actualizado
 */
const updateUser = async (userId, { name, roleId, branchId, isActive, phone, currentUserId }) => {
  // Verificar que el usuario existe
  const checkUser = `SELECT id, is_active FROM users WHERE id = $1 AND status = 'active'`;
  const userResult = await pool.query(checkUser, [userId]);
  if (userResult.rows.length === 0) {
    throw new Error('Usuario no encontrado');
  }

  // Construir query dinamica
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    params.push(name);
    paramIndex++;
  }
  if (roleId !== undefined) {
    updates.push(`role_id = $${paramIndex}`);
    params.push(roleId);
    paramIndex++;
  }
  if (branchId !== undefined) {
    updates.push(`branch_id = $${paramIndex}`);
    params.push(branchId || null);
    paramIndex++;
  }
  if (isActive !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(isActive);
    paramIndex++;
  }
  if (phone !== undefined) {
    updates.push(`phone = $${paramIndex}`);
    params.push(phone || null);
    paramIndex++;
  }

  if (updates.length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  updates.push(`user_id_modification = $${paramIndex}`);
  params.push(currentUserId);
  paramIndex++;

  updates.push(`date_time_modification = NOW()`);

  params.push(userId);

  const updateQuery = `
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, name, email, role_id, branch_id, is_active, phone
  `;

  const result = await pool.query(updateQuery, params);
  const user = result.rows[0];

  // Obtener nombre del rol y sede
  const roleQuery = `SELECT name FROM roles WHERE id = $1`;
  const roleResult = await pool.query(roleQuery, [user.role_id]);

  let branchName = null;
  if (user.branch_id) {
    const branchQuery = `SELECT name FROM branches WHERE id = $1`;
    const branchResult = await pool.query(branchQuery, [user.branch_id]);
    branchName = branchResult.rows[0]?.name;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: roleResult.rows[0]?.name,
    roleId: user.role_id,
    branch: branchName,
    branchId: user.branch_id,
    isActive: user.is_active
  };
};

/**
 * Eliminar usuario (soft delete) - API-070
 * @param {number} userId - ID del usuario a eliminar
 * @param {number} currentUserId - ID del usuario que elimina
 * @returns {Promise<Object>} Resultado de eliminacion
 */
const deleteUser = async (userId, currentUserId) => {
  // Verificar que el usuario existe
  const checkUser = `SELECT id FROM users WHERE id = $1 AND status = 'active'`;
  const userResult = await pool.query(checkUser, [userId]);
  if (userResult.rows.length === 0) {
    throw new Error('Usuario no encontrado');
  }

  // Soft delete
  const deleteQuery = `
    UPDATE users
    SET status = 'inactive',
        is_active = false,
        user_id_modification = $1,
        date_time_modification = NOW()
    WHERE id = $2
    RETURNING id
  `;

  const result = await pool.query(deleteQuery, [currentUserId, userId]);

  return {
    success: true,
    id: result.rows[0].id
  };
};

/**
 * Obtener usuario por ID
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>} Usuario encontrado o null
 */
const getUserById = async (userId) => {
  const query = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      u.is_active AS "isActive",
      u.role_id AS "roleId",
      u.branch_id AS "branchId",
      r.name AS role,
      b.name AS branch
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN branches b ON u.branch_id = b.id
    WHERE u.id = $1 AND u.status = 'active'
  `;

  const result = await pool.query(query, [userId]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    roleId: row.roleId,
    branch: row.branch,
    branchId: row.branchId,
    isActive: row.isActive
  };
};

/**
 * Obtener rol por ID
 * @param {number} roleId - ID del rol
 * @returns {Promise<Object|null>} Rol encontrado o null
 */
const getRoleById = async (roleId) => {
  const query = `SELECT id, name FROM roles WHERE id = $1 AND status = 'active'`;
  const result = await pool.query(query, [roleId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserById,
  getRoleById
};
