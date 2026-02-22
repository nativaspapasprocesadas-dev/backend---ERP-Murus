/**
 * Production Model - API-044
 * Segun diseno en 04_apis_lista.md
 * Tablas reales: pedidos, pedido_detalles, productos, especies, medidas, rutas_config, rutas_diarias
 */
const pool = require('../config/db');
const { getPeruDateString, formatDateFromDB } = require('../utils/dateUtils');

/**
 * Obtener pizarra de produccion - API-044
 * Retorna pedidos con detalles expandidos y rutas activas del dia
 * FORMATO COMPATIBLE CON FRONTEND: pedidosExpandidos y rutasAbiertasHoy
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Object>} Datos de la pizarra de produccion
 */
const getProductionBoard = async ({ date, branchId }) => {
  // Usar fecha de hoy si no se proporciona (hora de Perú)
  const targetDate = date || getPeruDateString();

  // ========================================
  // Query para obtener rutas activas del dia
  // ========================================
  let rutasParams = [targetDate];
  let rutasWhereExtra = '';
  let rutasParamIndex = 2;

  if (branchId) {
    rutasWhereExtra = ` AND rc.branch_id = $${rutasParamIndex}`;
    rutasParams.push(branchId);
    rutasParamIndex++;
  }

  const rutasQuery = `
    SELECT
      rd.id,
      rd.ruta_config_id,
      rd.fecha,
      rd.estado,
      rc.nombre AS ruta_nombre,
      rc.orden AS ruta_orden,
      rc.descripcion AS ruta_descripcion,
      rc.color AS ruta_color
    FROM rutas_diarias rd
    LEFT JOIN rutas_config rc ON rd.ruta_config_id = rc.id
    WHERE rd.fecha = $1
      AND rd.status = 'active'
      AND rd.estado IN ('abierta', 'en_proceso', 'pendiente')
      ${rutasWhereExtra}
    ORDER BY rc.orden, rc.nombre
  `;

  const rutasResult = await pool.query(rutasQuery, rutasParams);

  // Mapear rutas al formato esperado por el frontend
  const rutas = rutasResult.rows.map((r, idx) => ({
    id: r.id,
    numero: r.ruta_orden || idx + 1, // Usar orden como numero de ruta
    nombre: r.ruta_nombre,
    estado: r.estado,
    fecha: r.fecha,
    configId: r.ruta_config_id,
    color: r.ruta_color || '#3B82F6' // Color de la ruta (azul por defecto)
  }));

  // ========================================
  // Query para obtener pedidos con detalles
  // ========================================
  let pedidosParams = [targetDate];
  let pedidosWhereExtra = '';
  let pedidosParamIndex = 2;

  if (branchId) {
    pedidosWhereExtra = ` AND p.branch_id = $${pedidosParamIndex}`;
    pedidosParams.push(branchId);
  }

  // IMPORTANTE: Filtrar por fecha_entrega (no fecha_pedido)
  // Esto permite que pedidos agendados para mañana aparezcan en la pizarra del día correspondiente
  const pedidosQuery = `
    SELECT
      p.id,
      p.numero_pedido,
      p.fecha_pedido,
      p.fecha_entrega,
      p.estado,
      p.ruta_diaria_id,
      pd.id AS detalle_id,
      pd.cantidad,
      pd.listo AS detalle_listo,
      prod.id AS producto_id,
      prod.nombre AS producto_nombre,
      esp.id AS especie_id,
      esp.nombre AS especie_nombre,
      med.id AS medida_id,
      med.nombre AS medida_nombre,
      pres.id AS presentacion_id,
      pres.nombre AS presentacion_nombre,
      pres.peso AS presentacion_peso
    FROM pedidos p
    LEFT JOIN pedido_detalles pd ON p.id = pd.pedido_id AND pd.status = 'active'
    LEFT JOIN productos prod ON pd.producto_id = prod.id
    LEFT JOIN especies esp ON prod.especie_id = esp.id
    LEFT JOIN medidas med ON prod.medida_id = med.id
    LEFT JOIN presentaciones pres ON prod.presentacion_id = pres.id
    WHERE DATE(COALESCE(p.fecha_entrega, p.fecha_pedido)) = $1
      AND p.status = 'active'
      AND p.estado NOT IN ('cancelado', 'completado')
      ${pedidosWhereExtra}
    ORDER BY p.id, pd.id
  `;

  const pedidosResult = await pool.query(pedidosQuery, pedidosParams);

  // Agrupar detalles por pedido
  const pedidosMap = {};
  pedidosResult.rows.forEach(row => {
    if (!pedidosMap[row.id]) {
      pedidosMap[row.id] = {
        id: row.id,
        numero: row.numero_pedido,
        // Usar fecha_entrega como fecha principal (consistente con el filtro)
        // Si no hay fecha_entrega, usar fecha_pedido como fallback
        fecha: formatDateFromDB(row.fecha_entrega) || formatDateFromDB(row.fecha_pedido) || targetDate,
        fechaPedido: formatDateFromDB(row.fecha_pedido),
        fechaEntrega: formatDateFromDB(row.fecha_entrega),
        estado: row.estado,
        rutaId: row.ruta_diaria_id,
        detalles: []
      };
    }

    if (row.detalle_id) {
      pedidosMap[row.id].detalles.push({
        id: row.detalle_id,
        cantidad: parseFloat(row.cantidad) || 0,
        listo: row.detalle_listo || false,
        producto: {
          id: row.producto_id,
          nombre: row.producto_nombre
        },
        especie: {
          id: row.especie_id,
          nombre: row.especie_nombre
        },
        medida: {
          id: row.medida_id,
          nombre: row.medida_nombre
        },
        presentacion: {
          id: row.presentacion_id,
          nombre: row.presentacion_nombre,
          // Usar el peso real de la presentación desde la BD
          kilos: parseFloat(row.presentacion_peso) || 1
        }
      });
    }
  });

  const pedidos = Object.values(pedidosMap);

  // ========================================
  // Calcular estadisticas adicionales
  // ========================================
  const stats = {
    totalPedidos: pedidos.length,
    totalRutas: rutas.length,
    pedidosConRuta: pedidos.filter(p => p.rutaId).length,
    pedidosSinRuta: pedidos.filter(p => !p.rutaId).length
  };

  // ========================================
  // Obtener pedidos agendados para fechas futuras
  // Muestra "X pedidos agendados para el día Y"
  // ========================================
  let pedidosAgendadosParams = [];
  let pedidosAgendadosWhereExtra = '';

  if (branchId) {
    pedidosAgendadosWhereExtra = ` AND branch_id = $1`;
    pedidosAgendadosParams.push(branchId);
  }

  const pedidosAgendadosQuery = `
    SELECT
      DATE(fecha_entrega) as fecha,
      COUNT(*) as cantidad
    FROM pedidos
    WHERE DATE(fecha_entrega) > CURRENT_DATE
      AND status = 'active'
      AND estado NOT IN ('cancelado', 'completado')
      ${pedidosAgendadosWhereExtra}
    GROUP BY DATE(fecha_entrega)
    ORDER BY fecha
    LIMIT 7
  `;

  const pedidosAgendadosResult = await pool.query(pedidosAgendadosQuery, pedidosAgendadosParams);

  const pedidosAgendados = pedidosAgendadosResult.rows.map(row => ({
    fecha: row.fecha.toISOString().split('T')[0],
    cantidad: parseInt(row.cantidad)
  }));

  return {
    date: targetDate,
    pedidos,
    rutas,
    stats,
    pedidosAgendados // Array de { fecha, cantidad } para fechas futuras
  };
};

