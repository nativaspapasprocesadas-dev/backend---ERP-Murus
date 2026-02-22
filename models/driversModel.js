/**
 * Drivers Model - API-032, API-033, API-034, API-035
 * Tabla real: choferes
 *
 * NOTA IMPORTANTE: Los choferes NO son usuarios del sistema.
 * Son registros internos para control y asignación a rutas.
 * NO pueden iniciar sesión.
 *
 * Campos de la tabla choferes:
 * - id: ID único
 * - nombre: Nombre del chofer
 * - telefono: Teléfono del chofer
 * - licencia: Número de licencia de conducir
 * - fecha_vencimiento_lic: Fecha de vencimiento de la licencia
 * - branch_id: Sede a la que pertenece
 * - is_active: Si está activo
 * - status: Estado del registro
 */
const pool = require('../config/db');

/**
 * Listar choferes con paginacion y filtros - API-032
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Object>} Lista paginada de choferes
 */
const listDrivers = async ({ page = 1, pageSize = 20, search, isActive, branchId, userBranchId, roleName }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  let whereConditions = ["c.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  // Filtro por sede según rol
  if (roleName !== 'SUPERADMINISTRADOR' && userBranchId) {
    whereConditions.push(`c.branch_id = $${paramIndex}`);
    params.push(userBranchId);
    paramIndex++;
  } else if (branchId) {
    whereConditions.push(`c.branch_id = $${paramIndex}`);
    params.push(branchId);
    paramIndex++;
  }

  // Filtro por estado activo
  if (isActive !== undefined && isActive !== null && isActive !== '') {
    const isActiveBool = isActive === 'true' || isActive === true;
    whereConditions.push(`c.is_active = $${paramIndex}`);
    params.push(isActiveBool);
    paramIndex++;
  }

  // Filtro de búsqueda
  if (search) {
    whereConditions.push(`(c.nombre ILIKE $${paramIndex} OR c.licencia ILIKE $${paramIndex} OR c.telefono ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Estadísticas
  const statsQuery = `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE c.is_active = true) AS active,
      COUNT(*) FILTER (WHERE c.is_active = false) AS inactive
    FROM choferes c
    ${whereClause.replace(/ AND c\.is_active = \$\d+/, '')}
  `;
  const statsParams = params.filter((_, i) => {
    // Filtrar el parámetro de isActive para las stats
    return true;
  }).slice(0, isActive !== undefined ? params.length - 1 : params.length);

  let statsResult;
  try {
    statsResult = await pool.query(statsQuery, branchId || userBranchId ? [branchId || userBranchId] : []);
  } catch {
    statsResult = { rows: [{ total: 0, active: 0, inactive: 0 }] };
  }
  const statsRow = statsResult.rows[0] || { total: 0, active: 0, inactive: 0 };

  // Contar total
  const countQuery = `SELECT COUNT(*) AS total FROM choferes c ${whereClause}`;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Obtener datos con estadísticas de rutas
  const dataQuery = `
    SELECT
      c.id,
      c.nombre AS name,
      c.telefono AS phone,
      c.licencia AS license,
      c.fecha_vencimiento_lic AS "licenseExpiry",
      c.notas AS notes,
      c.branch_id AS "branchId",
      b.name AS "branchName",
      c.is_active AS "isActive",
      c.date_time_registration AS "createdAt",
      (
        SELECT COUNT(*) FROM rutas_diarias rd
        WHERE rd.chofer_id = c.id AND rd.status = 'active'
      ) AS "totalRoutes",
      (
        SELECT COUNT(*) FROM rutas_diarias rd
        WHERE rd.chofer_id = c.id AND rd.estado = 'completada' AND rd.status = 'active'
      ) AS "completedRoutes"
    FROM choferes c
    LEFT JOIN branches b ON c.branch_id = b.id
    ${whereClause}
    ORDER BY c.nombre ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      license: row.license,
      licenseExpiry: row.licenseExpiry,
      notes: row.notes || '',
      branchId: row.branchId,
      branchName: row.branchName,
      isActive: row.isActive,
      createdAt: row.createdAt,
      statistics: {
        totalRoutes: parseInt(row.totalRoutes) || 0,
        completedRoutes: parseInt(row.completedRoutes) || 0
      }
    })),
    stats: {
      total: parseInt(statsRow.total) || 0,
      active: parseInt(statsRow.active) || 0,
      inactive: parseInt(statsRow.inactive) || 0
    },
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
};

