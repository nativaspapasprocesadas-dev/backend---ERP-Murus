const pool = require('../config/db');

/**
 * Buscar usuario por email con su rol y permisos
 * @param {string} email - Email del usuario
 * @returns {Promise<Object|null>} Usuario con sus datos, rol y permisos
 */
const findUserByEmail = async (email) => {
  const query = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.password,
      u.role_id,
      u.phone,
      u.is_active,
      u.branch_id,
      r.name AS role_name,
      b.name AS branch_name,
      b.code AS branch_code,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'description', p.description,
            'module', p.module
          )
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS permissions
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN branches b ON u.branch_id = b.id
    LEFT JOIN roles_permissions rp ON r.id = rp.role_id AND rp.status = 'active'
    LEFT JOIN permissions p ON rp.permission_id = p.id AND p.status = 'active'
    WHERE u.email = $1
      AND u.status = 'active'
      AND u.is_active = true
    GROUP BY u.id, u.name, u.email, u.password, u.role_id, u.phone, u.is_active, u.branch_id, r.name, b.name, b.code
  `;

  const result = await pool.query(query, [email]);

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Buscar usuario por nombre (para clientes que login con nombre del negocio)
 * @param {string} name - Nombre del usuario/negocio
 * @returns {Promise<Object|null>} Usuario con sus datos, rol y permisos
 */
const findUserByName = async (name) => {
  const query = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.password,
      u.role_id,
      u.phone,
      u.is_active,
      u.branch_id,
      r.name AS role_name,
      b.name AS branch_name,
      b.code AS branch_code,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'description', p.description,
            'module', p.module
          )
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS permissions
    FROM users u
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN branches b ON u.branch_id = b.id
    LEFT JOIN roles_permissions rp ON r.id = rp.role_id AND rp.status = 'active'
    LEFT JOIN permissions p ON rp.permission_id = p.id AND p.status = 'active'
    WHERE LOWER(u.name) = LOWER($1)
      AND u.status = 'active'
      AND u.is_active = true
    GROUP BY u.id, u.name, u.email, u.password, u.role_id, u.phone, u.is_active, u.branch_id, r.name, b.name, b.code
  `;

  const result = await pool.query(query, [name]);

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Obtener datos del cliente asociado a un usuario
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>} Datos del cliente
 */
const findCustomerByUserId = async (userId) => {
  const query = `
    SELECT
      id,
      user_id,
      address,
      route_id,
      contact_name,
      contact_position,
      contact_phone,
      credit_days,
      current_balance
    FROM customers
    WHERE user_id = $1
      AND status = 'active'
  `;

  const result = await pool.query(query, [userId]);

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Crear una sesion de usuario
 * @param {Object} sessionData - Datos de la sesion
 * @returns {Promise<Object>} Sesion creada
 */
const createUserSession = async (sessionData) => {
  const { user_id, token, ip_address, user_agent, expires_at } = sessionData;

  const query = `
    INSERT INTO user_sessions (user_id, token, ip_address, user_agent, expires_at, user_id_registration)
    VALUES ($1, $2, $3, $4, $5, $1)
    RETURNING id, user_id, token, expires_at, date_time_registration
  `;

  const result = await pool.query(query, [user_id, token, ip_address, user_agent, expires_at]);

  return result.rows[0];
};

/**
 * Invalidar sesion por token
 * @param {string} token - Token de la sesion
 * @returns {Promise<boolean>} True si se invalido correctamente
 */
const invalidateSession = async (token) => {
  const query = `
    UPDATE user_sessions
    SET is_valid = false,
        status = 'inactive',
        date_time_modification = CURRENT_TIMESTAMP
    WHERE token = $1
    RETURNING id
  `;

  const result = await pool.query(query, [token]);

  return result.rows.length > 0;
};

/**
 * Verificar si una sesion es valida
 * Retorna datos segun API-003 en 04_apis_lista.md: id, name, email, role, branch, permissions
 * @param {string} token - Token de la sesion
 * @returns {Promise<Object|null>} Datos de la sesion si es valida
 */
const validateSession = async (token) => {
  const query = `
    SELECT
      us.id,
      us.user_id,
      us.token,
      us.expires_at,
      us.is_valid,
      u.name,
      u.email,
      u.role_id,
      u.branch_id,
      r.name AS role_name,
      b.name AS branch_name,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'id', p.id,
            'name', p.name,
            'description', p.description,
            'module', p.module
          )
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS permissions
    FROM user_sessions us
    JOIN users u ON us.user_id = u.id
    JOIN roles r ON u.role_id = r.id
    LEFT JOIN branches b ON u.branch_id = b.id
    LEFT JOIN roles_permissions rp ON r.id = rp.role_id AND rp.status = 'active'
    LEFT JOIN permissions p ON rp.permission_id = p.id AND p.status = 'active'
    WHERE us.token = $1
      AND us.is_valid = true
      AND us.status = 'active'
      AND us.expires_at > CURRENT_TIMESTAMP
      AND u.is_active = true
      AND u.status = 'active'
    GROUP BY us.id, us.user_id, us.token, us.expires_at, us.is_valid, u.name, u.email, u.role_id, u.branch_id, r.name, b.name
  `;

  const result = await pool.query(query, [token]);

  return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = {
  findUserByEmail,
  findUserByName,
  findCustomerByUserId,
  createUserSession,
  invalidateSession,
  validateSession
};
