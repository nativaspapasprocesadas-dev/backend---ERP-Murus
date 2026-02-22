/**
 * Dashboard Model - API-004
 * Segun diseno en 04_apis_lista.md linea 183
 */
const pool = require('../config/db');
const { getPeruDateString } = require('../utils/dateUtils');

/**
 * Obtener el monto de alerta de credito desde configuracion_sistema
 * @returns {Promise<number>} Monto configurado para alertas de credito
 */
const getMontoAlertaCredito = async () => {
  try {
    const query = `
      SELECT valor
      FROM configuracion_sistema
      WHERE clave = 'credito_monto_alto_global' AND status = 'active'
    `;
    const result = await pool.query(query);
    if (result.rows.length > 0 && result.rows[0].valor) {
      return parseFloat(result.rows[0].valor) || 0;
    }
    return 0;
  } catch (error) {
    console.error('Error obteniendo monto alerta credito:', error);
    return 0;
  }
};

/**
 * Obtener estadisticas del dashboard
 * @param {Object} params - Parametros de filtro
 * @param {number} params.branchId - ID de sede (opcional)
 * @param {number} params.userId - ID del usuario autenticado
 * @param {string} params.roleName - Nombre del rol del usuario
 * @returns {Promise<Object>} Estadisticas del dashboard
 */
const getDashboardStats = async ({ branchId, userId, roleName }) => {
  // Fecha de hoy para filtrar pedidos del dia (usa hora de Perú)
  const today = getPeruDateString();

  // Obtener el monto configurado para alertas de credito
  const montoAlertaCredito = await getMontoAlertaCredito();

  // Normalizar roleName a minusculas para comparaciones case-insensitive
  const normalizedRole = roleName?.toLowerCase() || '';

  // Query base para estadisticas de pedidos (tabla: pedidos)
  let ordersQuery = `
    SELECT
      COUNT(*) FILTER (WHERE DATE(fecha_pedido) = $1) AS total_pedidos_hoy,
      COALESCE(SUM(total) FILTER (WHERE DATE(fecha_pedido) = $1), 0) AS total_ventas_hoy,
      COUNT(*) FILTER (WHERE estado = 'pendiente') AS pedidos_pendientes
    FROM pedidos
    WHERE status = 'active'
  `;

  // Query de clientes con deuda (JOIN con users para filtrar por branch_id)
  // Incluye conteo de clientes con deuda vencida O que exceden el monto de alerta configurado
  let customersQuery = `
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(c.current_balance, 0) > 0) AS clientes_con_deuda,
      COUNT(*) FILTER (
        WHERE COALESCE(c.current_balance, 0) > 0
        AND (
          -- Clientes con deuda vencida
          EXISTS (
            SELECT 1 FROM movimientos_credito mc
            WHERE mc.customer_id = c.id
              AND mc.tipo_movimiento = 'CARGO'
              AND mc.status = 'active'
              AND mc.fecha_vencimiento IS NOT NULL
              AND mc.fecha_vencimiento < NOW()
          )
          -- O clientes cuyo saldo excede el monto de alerta configurado
          OR (COALESCE(c.current_balance, 0) >= $1 AND $1 > 0)
        )
      ) AS clientes_deuda_vencida
    FROM customers c
    INNER JOIN users u ON c.user_id = u.id
    WHERE c.status = 'active'
  `;

  const ordersParams = [today];
  // El primer parámetro de customersQuery es el monto de alerta de crédito
  const customersParams = [montoAlertaCredito];
  let ordersParamIndex = 2;
  let customersParamIndex = 2;

  // Filtro por sede segun rol (case-insensitive)
  if (normalizedRole === 'cliente') {
    // Cliente solo ve sus propios datos
    ordersQuery += ` AND customer_id = (SELECT id FROM customers WHERE user_id = $${ordersParamIndex})`;
    ordersParams.push(userId);
    ordersParamIndex++;
  } else if (branchId && normalizedRole !== 'superadministrador') {
    // Admin/Coordinador ven solo su sede
    ordersQuery += ` AND branch_id = $${ordersParamIndex}`;
    ordersParams.push(branchId);
    ordersParamIndex++;

    customersQuery += ` AND u.branch_id = $${customersParamIndex}`;
    customersParams.push(branchId);
    customersParamIndex++;
  } else if (branchId) {
    // SuperAdmin puede filtrar por sede opcionalmente
    ordersQuery += ` AND branch_id = $${ordersParamIndex}`;
    ordersParams.push(branchId);
    ordersParamIndex++;

    customersQuery += ` AND u.branch_id = $${customersParamIndex}`;
    customersParams.push(branchId);
    customersParamIndex++;
  }

  const ordersResult = await pool.query(ordersQuery, ordersParams);
  const customersResult = await pool.query(customersQuery, customersParams);

  const ordersStats = ordersResult.rows[0] || {};
  const customersStats = customersResult.rows[0] || {};

  // Debug log para verificar alertas de crédito
  console.log('[DashboardModel] Estadísticas calculadas:', {
    montoAlertaCredito,
    clientesConDeuda: customersStats.clientes_con_deuda,
    alertasCredito: customersStats.clientes_deuda_vencida,
    customersParams
  });

  return {
    totalPedidosHoy: parseInt(ordersStats.total_pedidos_hoy) || 0,
    totalVentasHoy: parseFloat(ordersStats.total_ventas_hoy) || 0,
    pedidosPendientes: parseInt(ordersStats.pedidos_pendientes) || 0,
    clientesConDeuda: parseInt(customersStats.clientes_con_deuda) || 0,
    alertasCredito: parseInt(customersStats.clientes_deuda_vencida) || 0
  };
};

module.exports = {
  getDashboardStats
};
