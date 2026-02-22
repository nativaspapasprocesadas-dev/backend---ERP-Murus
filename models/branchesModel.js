/**
 * Branches Model - API-071, API-072, API-073, API-074
 * Segun diseno en 04_apis_lista.md linea 4522
 * Tabla: branches (schema.prisma linea 10)
 */
const pool = require('../config/db');

/**
 * Listar sedes con paginacion y filtros - API-071
 * @param {Object} params - Parametros de filtro y paginacion
 * @returns {Promise<Object>} Lista paginada de sedes
 */
const listBranches = async ({ page = 1, pageSize = 20, isActive, includeInactive = false }) => {
  // Validar pageSize maximo 100
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  let whereConditions = [];
  const params = [];
  let paramIndex = 1;

  // Filtro por isActive - si se especifica, filtrar por ese estado
  // Si includeInactive es true, devolver todas las sedes
  if (isActive !== undefined && !includeInactive) {
    const activeStatus = isActive === true || isActive === 'true';
    whereConditions.push(`status = $${paramIndex}`);
    params.push(activeStatus ? 'active' : 'inactive');
    paramIndex++;
  } else if (!includeInactive && isActive === undefined) {
    // Comportamiento por defecto: solo activas (para compatibilidad)
    whereConditions.push(`status = 'active'`);
  }
  // Si includeInactive es true, no se aplica filtro de status

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Query para contar total
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM branches
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Query para obtener datos
  const dataQuery = `
    SELECT
      id,
      name,
      code,
      address,
      phone,
      email,
      manager,
      is_main AS "isMain",
      color,
      status,
      date_time_registration AS "createdAt"
    FROM branches
    ${whereClause}
    ORDER BY name ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      code: row.code,
      address: row.address,
      phone: row.phone,
      email: row.email,
      manager: row.manager,
      isMain: row.isMain,
      color: row.color,
      isActive: row.status === 'active',
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
 * Crear sede - API-072
 * @param {Object} branchData - Datos de la sede
 * @param {number} userId - ID del usuario que crea
 * @returns {Promise<Object>} Sede creada
 */
const createBranch = async ({ name, code, address, phone, email, manager, isMain, color }, userId) => {
  // Verificar que el nombre no exista
  const checkNameQuery = `SELECT id FROM branches WHERE name = $1 AND status = 'active'`;
  const checkNameResult = await pool.query(checkNameQuery, [name]);

  if (checkNameResult.rows.length > 0) {
    throw new Error('Ya existe una sede con ese nombre');
  }

  // Verificar que el codigo no exista
  if (code) {
    const checkCodeQuery = `SELECT id FROM branches WHERE code = $1`;
    const checkCodeResult = await pool.query(checkCodeQuery, [code]);

    if (checkCodeResult.rows.length > 0) {
      throw new Error('Ya existe una sede con ese codigo');
    }
  }

  // Generar codigo si no se proporciona
  const finalCode = code || `BR-${Date.now().toString(36).toUpperCase()}`;

  const insertQuery = `
    INSERT INTO branches (
      name, code, address, phone, email, manager, is_main, color, status, user_id_registration
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)
    RETURNING id, name, code, address, phone, email, manager, is_main AS "isMain", color, status, date_time_registration AS "createdAt"
  `;

  const result = await pool.query(insertQuery, [
    name, finalCode, address || null, phone || null, email || null,
    manager || null, isMain || false, color || null, userId
  ]);

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    phone: row.phone,
    email: row.email,
    manager: row.manager,
    isMain: row.isMain,
    color: row.color,
    isActive: row.status === 'active',
    createdAt: row.createdAt
  };
};

/**
 * Actualizar sede - API-073
 * @param {number} branchId - ID de la sede
 * @param {Object} branchData - Datos a actualizar
 * @param {number} userId - ID del usuario que actualiza
 * @returns {Promise<Object>} Sede actualizada
 */
const updateBranch = async (branchId, { name, address, phone, email, manager, isMain, color, isActive }, userId) => {
  // Verificar que la sede existe
  const checkQuery = `SELECT id, name FROM branches WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [branchId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Sede no encontrada');
  }

  // Si se cambia el nombre, verificar que no exista otro con ese nombre
  if (name && name !== checkResult.rows[0].name) {
    const checkNameQuery = `SELECT id FROM branches WHERE name = $1 AND id != $2 AND status = 'active'`;
    const checkNameResult = await pool.query(checkNameQuery, [name, branchId]);

    if (checkNameResult.rows.length > 0) {
      throw new Error('Ya existe otra sede con ese nombre');
    }
  }

  // Construir query de actualizacion dinamica
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    params.push(name);
    paramIndex++;
  }
  if (address !== undefined) {
    updates.push(`address = $${paramIndex}`);
    params.push(address);
    paramIndex++;
  }
  if (phone !== undefined) {
    updates.push(`phone = $${paramIndex}`);
    params.push(phone);
    paramIndex++;
  }
  if (email !== undefined) {
    updates.push(`email = $${paramIndex}`);
    params.push(email);
    paramIndex++;
  }
  if (manager !== undefined) {
    updates.push(`manager = $${paramIndex}`);
    params.push(manager);
    paramIndex++;
  }
  if (isMain !== undefined) {
    updates.push(`is_main = $${paramIndex}`);
    params.push(isMain);
    paramIndex++;
  }
  if (color !== undefined) {
    updates.push(`color = $${paramIndex}`);
    params.push(color);
    paramIndex++;
  }
  if (isActive !== undefined) {
    updates.push(`status = $${paramIndex}`);
    params.push(isActive ? 'active' : 'inactive');
    paramIndex++;
  }

  // Agregar campos de auditoria
  updates.push(`user_id_modification = $${paramIndex}`);
  params.push(userId);
  paramIndex++;

  updates.push(`date_time_modification = NOW()`);

  // Agregar ID al final
  params.push(branchId);

  const updateQuery = `
    UPDATE branches
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, name, code, address, phone, email, manager, is_main AS "isMain", color, status, date_time_registration AS "createdAt"
  `;

  const result = await pool.query(updateQuery, params);
  const row = result.rows[0];

  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    phone: row.phone,
    email: row.email,
    manager: row.manager,
    isMain: row.isMain,
    color: row.color,
    isActive: row.status === 'active',
    createdAt: row.createdAt
  };
};

