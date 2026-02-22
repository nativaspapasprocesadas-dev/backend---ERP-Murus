/**
 * Species Model - API-045, API-046, API-047, API-048
 * Segun diseno en 04_apis_lista.md
 * Tabla real: especies
 */
const pool = require('../config/db');

/**
 * Listar especies - API-045
 * @param {Object} params - Parametros de paginacion
 * @returns {Promise<Object>} Lista paginada de especies
 */
const listSpecies = async ({ page = 1, pageSize = 20, includeInactive = true }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  // Filtro de status: incluir inactivas por defecto para permitir reactivarlas
  const statusFilter = includeInactive ? "status IN ('active', 'inactive')" : "status = 'active'";

  // Query para contar total
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM especies
    WHERE ${statusFilter}
  `;
  const countResult = await pool.query(countQuery);
  const total = parseInt(countResult.rows[0].total);

  // Query para obtener datos ordenados por nombre (sin mover al cambiar estado)
  const dataQuery = `
    SELECT
      id,
      nombre AS name,
      descripcion AS description,
      status,
      date_time_registration AS "createdAt"
    FROM especies
    WHERE ${statusFilter}
    ORDER BY nombre ASC
    LIMIT $1 OFFSET $2
  `;

  const dataResult = await pool.query(dataQuery, [pageSize, offset]);

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
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
 * Crear especie - API-046
 * @param {Object} data - Datos de la especie
 * @returns {Promise<Object>} Especie creada
 */
const createSpecies = async ({ name, description, isActive, userId }) => {
  // Verificar que no exista una especie con el mismo nombre
  const checkQuery = `
    SELECT id FROM especies
    WHERE nombre = $1 AND status = 'active'
  `;
  const checkResult = await pool.query(checkQuery, [name]);

  if (checkResult.rows.length > 0) {
    throw new Error('Ya existe una especie con ese nombre');
  }

  // Determinar el status inicial basado en isActive (por defecto true)
  const initialStatus = isActive === false ? 'inactive' : 'active';

  const insertQuery = `
    INSERT INTO especies (nombre, descripcion, status, user_id_registration)
    VALUES ($1, $2, $3, $4)
    RETURNING id, nombre, descripcion, status, date_time_registration
  `;

  const result = await pool.query(insertQuery, [name, description, initialStatus, userId]);
  const row = result.rows[0];

  return {
    id: row.id,
    name: row.nombre,
    description: row.descripcion,
    isActive: row.status === 'active',
    createdAt: row.date_time_registration
  };
};

/**
 * Actualizar especie - API-047
 * @param {number} speciesId - ID de la especie
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} Especie actualizada
 */
const updateSpecies = async (speciesId, { name, description, isActive, userId }) => {
  // Verificar que la especie existe (incluir inactivas para poder reactivarlas)
  const checkQuery = `SELECT id, status FROM especies WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [speciesId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Especie no encontrada');
  }

  // Si se cambia el nombre, verificar que no exista otra con el mismo nombre
  if (name) {
    const nameCheck = `
      SELECT id FROM especies
      WHERE nombre = $1 AND id != $2 AND status = 'active'
    `;
    const nameResult = await pool.query(nameCheck, [name, speciesId]);
    if (nameResult.rows.length > 0) {
      throw new Error('Ya existe otra especie con ese nombre');
    }
  }

  // Construir query de actualizacion dinamica
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`nombre = $${paramIndex}`);
    params.push(name);
    paramIndex++;
  }
  if (description !== undefined) {
    updates.push(`descripcion = $${paramIndex}`);
    params.push(description);
    paramIndex++;
  }
  if (isActive !== undefined) {
    updates.push(`status = $${paramIndex}`);
    params.push(isActive ? 'active' : 'inactive');
    paramIndex++;
  }

  updates.push(`user_id_modification = $${paramIndex}`);
  params.push(userId);
  paramIndex++;

  updates.push('date_time_modification = NOW()');

  params.push(speciesId);

  const updateQuery = `
    UPDATE especies
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, nombre, descripcion, status, date_time_modification
  `;

  const result = await pool.query(updateQuery, params);
  const row = result.rows[0];

  return {
    id: row.id,
    name: row.nombre,
    description: row.descripcion,
    isActive: row.status === 'active',
    updatedAt: row.date_time_modification
  };
};

/**
 * Eliminar especie - API-048
 * Soft delete: cambia status a 'deleted'
 * NO permite eliminar si tiene productos asociados (por configuracion del aplicativo)
 * @param {number} speciesId - ID de la especie
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Resultado de eliminacion
 */
const deleteSpecies = async (speciesId, userId) => {
  // Verificar que la especie existe (incluir inactivas)
  const checkQuery = `SELECT id, nombre, status FROM especies WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [speciesId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Especie no encontrada');
  }

  const speciesName = checkResult.rows[0].nombre;

  // Si ya está eliminada, no hacer nada
  if (checkResult.rows[0].status === 'deleted') {
    return { success: true, message: 'La especie ya estaba eliminada' };
  }

  // Verificar que no tenga productos asociados (activos o inactivos)
  const productsCheck = `
    SELECT COUNT(*) AS count
    FROM productos
    WHERE especie_id = $1 AND status IN ('active', 'inactive')
  `;
  const productsResult = await pool.query(productsCheck, [speciesId]);
  const productCount = parseInt(productsResult.rows[0].count);

  if (productCount > 0) {
    throw new Error(`No se puede eliminar la especie "${speciesName}" porque tiene ${productCount} producto(s) asociado(s). Primero debe eliminar o reasignar los productos que usan esta especie.`);
  }

  // Soft delete (status = 'deleted' para que no aparezca en frontend)
  const deleteQuery = `
    UPDATE especies
    SET status = 'deleted', user_id_modification = $1, date_time_modification = NOW()
    WHERE id = $2
  `;

  await pool.query(deleteQuery, [userId, speciesId]);

  return { success: true };
};

/**
 * Obtener especie por ID
 * @param {number} id - ID de la especie
 * @returns {Promise<Object|null>} Especie encontrada
 */
const getSpeciesById = async (id) => {
  // Incluir especies inactivas para permitir reactivarlas
  const query = `
    SELECT
      id,
      nombre AS name,
      descripcion AS description,
      status
    FROM especies
    WHERE id = $1
  `;
  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.status === 'active'
  };
};

module.exports = {
  listSpecies,
  createSpecies,
  updateSpecies,
  deleteSpecies,
  getSpeciesById
};