/**
 * Obtener items (detalles de pedido) marcados como listos para una fecha y sede
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Array>} Lista de detalles de pedido marcados como listos
 */
const getItemsListos = async ({ date, branchId }) => {
  const targetDate = date || getPeruDateString();

  let query = `
    SELECT
      pd.id,
      pd.listo,
      pd.pedido_id
    FROM pedido_detalles pd
    INNER JOIN pedidos p ON pd.pedido_id = p.id
    WHERE pd.listo = true
      AND pd.status = 'active'
      AND p.status = 'active'
      AND DATE(COALESCE(p.fecha_entrega, p.fecha_pedido)) = $1
  `;
  const params = [targetDate];

  if (branchId) {
    query += ` AND p.branch_id = $2`;
    params.push(branchId);
  }

  const result = await pool.query(query, params);

  // Retornar array de IDs de detalles que están listos
  return result.rows.map(row => ({
    id: row.id,
    pedidoId: row.pedido_id,
    listo: row.listo
  }));
};

/**
 * Marcar o desmarcar un detalle de pedido como listo
 * @param {Object} params - Datos del item (ahora usa detalleId directamente)
 * @returns {Promise<Object>} Item actualizado
 */
const toggleItemListo = async ({ detalleId, userId }) => {
  // Verificar que existe el detalle
  const checkQuery = `
    SELECT id, listo FROM pedido_detalles
    WHERE id = $1 AND status = 'active'
  `;
  const checkResult = await pool.query(checkQuery, [detalleId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Detalle de pedido no encontrado');
  }

  // Toggle el estado listo
  const currentListo = checkResult.rows[0].listo || false;
  const updateQuery = `
    UPDATE pedido_detalles
    SET listo = $1,
        listo_por_user_id = $2,
        listo_fecha = $3,
        user_id_modification = $2,
        date_time_modification = NOW()
    WHERE id = $4
    RETURNING id, listo
  `;
  const updateResult = await pool.query(updateQuery, [
    !currentListo,
    userId,
    !currentListo ? new Date() : null, // Solo poner fecha si se marca como listo
    detalleId
  ]);

  return {
    id: updateResult.rows[0].id,
    listo: updateResult.rows[0].listo
  };
};

/**
 * Marcar o desmarcar MULTIPLES detalles de pedido como listos (batch)
 * Todos los detalles se setean al mismo valor (listo = targetListo)
 * @param {Object} params - { detalleIds: number[], targetListo: boolean, userId: number }
 * @returns {Promise<Object>} Resultado con los items actualizados
 */
const toggleItemsListoBatch = async ({ detalleIds, targetListo, userId }) => {
  if (!detalleIds || detalleIds.length === 0) {
    throw new Error('detalleIds es requerido y no puede estar vacio');
  }

  const placeholders = detalleIds.map((_, i) => `$${i + 4}`).join(', ');
  const updateQuery = `
    UPDATE pedido_detalles
    SET listo = $1,
        listo_por_user_id = $2,
        listo_fecha = $3,
        user_id_modification = $2,
        date_time_modification = NOW()
    WHERE id IN (${placeholders}) AND status = 'active'
    RETURNING id, listo
  `;

  const params = [
    targetListo,
    userId,
    targetListo ? new Date() : null,
    ...detalleIds
  ];

  const result = await pool.query(updateQuery, params);
  return {
    updated: result.rows,
    listo: targetListo
  };
};

module.exports = {
  getProductionBoard,
  getItemsListos,
  toggleItemListo,
  toggleItemsListoBatch
};
