/**
 * Announcements Model - API-005, API-027, API-028, API-029, API-030, API-031
 * Segun diseno en 04_apis_lista.md lineas 246-300, 1819-2062
 * Tablas reales: comunicados, comunicado_destinatarios, comunicado_lecturas
 */
const pool = require('../config/db');

/**
 * Obtener comunicados no leidos para un usuario - API-005
 * IMPORTANTE: Solo los CLIENTES reciben comunicados.
 * Administradores, coordinadores y producción NO deben ver comunicados en su dashboard.
 * @param {number} userId - ID del usuario
 * @returns {Promise<Array>} Lista de comunicados no leidos (vacía si no es cliente)
 */
const getUnreadAnnouncements = async (userId) => {
  // Primero obtener customer_id - solo clientes tienen registro en customers
  const customerQuery = `SELECT id FROM customers WHERE user_id = $1 AND status = 'active'`;
  const customerResult = await pool.query(customerQuery, [userId]);

  // Si el usuario NO es cliente (no tiene customer asociado), retornar lista vacía
  // Los comunicados son SOLO para clientes
  if (customerResult.rows.length === 0) {
    return [];
  }

  const customerId = customerResult.rows[0].id;

  // Obtener comunicados donde el cliente es destinatario específico y no los ha leído
  const query = `
    SELECT DISTINCT
      c.id,
      c.titulo AS title,
      c.contenido AS message,
      CASE WHEN c.es_urgente THEN 'ALTA' ELSE 'MEDIA' END AS priority,
      c.tipo AS type,
      c.imagen_url AS "imageUrl",
      c.date_time_registration AS "createdAt",
      c.es_urgente,
      c.fecha_publicacion
    FROM comunicados c
    INNER JOIN comunicado_destinatarios cd ON c.id = cd.comunicado_id AND cd.status = 'active'
    LEFT JOIN comunicado_lecturas cl ON c.id = cl.comunicado_id AND cl.customer_id = $1 AND cl.status = 'active'
    WHERE c.status = 'active'
      AND cd.customer_id = $1
      AND cl.id IS NULL
    ORDER BY c.es_urgente DESC, c.fecha_publicacion DESC
  `;

  const result = await pool.query(query, [customerId]);
  return result.rows;
};

/**
 * Marcar comunicado como leido para un usuario - API-031
 * POST /api/v1/announcements/{id}/read
 * Tabla: comunicado_lecturas (linea 513 schema.prisma)
 * @param {number} comunicadoId - ID del comunicado
 * @param {number} customerId - ID del customer (no user_id)
 * @returns {Promise<Object>} Resultado de la operacion
 */
const markAnnouncementAsRead = async (comunicadoId, customerId) => {
  // Verificar que el comunicado existe
  const checkQuery = `
    SELECT id FROM comunicados WHERE id = $1 AND status = 'active'
  `;
  const checkResult = await pool.query(checkQuery, [comunicadoId]);
  if (checkResult.rows.length === 0) {
    return { success: false, error: 'Comunicado no encontrado' };
  }

  // Verificar si ya esta marcado como leido (idempotente)
  const existsQuery = `
    SELECT id FROM comunicado_lecturas
    WHERE comunicado_id = $1 AND customer_id = $2 AND status = 'active'
  `;
  const existsResult = await pool.query(existsQuery, [comunicadoId, customerId]);

  if (existsResult.rows.length > 0) {
    // Ya esta marcado como leido, retornar exito (idempotente)
    return { success: true, alreadyRead: true };
  }

  // Insertar registro de lectura
  const insertQuery = `
    INSERT INTO comunicado_lecturas (comunicado_id, customer_id, fecha_lectura, status, date_time_registration)
    VALUES ($1, $2, NOW(), 'active', NOW())
    RETURNING id
  `;
  await pool.query(insertQuery, [comunicadoId, customerId]);

  return { success: true, alreadyRead: false };
};

/**
 * Listar comunicados - API-027
 * GET /api/v1/announcements
 * @param {Object} params - Filtros y paginacion
 * @param {Object} user - Usuario autenticado
 * @returns {Promise<Object>} Lista paginada de comunicados
 */