/**
 * Obtener chofer por ID
 * @param {number} driverId - ID del chofer
 * @returns {Promise<Object|null>} Datos del chofer
 */
const getDriverById = async (driverId) => {
  const query = `
    SELECT
      c.id,
      c.nombre AS name,
      c.telefono AS phone,
      c.licencia AS license,
      c.fecha_vencimiento_lic AS "licenseExpiry",
      c.notas AS notes,
      c.branch_id AS "branchId",
      b.name AS "branchName",
      c.is_active AS "isActive",
      c.date_time_registration AS "createdAt",
      c.date_time_modification AS "updatedAt"
    FROM choferes c
    LEFT JOIN branches b ON c.branch_id = b.id
    WHERE c.id = $1 AND c.status = 'active'
  `;
  const result = await pool.query(query, [driverId]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    license: row.license,
    licenseExpiry: row.licenseExpiry,
    notes: row.notes || '',
    branchId: row.branchId,
    branchName: row.branchName,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
};

/**
 * Crear nuevo chofer - API-033
 * NO crea usuario, solo registro en tabla choferes
 * @param {Object} driverData - Datos del nuevo chofer
 * @returns {Promise<Object>} Chofer creado
 */
const createDriver = async ({ name, phone, license, licenseExpiry, notes, branchId, registrationUserId }) => {
  // Validar campos requeridos
  if (!name) {
    throw new Error('El nombre es requerido');
  }
  if (!branchId) {
    throw new Error('La sede es requerida');
  }

  // Verificar licencia única si se proporciona
  if (license) {
    const checkLicense = await pool.query(
      "SELECT id FROM choferes WHERE licencia = $1 AND status = 'active'",
      [license]
    );
    if (checkLicense.rows.length > 0) {
      throw new Error('La licencia ya está registrada para otro chofer');
    }
  }

  // Insertar chofer
  const insertQuery = `
    INSERT INTO choferes (nombre, telefono, licencia, fecha_vencimiento_lic, notas, branch_id, is_active, status, user_id_registration, date_time_registration)
    VALUES ($1, $2, $3, $4, $5, $6, true, 'active', $7, NOW())
    RETURNING id, nombre, telefono, licencia, fecha_vencimiento_lic, notas, branch_id, is_active, date_time_registration
  `;

  const result = await pool.query(insertQuery, [
    name,
    phone || null,
    license || null,
    licenseExpiry || null,
    notes || null,
    branchId,
    registrationUserId
  ]);

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.nombre,
    phone: row.telefono,
    license: row.licencia,
    licenseExpiry: row.fecha_vencimiento_lic,
    notes: row.notas || '',
    branchId: row.branch_id,
    isActive: row.is_active,
    createdAt: row.date_time_registration
  };
};

/**
 * Actualizar chofer - API-034
 * @param {number} driverId - ID del chofer
 * @param {Object} updateData - Datos a actualizar
 * @returns {Promise<Object>} Chofer actualizado
 */
