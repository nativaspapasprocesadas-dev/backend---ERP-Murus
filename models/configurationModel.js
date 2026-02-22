/**
 * Configuration Model
 * Manejo de configuraciones del sistema desde tabla configuracion_sistema
 * Tabla: configuracion_sistema (clave, valor, tipo_dato, descripcion, modulo, es_editable)
 */
const pool = require('../config/db');

/**
 * Convertir valor segun tipo de dato
 * @param {string} valor - Valor como string desde BD
 * @param {string} tipoDato - Tipo de dato (string, integer, number, boolean, json)
 * @returns {any} Valor convertido
 */
const convertValue = (valor, tipoDato) => {
  if (valor === null || valor === undefined) return null;

  switch (tipoDato) {
    case 'integer':
      return parseInt(valor, 10);
    case 'number':
      return parseFloat(valor);
    case 'boolean':
      return valor === 'true' || valor === '1' || valor === true;
    case 'json':
      try {
        return JSON.parse(valor);
      } catch (e) {
        return valor;
      }
    case 'string':
    default:
      return String(valor);
  }
};

/**
 * Obtener todas las configuraciones activas
 * @returns {Promise<Array>} Lista de configuraciones
 */
const getAllConfigurations = async () => {
  const query = `
    SELECT
      id,
      clave,
      valor,
      tipo_dato,
      descripcion,
      modulo,
      es_editable AS "esEditable"
    FROM configuracion_sistema
    WHERE status = 'active'
    ORDER BY modulo, clave
  `;

  const result = await pool.query(query);

  return result.rows.map(row => ({
    id: row.id,
    clave: row.clave,
    valor: convertValue(row.valor, row.tipo_dato),
    tipoDato: row.tipo_dato,
    descripcion: row.descripcion,
    modulo: row.modulo,
    esEditable: row.esEditable
  }));
};

/**
 * Obtener configuraciones por modulo
 * @param {string} modulo - Modulo a filtrar (general, creditos, whatsapp, social)
 * @returns {Promise<Array>} Lista de configuraciones del modulo
 */
const getConfigurationsByModule = async (modulo) => {
  const query = `
    SELECT
      id,
      clave,
      valor,
      tipo_dato,
      descripcion,
      modulo,
      es_editable AS "esEditable"
    FROM configuracion_sistema
    WHERE status = 'active' AND modulo = $1
    ORDER BY clave
  `;

  const result = await pool.query(query, [modulo]);

  return result.rows.map(row => ({
    id: row.id,
    clave: row.clave,
    valor: convertValue(row.valor, row.tipo_dato),
    tipoDato: row.tipo_dato,
    descripcion: row.descripcion,
    modulo: row.modulo,
    esEditable: row.esEditable
  }));
};

/**
 * Obtener una configuracion especifica por clave
 * @param {string} clave - Clave de la configuracion
 * @returns {Promise<Object|null>} Configuracion encontrada o null
 */
const getConfigurationByKey = async (clave) => {
  const query = `
    SELECT
      id,
      clave,
      valor,
      tipo_dato,
      descripcion,
      modulo,
      es_editable AS "esEditable"
    FROM configuracion_sistema
    WHERE status = 'active' AND clave = $1
  `;

  const result = await pool.query(query, [clave]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    clave: row.clave,
    valor: convertValue(row.valor, row.tipo_dato),
    tipoDato: row.tipo_dato,
    descripcion: row.descripcion,
    modulo: row.modulo,
    esEditable: row.esEditable
  };
};

/**
 * Actualizar una configuracion
 * @param {string} clave - Clave de la configuracion
 * @param {any} valor - Nuevo valor
 * @param {number} userId - ID del usuario que actualiza
 * @returns {Promise<Object>} Configuracion actualizada
 */
const updateConfiguration = async (clave, valor, userId) => {
  // Verificar que existe y es editable
  const checkQuery = `
    SELECT id, es_editable, tipo_dato
    FROM configuracion_sistema
    WHERE status = 'active' AND clave = $1
  `;

  const checkResult = await pool.query(checkQuery, [clave]);

  if (checkResult.rows.length === 0) {
    throw new Error('Configuracion no encontrada');
  }

  const config = checkResult.rows[0];

  if (!config.es_editable) {
    throw new Error('Esta configuracion no es editable');
  }

  // Convertir valor a string para almacenar
  const valorStr = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);

  // Actualizar
  const updateQuery = `
    UPDATE configuracion_sistema
    SET
      valor = $1,
      user_id_modification = $2,
      date_time_modification = NOW()
    WHERE clave = $3 AND status = 'active'
    RETURNING
      id,
      clave,
      valor,
      tipo_dato,
      descripcion,
      modulo,
      es_editable AS "esEditable"
  `;

  const result = await pool.query(updateQuery, [valorStr, userId, clave]);

  const row = result.rows[0];
  return {
    id: row.id,
    clave: row.clave,
    valor: convertValue(row.valor, row.tipo_dato),
    tipoDato: row.tipo_dato,
    descripcion: row.descripcion,
    modulo: row.modulo,
    esEditable: row.esEditable
  };
};

/**
 * Actualizar multiples configuraciones en una transaccion
 * @param {Array<Object>} configs - Array de {clave, valor}
 * @param {number} userId - ID del usuario que actualiza
 * @returns {Promise<Array>} Configuraciones actualizadas
 */
const updateMultipleConfigurations = async (configs, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const updated = [];

    for (const config of configs) {
      const { clave, valor } = config;

      // Verificar que existe y es editable
      const checkQuery = `
        SELECT id, es_editable, tipo_dato
        FROM configuracion_sistema
        WHERE status = 'active' AND clave = $1
      `;

      const checkResult = await client.query(checkQuery, [clave]);

      if (checkResult.rows.length === 0) {
        throw new Error(`Configuracion ${clave} no encontrada`);
      }

      const configData = checkResult.rows[0];

      if (!configData.es_editable) {
        throw new Error(`Configuracion ${clave} no es editable`);
      }

      // Convertir valor a string para almacenar
      const valorStr = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);

      // Actualizar
      const updateQuery = `
        UPDATE configuracion_sistema
        SET
          valor = $1,
          user_id_modification = $2,
          date_time_modification = NOW()
        WHERE clave = $3 AND status = 'active'
        RETURNING
          id,
          clave,
          valor,
          tipo_dato,
          descripcion,
          modulo,
          es_editable AS "esEditable"
      `;

      const result = await client.query(updateQuery, [valorStr, userId, clave]);

      const row = result.rows[0];
      updated.push({
        id: row.id,
        clave: row.clave,
        valor: convertValue(row.valor, row.tipo_dato),
        tipoDato: row.tipo_dato,
        descripcion: row.descripcion,
        modulo: row.modulo,
        esEditable: row.esEditable
      });
    }

    await client.query('COMMIT');

    return updated;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getAllConfigurations,
  getConfigurationsByModule,
  getConfigurationByKey,
  updateConfiguration,
  updateMultipleConfigurations
};
