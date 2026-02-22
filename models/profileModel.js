/**
 * Profile Model - API-075, API-076
 * Segun diseno en 04_apis_lista.md linea 4746 (API-075), linea 4803 (API-076)
 * Tablas: users (TBL-001), roles (TBL-002), branches (TBL-006)
 */
const pool = require('../config/db');
const bcrypt = require('bcrypt');

/**
 * Obtener perfil de usuario - API-075
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>} Perfil del usuario
 */
const getProfile = async (userId) => {
  const query = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.phone,
      r.name AS role,
      b.name AS branch,
      b.id AS "branchId",
      u.is_active AS "isActive",
      u.date_time_registration AS "createdAt"
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.id
    LEFT JOIN branches b ON u.branch_id = b.id
    WHERE u.id = $1 AND u.status = 'active'
  `;

  const result = await pool.query(query, [userId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    username: row.email, // username es el email segun response diseno
    email: row.email,
    phone: row.phone,
    role: row.role,
    branch: row.branch,
    branchId: row.branchId,
    isActive: row.isActive,
    createdAt: row.createdAt
  };
};

/**
 * Obtener usuario por ID con su password hash
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>} Usuario o null
 */
const getUserById = async (userId) => {
  const query = `
    SELECT id, name, email, password, is_active, status
    FROM users
    WHERE id = $1
  `;
  const result = await pool.query(query, [userId]);
  return result.rows[0] || null;
};

/**
 * Cambiar contrasena del usuario - API-076
 * POST /api/v1/profile/change-password
 *
 * Segun diseno:
 * - currentPassword: validacion (debe ser correcta)
 * - newPassword: minimo 6 caracteres -> users.password
 * - confirmPassword: debe coincidir con newPassword
 *
 * @param {number} userId - ID del usuario
 * @param {string} currentPassword - Contrasena actual (plain)
 * @param {string} newPassword - Nueva contrasena (plain)
 * @returns {Promise<Object>} Resultado de la operacion
 */
const changePassword = async (userId, currentPassword, newPassword) => {
  // Obtener usuario actual
  const user = await getUserById(userId);

  if (!user) {
    throw new Error('USUARIO_NO_ENCONTRADO');
  }

  if (!user.is_active || user.status !== 'active') {
    throw new Error('USUARIO_INACTIVO');
  }

  // Verificar contrasena actual
  const passwordMatch = await bcrypt.compare(currentPassword, user.password);
  if (!passwordMatch) {
    throw new Error('CONTRASENA_INCORRECTA');
  }

  // Hashear nueva contrasena
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

  // Actualizar contrasena en BD
  const updateQuery = `
    UPDATE users
    SET password = $1,
        user_id_modification = $2,
        date_time_modification = NOW()
    WHERE id = $2
    RETURNING id
  `;

  const result = await pool.query(updateQuery, [hashedPassword, userId]);

  if (result.rows.length === 0) {
    throw new Error('ERROR_ACTUALIZACION');
  }

  return {
    success: true
  };
};

module.exports = {
  getProfile,
  getUserById,
  changePassword
};
