/**
 * Presentations Model - API-053, API-054, API-055, API-056
 * Segun diseno en 04_apis_lista.md
 * Tabla real: presentaciones (schema.prisma linea 191)
 */
const pool = require('../config/db');

/**
 * Listar presentaciones con paginacion - API-053
 * GET /api/v1/presentations
 * @param {Object} params - Parametros de paginacion
 * @returns {Promise<Object>} Lista paginada de presentaciones
 */
const listPresentations = async ({ page = 1, pageSize = 20, includeInactive = true }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  // Filtro de status: incluir inactivas por defecto para permitir reactivarlas
  const statusFilter = includeInactive ? "status IN ('active', 'inactive')" : "status = 'active'";

  // Contar total
  const countQuery = `SELECT COUNT(*) AS total FROM presentaciones WHERE ${statusFilter}`;
  const countResult = await pool.query(countQuery);
  const total = parseInt(countResult.rows[0].total);

  // Obtener datos ordenados por nombre (sin mover al cambiar estado)
  const dataQuery = `
    SELECT
      id,
      nombre AS name,
      descripcion AS description,
      peso AS weight,
      status,
      date_time_registration AS "createdAt"
    FROM presentaciones
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
      weight: row.weight ? parseFloat(row.weight) : 1,
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
 * Crear presentacion - API-054
 * POST /api/v1/presentations
 * @param {Object} data - Datos de la presentacion
 * @returns {Promise<Object>} Presentacion creada
 */
const createPresentation = async ({ name, description, weight, isActive, userId }) => {
  // Verificar si ya existe una presentacion con el mismo nombre
  const checkQuery = `SELECT id FROM presentaciones WHERE LOWER(nombre) = LOWER($1) AND status = 'active'`;
  const checkResult = await pool.query(checkQuery, [name]);

  if (checkResult.rows.length > 0) {
    throw new Error('Ya existe una presentacion con ese nombre');
  }

  // Determinar el status inicial basado en isActive (por defecto true)
  const initialStatus = isActive === false ? 'inactive' : 'active';

  const insertQuery = `
    INSERT INTO presentaciones (nombre, descripcion, peso, status, user_id_registration)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, nombre AS name, descripcion AS description, peso AS weight, status
  `;

  const result = await pool.query(insertQuery, [
    name,
    description || null,
    weight || 1,
    initialStatus,
    userId
  ]);

  return {
    id: result.rows[0].id,
    name: result.rows[0].name,
    description: result.rows[0].description,
    weight: result.rows[0].weight ? parseFloat(result.rows[0].weight) : 1,
    isActive: result.rows[0].status === 'active'
  };
};

/**
 * Actualizar presentacion - API-055
 * PUT /api/v1/presentations/{id}
 * @param {number} id - ID de la presentacion
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} Presentacion actualizada
 */
const updatePresentation = async (id, { name, description, weight, isActive, userId }) => {
  // Verificar que existe (incluir inactivas para poder reactivarlas)
  const checkQuery = `SELECT id, status FROM presentaciones WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [id]);

  if (checkResult.rows.length === 0) {
    throw new Error('Presentacion no encontrada');
  }

  // Si se cambia el nombre, verificar que no exista otra con el mismo nombre
  if (name) {
    const duplicateCheck = `SELECT id FROM presentaciones WHERE LOWER(nombre) = LOWER($1) AND id != $2 AND status = 'active'`;
    const duplicateResult = await pool.query(duplicateCheck, [name, id]);
    if (duplicateResult.rows.length > 0) {
      throw new Error('Ya existe otra presentacion con ese nombre');
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
  if (description !== undefined) {
    updateFields.push(`descripcion = $${paramIndex}`);
    params.push(description);
    paramIndex++;
  }
  if (weight !== undefined) {
    updateFields.push(`peso = $${paramIndex}`);
    params.push(weight);
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
    UPDATE presentaciones
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, nombre AS name, descripcion AS description, peso AS weight, status
  `;

  const result = await pool.query(updateQuery, params);

  return {
    id: result.rows[0].id,
    name: result.rows[0].name,
    description: result.rows[0].description,
    weight: result.rows[0].weight ? parseFloat(result.rows[0].weight) : 1,
    isActive: result.rows[0].status === 'active'
  };
};

/**
 * Eliminar presentacion - API-056
 * DELETE /api/v1/presentations/{id}
 * Soft delete: cambia status a 'deleted'
 * NO permite eliminar si tiene productos asociados (por configuracion del aplicativo)
 * @param {number} id - ID de la presentacion
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Resultado de eliminacion
 */
const deletePresentation = async (id, userId) => {
  // Verificar que existe (incluir inactivas)
  const checkQuery = `SELECT id, nombre, status FROM presentaciones WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [id]);

  if (checkResult.rows.length === 0) {
    throw new Error('Presentacion no encontrada');
  }

  const presentationName = checkResult.rows[0].nombre;

  // Si ya está eliminada, no hacer nada
  if (checkResult.rows[0].status === 'deleted') {
    return { success: true, message: 'La presentacion ya estaba eliminada' };
  }

  // Verificar que no tenga productos asociados (activos o inactivos)
  const productsCheck = `
    SELECT COUNT(*) AS count
    FROM productos
    WHERE presentacion_id = $1 AND status IN ('active', 'inactive')
  `;
  const productsResult = await pool.query(productsCheck, [id]);
  const productCount = parseInt(productsResult.rows[0].count);

  if (productCount > 0) {
    throw new Error(`No se puede eliminar la presentación "${presentationName}" porque tiene ${productCount} producto(s) asociado(s). Primero debe eliminar o reasignar los productos que usan esta presentación.`);
  }

  // Soft delete (status = 'deleted' para que no aparezca en frontend)
  const deleteQuery = `
    UPDATE presentaciones
    SET status = 'deleted', user_id_modification = $1, date_time_modification = NOW()
    WHERE id = $2
  `;

  await pool.query(deleteQuery, [userId, id]);

  return { success: true };
};

/**
 * Obtener presentacion por ID
 * @param {number} id - ID de la presentacion
 * @returns {Promise<Object|null>} Presentacion encontrada
 */
const getPresentationById = async (id) => {
  // Incluir presentaciones inactivas para permitir reactivarlas
  const query = `
    SELECT
      id,
      nombre AS name,
      descripcion AS description,
      peso AS weight,
      status
    FROM presentaciones
    WHERE id = $1
  `;
  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    weight: row.weight ? parseFloat(row.weight) : 1,
    isActive: row.status === 'active'
  };
};

module.exports = {
  listPresentations,
  createPresentation,
  updatePresentation,
  deletePresentation,
  getPresentationById
};