const listAnnouncements = async ({ page = 1, pageSize = 20, priority }, user) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  let whereConditions = ["c.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  // Si es CLIENTE, solo ver comunicados donde es destinatario
  if (user.role_name === 'CLIENTE') {
    // Obtener customer_id
    const customerQuery = `SELECT id FROM customers WHERE user_id = $1 AND status = 'active'`;
    const customerResult = await pool.query(customerQuery, [user.id]);
    if (customerResult.rows.length > 0) {
      const customerId = customerResult.rows[0].id;
      whereConditions.push(`EXISTS (SELECT 1 FROM comunicado_destinatarios cd WHERE cd.comunicado_id = c.id AND cd.customer_id = ${customerId})`);
    }
  } else if (user.branch_id && user.role_name !== 'SUPERADMINISTRADOR') {
    // ADMIN/COORDINADOR ve comunicados de su sede
    whereConditions.push(`(c.branch_id = $${paramIndex} OR c.branch_id IS NULL)`);
    params.push(user.branch_id);
    paramIndex++;
  }

  if (priority) {
    if (priority === 'ALTA') {
      whereConditions.push(`c.es_urgente = true`);
    } else {
      whereConditions.push(`c.es_urgente = false`);
    }
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Contar total
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM comunicados c
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Obtener comunicados
  const dataQuery = `
    SELECT
      c.id,
      c.titulo AS title,
      c.contenido AS message,
      CASE WHEN c.es_urgente THEN 'ALTA' ELSE 'MEDIA' END AS priority,
      c.tipo AS type,
      c.imagen_url AS "imageUrl",
      c.date_time_registration AS "createdAt",
      u.name AS "creatorName",
      (SELECT COUNT(*) FROM comunicado_destinatarios cd WHERE cd.comunicado_id = c.id AND cd.status = 'active') AS "recipientCount"
    FROM comunicados c
    LEFT JOIN users u ON c.user_id_autor = u.id
    ${whereClause}
    ORDER BY c.es_urgente DESC, c.fecha_publicacion DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  params.push(pageSize, offset);
  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      message: row.message,
      priority: row.priority,
      type: row.type,
      imageUrl: row.imageUrl,
      createdAt: row.createdAt,
      creatorName: row.creatorName || 'Sistema',
      recipientCount: parseInt(row.recipientCount) || 0
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
 * Crear comunicado - API-028
 * POST /api/v1/announcements
 * @param {Object} data - Datos del comunicado
 * @param {number} userId - ID del usuario creador
 * @returns {Promise<Object>} Comunicado creado
 */
const createAnnouncement = async ({ title, message, priority, imageUrl, recipientIds, branchId }, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Validar campos requeridos
    if (!title || title.length > 200) {
      throw new Error('titulo es requerido y debe tener maximo 200 caracteres');
    }
    if (!message) {
      throw new Error('message es requerido');
    }
    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      throw new Error('recipientIds es requerido y debe ser un array no vacio');
    }

    const esUrgente = priority === 'ALTA';
    const tipo = priority === 'ALTA' ? 'URGENTE' : 'INFORMATIVO';

    // Insertar comunicado (con imagen_url)
    const insertQuery = `
      INSERT INTO comunicados (
        titulo, contenido, tipo, branch_id, user_id_autor,
        es_urgente, imagen_url, user_id_registration
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $5)
      RETURNING id, date_time_registration
    `;

    const result = await client.query(insertQuery, [
      title, message, tipo, branchId || null, userId, esUrgente, imageUrl || null
    ]);

    const comunicadoId = result.rows[0].id;

    // Insertar destinatarios
    for (const recipientId of recipientIds) {
      await client.query(`
        INSERT INTO comunicado_destinatarios (comunicado_id, customer_id, user_id_registration)
        VALUES ($1, $2, $3)
      `, [comunicadoId, recipientId, userId]);
    }

    await client.query('COMMIT');

    return {
      id: comunicadoId,
      recipientCount: recipientIds.length
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Actualizar comunicado - API-029
 * PUT /api/v1/announcements/:id
 * @param {number} comunicadoId - ID del comunicado
 * @param {Object} data - Datos a actualizar
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Comunicado actualizado
 */
const updateAnnouncement = async (comunicadoId, { title, message, priority, imageUrl }, userId) => {
  // Verificar que el comunicado existe
  const checkQuery = `SELECT id FROM comunicados WHERE id = $1 AND status = 'active'`;
  const checkResult = await pool.query(checkQuery, [comunicadoId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Comunicado no encontrado');
  }

  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (title !== undefined) {
    updates.push(`titulo = $${paramIndex}`);
    params.push(title);
    paramIndex++;
  }
  if (message !== undefined) {
    updates.push(`contenido = $${paramIndex}`);
    params.push(message);
    paramIndex++;
  }
  if (priority !== undefined) {
    updates.push(`es_urgente = $${paramIndex}`);
    params.push(priority === 'ALTA');
    paramIndex++;
  }
  // imageUrl puede ser: undefined (no cambiar), null (eliminar), o string (nueva imagen)
  if (imageUrl !== undefined) {
    updates.push(`imagen_url = $${paramIndex}`);
    params.push(imageUrl);
    paramIndex++;
  }

  if (updates.length === 0) {
    return { id: comunicadoId };
  }

  updates.push(`user_id_modification = $${paramIndex}`);
  params.push(userId);
  paramIndex++;

  updates.push(`date_time_modification = NOW()`);

  params.push(comunicadoId);

  const updateQuery = `
    UPDATE comunicados
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id
  `;

  const result = await pool.query(updateQuery, params);

  return {
    id: result.rows[0].id
  };
};

/**
 * Eliminar comunicado - API-030
 * DELETE /api/v1/announcements/:id
 * @param {number} comunicadoId - ID del comunicado
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Resultado
 */
const deleteAnnouncement = async (comunicadoId, userId) => {
  // Verificar que el comunicado existe
  const checkQuery = `SELECT id FROM comunicados WHERE id = $1 AND status = 'active'`;
  const checkResult = await pool.query(checkQuery, [comunicadoId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Comunicado no encontrado');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Soft delete de destinatarios
    await client.query(`
      UPDATE comunicado_destinatarios
      SET status = 'inactive', user_id_modification = $1, date_time_modification = NOW()
      WHERE comunicado_id = $2
    `, [userId, comunicadoId]);

    // Soft delete del comunicado
    await client.query(`
      UPDATE comunicados
      SET status = 'inactive', user_id_modification = $1, date_time_modification = NOW()
      WHERE id = $2
    `, [userId, comunicadoId]);

    await client.query('COMMIT');

    return { success: true };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getUnreadAnnouncements,
  markAnnouncementAsRead,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement
};
