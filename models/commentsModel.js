/**
 * Comments Model
 * Sistema polimórfico de comentarios
 * Tabla: comentarios (TBL-020)
 */
const db = require('../config/db');

/**
 * Listar comentarios de una entidad específica
 * @param {string} entidadTipo - Tipo de entidad (PEDIDO, PRODUCCION, CLIENTE, etc.)
 * @param {string|number} entidadId - ID de la entidad
 * @returns {Promise<Array>} Lista de comentarios con información del usuario
 */
const listByEntity = async (entidadTipo, entidadId) => {
  try {
    const query = `
      SELECT
        c.id,
        c.entidad_tipo AS "entidadTipo",
        c.entidad_id AS "entidadId",
        c.user_id AS "usuarioId",
        c.contenido AS "texto",
        c.status,
        c.date_time_registration AS "fechaCreacion",
        c.date_time_modification AS "fechaActualizacion",
        u.name AS "nombreUsuario",
        u.email AS "emailUsuario",
        r.name AS "rolUsuario"
      FROM comentarios c
      INNER JOIN users u ON c.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE c.entidad_tipo = $1
        AND c.entidad_id = $2
        AND c.status = 'active'
      ORDER BY c.date_time_registration DESC
    `;

    const result = await db.query(query, [entidadTipo.toUpperCase(), parseInt(entidadId)]);

    return result.rows.map(row => ({
      ...row,
      editado: row.fechaActualizacion !== null && row.fechaActualizacion !== row.fechaCreacion
    }));
  } catch (error) {
    console.error('Error listando comentarios:', error);
    throw error;
  }
};

/**
 * Obtener comentario por ID
 * @param {number} id - ID del comentario
 * @returns {Promise<Object|null>} Comentario o null
 */
const getById = async (id) => {
  try {
    const query = `
      SELECT
        c.id,
        c.entidad_tipo AS "entidadTipo",
        c.entidad_id AS "entidadId",
        c.user_id AS "usuarioId",
        c.contenido AS "texto",
        c.status,
        c.date_time_registration AS "fechaCreacion",
        c.date_time_modification AS "fechaActualizacion",
        u.name AS "nombreUsuario",
        u.email AS "emailUsuario",
        r.name AS "rolUsuario"
      FROM comentarios c
      INNER JOIN users u ON c.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE c.id = $1
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      editado: row.fechaActualizacion !== null && row.fechaActualizacion !== row.fechaCreacion
    };
  } catch (error) {
    console.error('Error obteniendo comentario:', error);
    throw error;
  }
};

/**
 * Crear nuevo comentario
 * @param {Object} data - Datos del comentario
 * @returns {Promise<Object>} Comentario creado
 */
const create = async ({ entidadTipo, entidadId, usuarioId, texto }) => {
  try {
    const query = `
      INSERT INTO comentarios (
        entidad_tipo, entidad_id, user_id, contenido,
        fecha_comentario, status,
        user_id_registration, date_time_registration
      )
      VALUES ($1, $2, $3, $4, NOW(), 'active', $3, NOW())
      RETURNING id, entidad_tipo AS "entidadTipo", entidad_id AS "entidadId",
                user_id AS "usuarioId", contenido AS "texto", status,
                date_time_registration AS "fechaCreacion"
    `;

    const result = await db.query(query, [
      entidadTipo.toUpperCase(),
      parseInt(entidadId),
      usuarioId,
      texto
    ]);

    // Obtener datos completos del comentario con usuario
    const comentarioId = result.rows[0].id;
    return await getById(comentarioId);
  } catch (error) {
    console.error('Error creando comentario:', error);
    throw error;
  }
};

/**
 * Actualizar comentario
 * @param {number} id - ID del comentario
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} Comentario actualizado
 */
const update = async (id, { texto, usuarioId }) => {
  try {
    const query = `
      UPDATE comentarios
      SET contenido = $1,
          date_time_modification = NOW(),
          user_id_modification = $3
      WHERE id = $2 AND status = 'active'
      RETURNING id
    `;

    const result = await db.query(query, [texto, id, usuarioId]);

    if (result.rows.length === 0) {
      return null;
    }

    return await getById(id);
  } catch (error) {
    console.error('Error actualizando comentario:', error);
    throw error;
  }
};

/**
 * Eliminar comentario (soft delete)
 * @param {number} id - ID del comentario
 * @param {number} usuarioId - ID del usuario que elimina
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
const softDelete = async (id, usuarioId) => {
  try {
    const query = `
      UPDATE comentarios
      SET status = 'inactive',
          date_time_modification = NOW(),
          user_id_modification = $2
      WHERE id = $1 AND status = 'active'
      RETURNING id
    `;

    const result = await db.query(query, [id, usuarioId]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error eliminando comentario:', error);
    throw error;
  }
};

module.exports = {
  listByEntity,
  getById,
  create,
  update,
  softDelete
};
