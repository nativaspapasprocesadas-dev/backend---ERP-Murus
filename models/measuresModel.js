/**
 * Measures Model - API-049, API-050, API-051, API-052
 * Segun diseno en 04_apis_lista.md
 * Tabla real: medidas (schema.prisma linea 174)
 */
const pool = require('../config/db');

/**
 * Listar medidas con paginacion - API-049
 * GET /api/v1/measures
 * @param {Object} params - Parametros de paginacion
 * @returns {Promise<Object>} Lista paginada de medidas
 */
const listMeasures = async ({ page = 1, pageSize = 20, includeInactive = true }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  // Filtro de status: incluir inactivas por defecto para permitir reactivarlas
  const statusFilter = includeInactive ? "status IN ('active', 'inactive')" : "status = 'active'";

  // Contar total
  const countQuery = `SELECT COUNT(*) AS total FROM medidas WHERE ${statusFilter}`;
  const countResult = await pool.query(countQuery);
  const total = parseInt(countResult.rows[0].total);

  // Obtener datos ordenados por nombre (sin mover al cambiar estado)
  const dataQuery = `
    SELECT
      id,
      nombre AS name,
      abreviatura AS abbreviation,
      factor_conversion AS "conversionFactor",
      status,
      date_time_registration AS "createdAt"
    FROM medidas
    WHERE ${statusFilter}
    ORDER BY nombre ASC
    LIMIT $1 OFFSET $2
  `;
  const dataResult = await pool.query(dataQuery, [pageSize, offset]);

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      abbreviation: row.abbreviation,
      conversionFactor: row.conversionFactor ? parseFloat(row.conversionFactor) : null,
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
 * Crear medida - API-050
 * POST /api/v1/measures
 * @param {Object} data - Datos de la medida
 * @returns {Promise<Object>} Medida creada
 */
const createMeasure = async ({ name, abbreviation, conversionFactor, isActive, userId }) => {
  // Verificar si ya existe una medida con el mismo nombre
  const checkQuery = `SELECT id FROM medidas WHERE LOWER(nombre) = LOWER($1) AND status = 'active'`;
  const checkResult = await pool.query(checkQuery, [name]);

  if (checkResult.rows.length > 0) {
    throw new Error('Ya existe una medida con ese nombre');
  }

  // Determinar el status inicial basado en isActive (por defecto true)
  const initialStatus = isActive === false ? 'inactive' : 'active';

  const insertQuery = `
    INSERT INTO medidas (nombre, abreviatura, factor_conversion, status, user_id_registration)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, nombre AS name, abreviatura AS abbreviation, factor_conversion AS "conversionFactor", status
  `;

  const result = await pool.query(insertQuery, [
    name,
    abbreviation || '',
    conversionFactor || null,
    initialStatus,
    userId
  ]);

  return {
    id: result.rows[0].id,
    name: result.rows[0].name,
    abbreviation: result.rows[0].abbreviation,
    conversionFactor: result.rows[0].conversionFactor ? parseFloat(result.rows[0].conversionFactor) : null,
    isActive: result.rows[0].status === 'active'
  };
};

/**
 * Actualizar medida - API-051
 * PUT /api/v1/measures/{id}
 * @param {number} id - ID de la medida
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} Medida actualizada
 */
const updateMeasure = async (id, { name, abbreviation, conversionFactor, isActive, userId }) => {
  // Verificar que existe (incluir inactivas para poder reactivarlas)
  const checkQuery = `SELECT id, status FROM medidas WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [id]);

  if (checkResult.rows.length === 0) {
    throw new Error('Medida no encontrada');
  }

  // Si se cambia el nombre, verificar que no exista otro con el mismo nombre
  if (name) {
    const duplicateCheck = `SELECT id FROM medidas WHERE LOWER(nombre) = LOWER($1) AND id != $2 AND status = 'active'`;
    const duplicateResult = await pool.query(duplicateCheck, [name, id]);
    if (duplicateResult.rows.length > 0) {
      throw new Error('Ya existe otra medida con ese nombre');
    }
  }

  const updateFields = [];
  const params = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updateFields.push(`nombre = $${paramIndex}`);
    params.push(name);
    paramIndex++;
  }
  if (abbreviation !== undefined) {
    updateFields.push(`abreviatura = $${paramIndex}`);
    params.push(abbreviation);
    paramIndex++;
  }
  if (conversionFactor !== undefined) {
    updateFields.push(`factor_conversion = $${paramIndex}`);
    params.push(conversionFactor);
    paramIndex++;
  }
  if (isActive !== undefined) {
    updateFields.push(`status = $${paramIndex}`);
    params.push(isActive ? 'active' : 'inactive');
    paramIndex++;
  }

  updateFields.push(`user_id_modification = $${paramIndex}`);
  params.push(userId);
  paramIndex++;

  updateFields.push(`date_time_modification = NOW()`);

  params.push(id);

  const updateQuery = `
    UPDATE medidas
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, nombre AS name, abreviatura AS abbreviation, factor_conversion AS "conversionFactor", status
  `;

  const result = await pool.query(updateQuery, params);

  return {
    id: result.rows[0].id,
    name: result.rows[0].name,
    abbreviation: result.rows[0].abbreviation,
    conversionFactor: result.rows[0].conversionFactor ? parseFloat(result.rows[0].conversionFactor) : null,
    isActive: result.rows[0].status === 'active'
  };
};

/**
 * Eliminar medida - API-052
 * DELETE /api/v1/measures/{id}
 * Soft delete: cambia status a 'deleted'
 * NO permite eliminar si tiene productos asociados (por configuracion del aplicativo)
 * @param {number} id - ID de la medida
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Resultado de eliminacion
 */
const deleteMeasure = async (id, userId) => {
  // Verificar que existe (incluir inactivas)
  const checkQuery = `SELECT id, nombre, status FROM medidas WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [id]);

  if (checkResult.rows.length === 0) {
    throw new Error('Medida no encontrada');
  }

  const measureName = checkResult.rows[0].nombre;

  // Si ya está eliminada, no hacer nada
  if (checkResult.rows[0].status === 'deleted') {
    return { success: true, message: 'La medida ya estaba eliminada' };
  }

  // Verificar que no tenga productos asociados (activos o inactivos)
  const productsCheck = `
    SELECT COUNT(*) AS count
    FROM productos
    WHERE medida_id = $1 AND status IN ('active', 'inactive')
  `;
  const productsResult = await pool.query(productsCheck, [id]);
  const productCount = parseInt(productsResult.rows[0].count);

  if (productCount > 0) {
    throw new Error(`No se puede eliminar la medida "${measureName}" porque tiene ${productCount} producto(s) asociado(s). Primero debe eliminar o reasignar los productos que usan esta medida.`);
  }

  // Soft delete (status = 'deleted' para que no aparezca en frontend)
  const deleteQuery = `
    UPDATE medidas
    SET status = 'deleted', user_id_modification = $1, date_time_modification = NOW()
    WHERE id = $2
  `;

  await pool.query(deleteQuery, [userId, id]);

  return { success: true };
};

/**
 * Obtener medida por ID
 * @param {number} id - ID de la medida
 * @returns {Promise<Object|null>} Medida encontrada
 */
const getMeasureById = async (id) => {
  // Incluir medidas inactivas para permitir reactivarlas
  const query = `
    SELECT
      id,
      nombre AS name,
      abreviatura AS abbreviation,
      factor_conversion AS "conversionFactor",
      status
    FROM medidas
    WHERE id = $1
  `;
  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    abbreviation: row.abbreviation,
    conversionFactor: row.conversionFactor ? parseFloat(row.conversionFactor) : null,
    isActive: row.status === 'active'
  };
};

module.exports = {
  listMeasures,
  createMeasure,
  updateMeasure,
  deleteMeasure,
  getMeasureById
};