/**
 * Eliminar sede - API-074
 * @param {number} branchId - ID de la sede
 * @param {number} userId - ID del usuario que elimina
 * @returns {Promise<Object>} Resultado de eliminacion
 */
const deleteBranch = async (branchId, userId) => {
  // Verificar que la sede existe
  const checkQuery = `SELECT id FROM branches WHERE id = $1 AND status = 'active'`;
  const checkResult = await pool.query(checkQuery, [branchId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Sede no encontrada');
  }

  // Verificar que no tenga usuarios activos asociados
  const checkUsersQuery = `SELECT COUNT(*) AS count FROM users WHERE branch_id = $1 AND is_active = true`;
  const checkUsersResult = await pool.query(checkUsersQuery, [branchId]);

  if (parseInt(checkUsersResult.rows[0].count) > 0) {
    throw new Error('No se puede eliminar la sede porque tiene usuarios activos asociados');
  }

  // Soft delete (cambiar status a inactive)
  const deleteQuery = `
    UPDATE branches
    SET status = 'inactive',
        user_id_modification = $1,
        date_time_modification = NOW()
    WHERE id = $2
    RETURNING id
  `;

  await pool.query(deleteQuery, [userId, branchId]);

  return {
    success: true
  };
};

/**
 * Obtener sede por ID
 * @param {number} branchId - ID de la sede
 * @returns {Promise<Object|null>} Sede o null
 */
const getBranchById = async (branchId) => {
  const query = `
    SELECT
      id,
      name,
      code,
      address,
      phone,
      email,
      manager,
      is_main AS "isMain",
      color,
      status,
      date_time_registration AS "createdAt"
    FROM branches
    WHERE id = $1
  `;

  const result = await pool.query(query, [branchId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    address: row.address,
    phone: row.phone,
    email: row.email,
    manager: row.manager,
    isMain: row.isMain,
    color: row.color,
    isActive: row.status === 'active',
    createdAt: row.createdAt
  };
};

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchById
};
