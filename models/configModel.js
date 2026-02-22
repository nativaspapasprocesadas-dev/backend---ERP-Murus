/**
 * Config Model - API-077, API-078
 * Segun diseno en 04_apis_lista.md linea 4862 (API-077), linea 4918 (API-078)
 * Tabla: configuracion_sistema (TBL-022 schema.prisma linea 475)
 */
const pool = require('../config/db');

/**
 * Obtener toda la configuracion del sistema - API-077
 * GET /api/v1/config
 *
 * Segun diseno:
 * - Response: SystemConfigDTO con campos agrupados (creditAlerts, whatsapp, socialMedia)
 *
 * @param {number|null} branchId - ID de sede (opcional para filtrar)
 * @returns {Promise<Object>} Configuracion del sistema
 */
const getSystemConfig = async (branchId = null) => {
  let query = `
    SELECT id, clave, valor, tipo_dato, descripcion, modulo, es_editable
    FROM configuracion_sistema
    WHERE status = 'active'
  `;
  const params = [];

  // Si se especifica branchId, filtrar por modulo que contenga el branch
  // Por ahora retornamos toda la config global

  query += ` ORDER BY modulo, clave`;

  const result = await pool.query(query, params);

  // Agrupar configuraciones por modulo/categoria
  const config = {
    creditAlerts: {},
    whatsapp: {},
    socialMedia: {},
    general: {}
  };

  for (const row of result.rows) {
    // Convertir valor segun tipo_dato
    let value = row.valor;
    if (row.tipo_dato === 'integer' || row.tipo_dato === 'number') {
      value = parseFloat(row.valor);
    } else if (row.tipo_dato === 'boolean') {
      value = row.valor === 'true' || row.valor === '1';
    } else if (row.tipo_dato === 'json') {
      try {
        value = JSON.parse(row.valor);
      } catch (e) {
        value = row.valor;
      }
    }

    // Clasificar por modulo/clave
    const key = row.clave;
    const modulo = (row.modulo || 'general').toLowerCase();

    if (key.startsWith('credit_') || modulo === 'credito' || modulo === 'credit') {
      config.creditAlerts[toCamelCase(key.replace('credit_', ''))] = value;
    } else if (key.startsWith('whatsapp_') || modulo === 'whatsapp') {
      config.whatsapp[toCamelCase(key.replace('whatsapp_', ''))] = value;
    } else if (key.startsWith('social_') || modulo === 'social' || modulo === 'redes') {
      config.socialMedia[toCamelCase(key.replace('social_', ''))] = value;
    } else {
      config.general[toCamelCase(key)] = value;
    }
  }

  return config;
};

/**
 * Actualizar configuracion del sistema - API-078
 * PUT /api/v1/config
 *
 * @param {Object} configData - Objeto con configuraciones a actualizar
 * @param {number} userId - ID del usuario que actualiza
 * @returns {Promise<Object>} Configuracion actualizada
 */
const updateSystemConfig = async (configData, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Mapear datos entrantes a formato de BD
    const updates = [];

    // Procesar creditAlerts
    if (configData.creditAlerts) {
      for (const [key, value] of Object.entries(configData.creditAlerts)) {
        const dbKey = 'credit_' + toSnakeCase(key);
        updates.push({ clave: dbKey, valor: String(value), modulo: 'credito' });
      }
    }

    // Procesar whatsapp
    if (configData.whatsapp) {
      for (const [key, value] of Object.entries(configData.whatsapp)) {
        const dbKey = 'whatsapp_' + toSnakeCase(key);
        updates.push({ clave: dbKey, valor: String(value), modulo: 'whatsapp' });
      }
    }

    // Procesar socialMedia
    if (configData.socialMedia) {
      for (const [key, value] of Object.entries(configData.socialMedia)) {
        const dbKey = 'social_' + toSnakeCase(key);
        updates.push({ clave: dbKey, valor: String(value), modulo: 'redes' });
      }
    }

    // Procesar general
    if (configData.general) {
      for (const [key, value] of Object.entries(configData.general)) {
        const dbKey = toSnakeCase(key);
        updates.push({ clave: dbKey, valor: String(value), modulo: 'general' });
      }
    }

    // Ejecutar upserts
    for (const update of updates) {
      const upsertQuery = `
        INSERT INTO configuracion_sistema (clave, valor, tipo_dato, modulo, es_editable, status, user_id_registration)
        VALUES ($1, $2, 'string', $3, true, 'active', $4)
        ON CONFLICT (clave)
        DO UPDATE SET
          valor = $2,
          user_id_modification = $4,
          date_time_modification = NOW()
        WHERE configuracion_sistema.es_editable = true
      `;
      await client.query(upsertQuery, [update.clave, update.valor, update.modulo, userId]);
    }

    await client.query('COMMIT');

    // Retornar configuracion actualizada
    return await getSystemConfig();

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Convertir string a camelCase
 */
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

/**
 * Convertir camelCase a snake_case
 */
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

module.exports = {
  getSystemConfig,
  updateSystemConfig
};
