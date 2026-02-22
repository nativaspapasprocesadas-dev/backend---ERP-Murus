/**
 * Credits Model - API-021, API-022, API-023, API-024
 * Segun diseno en 04_apis_lista.md lineas 1393-1659
 * Tablas reales: customers, movimientos_credito, users, comunicados, comunicado_destinatarios
 */
const pool = require('../config/db');
const { getPeruDate } = require('../utils/dateUtils');

/**
 * Obtener estado de cuenta del cliente autenticado - API-021
 * GET /api/v1/credits/account
 * @param {number} userId - ID del usuario autenticado
 * @param {Object} pagination - Parametros de paginacion
 * @returns {Promise<Object>} Estado de cuenta con movimientos
 */
const getClientCreditAccount = async (userId, { page = 1, pageSize = 20 }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  // Obtener customer_id del usuario y calcular saldo dinámicamente
  // Saldo = CARGOS + SALDO_INICIAL - ABONOS
  const customerQuery = `
    SELECT
      c.id,
      c.credit_days,
      COALESCE(
        (SELECT SUM(monto) FROM movimientos_credito mc
         WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0
      ) - COALESCE(
        (SELECT SUM(monto) FROM movimientos_credito mc
         WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
      ) AS calculated_balance
    FROM customers c
    WHERE c.user_id = $1 AND c.status = 'active'
  `;
  const customerResult = await pool.query(customerQuery, [userId]);

  if (customerResult.rows.length === 0) {
    throw new Error('Cliente no encontrado para este usuario');
  }

  const customer = customerResult.rows[0];
  const customerId = customer.id;
  const creditDays = customer.credit_days || 0;
  const currentBalance = parseFloat(customer.calculated_balance) || 0;

  // Contar total de movimientos
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM movimientos_credito mc
    WHERE mc.customer_id = $1 AND mc.status = 'active'
  `;
  const countResult = await pool.query(countQuery, [customerId]);
  const total = parseInt(countResult.rows[0].total);

  // Obtener movimientos paginados
  const movementsQuery = `
    SELECT
      mc.id,
      mc.tipo_movimiento AS type,
      mc.monto AS amount,
      mc.saldo_nuevo AS balance,
      mc.fecha_movimiento AS date,
      mc.fecha_vencimiento AS "dueDate",
      mc.pedido_id AS "orderId",
      mc.descripcion AS description
    FROM movimientos_credito mc
    WHERE mc.customer_id = $1 AND mc.status = 'active'
    ORDER BY mc.fecha_movimiento DESC
    LIMIT $2 OFFSET $3
  `;
  const movementsResult = await pool.query(movementsQuery, [customerId, pageSize, offset]);

  return {
    currentBalance,
    movements: movementsResult.rows.map(row => ({
      id: row.id,
      // Campos en español para compatibilidad con frontend
      tipo: row.type,
      monto: parseFloat(row.amount) || 0,
      saldo: parseFloat(row.balance) || 0,
      fechaMovimiento: row.date,
      pedidoId: row.orderId,
      referencia: row.description || `Movimiento #${row.id}`,
      notas: row.description,
      // Campos adicionales para frontend
      fechaVencimiento: row.dueDate,
      esVencido: row.dueDate ? new Date(row.dueDate) < getPeruDate() : false
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
 * Listar clientes con deuda - API-022
 * GET /api/v1/credits/debtors
 * @param {Object} params - Filtros y paginacion
 * @returns {Promise<Object>} Lista paginada de deudores
 */
const getDebtors = async ({ page = 1, pageSize = 20, branchId, hasOverdue }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  // Determinar si filtrar solo clientes con cargos vencidos
  const filterOverdue = hasOverdue === 'true' || hasOverdue === true;

  // Usamos deuda calculada dinámicamente (SUM CARGO - SUM ABONO) > 0
  // en lugar de current_balance para consistencia con página de Clientes
  let whereConditions = ["c.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  // Filtro por sede: consistente con customersModel.js (API-016)
  // Filtra clientes cuya ruta pertenece a la sede O cuyo usuario pertenece a la sede
  if (branchId) {
    whereConditions.push(`(
      (c.route_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM rutas_config rc WHERE rc.id = c.route_id AND rc.branch_id = $${paramIndex}
      ))
      OR (c.route_id IS NULL AND u.branch_id = $${paramIndex})
    )`);
    params.push(branchId);
    paramIndex++;
  }

  // Si se solicita filtrar por vencidos, agregar condición en el WHERE
  if (filterOverdue) {
    whereConditions.push(`
      EXISTS (
        SELECT 1 FROM movimientos_credito mc_filter
        WHERE mc_filter.customer_id = c.id
          AND mc_filter.tipo_movimiento = 'CARGO'
          AND mc_filter.status = 'active'
          AND mc_filter.fecha_vencimiento IS NOT NULL
          AND mc_filter.fecha_vencimiento < NOW()
      )
    `);
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Contar total de clientes con deuda calculada > 0 (con filtro de vencidos si aplica)
  // Deuda = CARGOS + SALDO_INICIAL - ABONOS
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM (
      SELECT
        c.id,
        COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0
        ) - COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
        ) AS calculated_debt
      FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      ${whereClause}
    ) sub
    WHERE sub.calculated_debt > 0
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Obtener deudores con deuda calculada dinámicamente
  // Deuda = CARGOS + SALDO_INICIAL - ABONOS
  // La lógica de canSendReminder: solo mostrar botón si la ruta del cliente ya salió hoy
  const dataQuery = `
    SELECT *
    FROM (
      SELECT
        c.id AS "customerId",
        u.name AS "customerName",
        COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0
        ) - COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
        ) AS "totalDebt",
        c.credit_days AS "creditDays",
        (
          SELECT COUNT(*)
          FROM movimientos_credito mc
          WHERE mc.customer_id = c.id
            AND mc.tipo_movimiento = 'CARGO'
            AND mc.status = 'active'
            AND mc.fecha_vencimiento IS NOT NULL
            AND mc.fecha_vencimiento < NOW()
        ) AS "overdueCharges",
        (
          SELECT COUNT(*)
          FROM movimientos_credito mc3
          WHERE mc3.customer_id = c.id
            AND mc3.status = 'active'
        ) AS "movementCount",
        (
          SELECT MAX(mc2.fecha_movimiento)
          FROM movimientos_credito mc2
          WHERE mc2.customer_id = c.id
            AND mc2.tipo_movimiento = 'ABONO'
            AND mc2.status = 'active'
        ) AS "lastPaymentDate",
        (
          SELECT CASE
            WHEN EXISTS (
              SELECT 1
              FROM pedidos p
              JOIN rutas_diarias rd ON p.ruta_diaria_id = rd.id
              JOIN rutas_config rc ON rd.ruta_config_id = rc.id
              WHERE p.customer_id = c.id
                AND p.status = 'active'
                AND rd.status = 'active'
                AND rd.fecha = CURRENT_DATE
                AND rd.estado IN ('en_curso', 'completada')
                AND CURRENT_TIME >= rc.hora_limite_recepcion::time
            ) THEN true
            ELSE false
          END
        ) AS "routeStartedToday"
      FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      ${whereClause}
    ) sub
    WHERE sub."totalDebt" > 0
    ORDER BY sub."totalDebt" DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const dataResult = await pool.query(dataQuery, params);

  // Mapear resultados
  const data = dataResult.rows.map(row => ({
    customerId: row.customerId,
    customerName: row.customerName,
    totalDebt: parseFloat(row.totalDebt) || 0,
    overdueCharges: parseInt(row.overdueCharges) || 0,
    movementCount: parseInt(row.movementCount) || 0,
    lastPaymentDate: row.lastPaymentDate,
    // Solo permitir enviar recordatorio si la ruta del cliente ya salió hoy
    canSendReminder: row.routeStartedToday === true
  }));

  return {
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
};

/**
 * Obtener cuenta de cliente especifico - API-023
 * GET /api/v1/credits/customers/:customerId
 * @param {number} customerId - ID del cliente
 * @param {Object} pagination - Parametros de paginacion
 * @returns {Promise<Object>} Estado de cuenta del cliente
 */
const getCustomerCreditAccount = async (customerId, { page = 1, pageSize = 20 }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  // Obtener datos del cliente y calcular saldo dinámicamente
  // Saldo = CARGOS + SALDO_INICIAL - ABONOS
  const customerQuery = `
    SELECT
      c.id,
      c.credit_days,
      c.address,
      c.contact_name,
      c.contact_phone,
      u.name,
      u.email,
      u.phone AS "userPhone",
      COALESCE(
        (SELECT SUM(monto) FROM movimientos_credito mc
         WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0
      ) - COALESCE(
        (SELECT SUM(monto) FROM movimientos_credito mc
         WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
      ) AS calculated_balance
    FROM customers c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.id = $1 AND c.status = 'active'
  `;
  const customerResult = await pool.query(customerQuery, [customerId]);

  if (customerResult.rows.length === 0) {
    throw new Error('Cliente no encontrado');
  }

  const customer = customerResult.rows[0];
  const currentBalance = parseFloat(customer.calculated_balance) || 0;

  // Contar total de movimientos
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM movimientos_credito mc
    WHERE mc.customer_id = $1 AND mc.status = 'active'
  `;
  const countResult = await pool.query(countQuery, [customerId]);
  const total = parseInt(countResult.rows[0].total);

  // Obtener movimientos paginados
  const movementsQuery = `
    SELECT
      mc.id,
      mc.tipo_movimiento AS type,
      mc.monto AS amount,
      mc.saldo_anterior AS "previousBalance",
      mc.saldo_nuevo AS balance,
      mc.fecha_movimiento AS date,
      mc.fecha_vencimiento AS "dueDate",
      mc.pedido_id AS "orderId",
      mc.descripcion AS description
    FROM movimientos_credito mc
    WHERE mc.customer_id = $1 AND mc.status = 'active'
    ORDER BY mc.fecha_movimiento DESC
    LIMIT $2 OFFSET $3
  `;
  const movementsResult = await pool.query(movementsQuery, [customerId, pageSize, offset]);

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.userPhone || customer.contact_phone,
      address: customer.address,
      contactName: customer.contact_name
    },
    currentBalance,
    movements: movementsResult.rows.map(row => ({
      id: row.id,
      // Campos en español para compatibilidad con frontend
      tipo: row.type,
      monto: parseFloat(row.amount) || 0,
      saldoAnterior: parseFloat(row.previousBalance) || 0,
      saldo: parseFloat(row.balance) || 0,
      fechaMovimiento: row.date,
      pedidoId: row.orderId,
      referencia: row.description || `Movimiento #${row.id}`,
      notas: row.description,
      // Campos adicionales para frontend
      fechaVencimiento: row.dueDate,
      esVencido: row.dueDate ? new Date(row.dueDate) < getPeruDate() : false
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
 * Enviar recordatorio de pago - API-024
 * POST /api/v1/credits/customers/:customerId/reminder
 * @param {number} customerId - ID del cliente
 * @param {string} message - Mensaje personalizado (opcional)
 * @param {number} userId - ID del usuario que envia
 * @returns {Promise<Object>} Resultado del envio
 */
const sendPaymentReminder = async (customerId, message, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que el cliente existe y tiene deuda
    const customerQuery = `
      SELECT c.id, c.user_id, c.current_balance, u.name
      FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = $1 AND c.status = 'active'
    `;
    const customerResult = await client.query(customerQuery, [customerId]);

    if (customerResult.rows.length === 0) {
      throw new Error('Cliente no encontrado');
    }

    const customer = customerResult.rows[0];
    const balance = parseFloat(customer.current_balance) || 0;

    if (balance <= 0) {
      throw new Error('El cliente no tiene deuda pendiente');
    }

    // Crear comunicado de recordatorio
    const defaultMessage = message || `Estimado ${customer.name}, le recordamos que tiene un saldo pendiente de S/. ${balance.toFixed(2)}. Por favor, realice su pago a la brevedad posible.`;

    const insertComunicado = `
      INSERT INTO comunicados (
        titulo, contenido, tipo, user_id_autor, es_urgente, user_id_registration
      )
      VALUES ($1, $2, 'RECORDATORIO_PAGO', $3, true, $3)
      RETURNING id
    `;
    const comunicadoResult = await client.query(insertComunicado, [
      'Recordatorio de Pago',
      defaultMessage,
      userId
    ]);

    const comunicadoId = comunicadoResult.rows[0].id;

    // Agregar al cliente como destinatario
    await client.query(`
      INSERT INTO comunicado_destinatarios (comunicado_id, customer_id, user_id_registration)
      VALUES ($1, $2, $3)
    `, [comunicadoId, customerId, userId]);

    await client.query('COMMIT');

    return {
      success: true,
      announcementId: comunicadoId
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getClientCreditAccount,
  getDebtors,
  getCustomerCreditAccount,
  sendPaymentReminder
};