const updateDriver = async (driverId, { name, phone, license, licenseExpiry, notes, isActive, branchId }, modUserId) => {
  // Verificar que el chofer existe
  const checkQuery = "SELECT id, licencia FROM choferes WHERE id = $1 AND status = 'active'";
  const checkResult = await pool.query(checkQuery, [driverId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Chofer no encontrado');
  }

  const currentDriver = checkResult.rows[0];

  // Si se proporciona licencia diferente, verificar que sea única
  if (license && license !== currentDriver.licencia) {
    const checkLicense = await pool.query(
      "SELECT id FROM choferes WHERE licencia = $1 AND id != $2 AND status = 'active'",
      [license, driverId]
    );
    if (checkLicense.rows.length > 0) {
      throw new Error('La licencia ya está registrada para otro chofer');
    }
  }

  // Construir actualización dinámica
  const updateFields = [];
  const updateParams = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updateFields.push(`nombre = $${paramIndex}`);
    updateParams.push(name);
    paramIndex++;
  }
  if (phone !== undefined) {
    updateFields.push(`telefono = $${paramIndex}`);
    updateParams.push(phone);
    paramIndex++;
  }
  if (license !== undefined) {
    updateFields.push(`licencia = $${paramIndex}`);
    updateParams.push(license);
    paramIndex++;
  }
  if (licenseExpiry !== undefined) {
    updateFields.push(`fecha_vencimiento_lic = $${paramIndex}`);
    updateParams.push(licenseExpiry);
    paramIndex++;
  }
  if (notes !== undefined) {
    updateFields.push(`notas = $${paramIndex}`);
    updateParams.push(notes);
    paramIndex++;
  }
  if (isActive !== undefined) {
    updateFields.push(`is_active = $${paramIndex}`);
    updateParams.push(isActive);
    paramIndex++;
  }
  if (branchId !== undefined) {
    updateFields.push(`branch_id = $${paramIndex}`);
    updateParams.push(branchId);
    paramIndex++;
  }

  if (updateFields.length === 0) {
    return await getDriverById(driverId);
  }

  // Agregar campos de auditoría
  updateFields.push(`user_id_modification = $${paramIndex}`);
  updateParams.push(modUserId);
  paramIndex++;
  updateFields.push(`date_time_modification = NOW()`);

  // Ejecutar actualización
  updateParams.push(driverId);
  const updateQuery = `
    UPDATE choferes
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
  `;

  await pool.query(updateQuery, updateParams);

  return await getDriverById(driverId);
};

/**
 * Eliminar chofer (soft delete) - API-035
 * @param {number} driverId - ID del chofer
 * @param {number} modUserId - ID del usuario que realiza la eliminación
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
const deleteDriver = async (driverId, modUserId) => {
  // Verificar que el chofer existe
  const checkQuery = "SELECT id FROM choferes WHERE id = $1 AND status = 'active'";
  const checkResult = await pool.query(checkQuery, [driverId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Chofer no encontrado');
  }

  // Verificar que no tenga rutas activas asignadas
  const routesQuery = `
    SELECT COUNT(*) as active_routes
    FROM rutas_diarias
    WHERE chofer_id = $1
    AND estado IN ('abierta', 'enviada')
    AND status = 'active'
  `;
  const routesResult = await pool.query(routesQuery, [driverId]);

  if (parseInt(routesResult.rows[0].active_routes) > 0) {
    throw new Error('No se puede eliminar el chofer porque tiene rutas activas asignadas');
  }

  // Soft delete
  const deleteQuery = `
    UPDATE choferes
    SET status = 'inactive',
        is_active = false,
        user_id_modification = $1,
        date_time_modification = NOW()
    WHERE id = $2
  `;

  await pool.query(deleteQuery, [modUserId, driverId]);
  return { success: true };
};

/**
 * Obtener choferes disponibles para asignar a rutas
 * @param {number} branchId - ID de la sede
 * @returns {Promise<Array>} Lista de choferes disponibles
 */
const getAvailableDrivers = async (branchId) => {
  const query = `
    SELECT
      c.id,
      c.nombre AS name,
      c.telefono AS phone,
      c.licencia AS license
    FROM choferes c
    WHERE c.branch_id = $1
      AND c.status = 'active'
      AND c.is_active = true
    ORDER BY c.nombre ASC
  `;

  const result = await pool.query(query, [branchId]);
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    license: row.license
  }));
};

module.exports = {
  listDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  getAvailableDrivers
};
