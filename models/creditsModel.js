/**
 * Credits Model - API-021, API-022, API-023, API-024
 * Segun diseno en 04_apis_lista.md lineas 1393-1659
 * Tablas reales: customers, movimientos_credito, users, comunicados, comunicado_destinatarios
 */
const pool = require('../config/db');
const { getPeruDate } = require('../utils/dateUtils');

// El dinero se opera en centimos enteros para evitar errores de punto flotante
const aCentimos = (valor) => Math.round((parseFloat(valor) || 0) * 100);
const aSoles = (centimos) => centimos / 100;

/**
 * Calcular el estado de pago de cada cargo de un cliente
 *
 * Un cargo (CARGO o SALDO_INICIAL) se considera cancelado con:
 *  1. Las aplicaciones de pago explicitas (tabla aplicaciones_pago), que registran
 *     que cargos eligio pagar el usuario.
 *  2. El remanente de ABONOS que no tiene aplicaciones registradas (pagos historicos,
 *     anteriores a esta funcionalidad), repartido del cargo mas antiguo al mas reciente.
 *
 * Con esto la suma de los montos pendientes siempre coincide con el saldo del cliente
 * (SUM CARGO + SALDO_INICIAL - SUM ABONO).
 *
 * @param {number} customerId - ID del cliente
 * @param {Object} [executor] - Cliente de transaccion; por defecto el pool
 * @returns {Promise<Array>} Cargos ordenados del mas antiguo al mas reciente
 */
const getChargesPaymentStatus = async (customerId, executor = pool) => {
  // Cargos del cliente con el monto ya aplicado explicitamente
  // (solo cuentan las aplicaciones cuyo ABONO sigue activo)
  const cargosQuery = `
    SELECT
      mc.id,
      mc.tipo_movimiento AS "tipo",
      mc.monto,
      mc.fecha_movimiento AS "fechaMovimiento",
      mc.fecha_vencimiento AS "fechaVencimiento",
      mc.descripcion,
      mc.pedido_id AS "pedidoId",
      COALESCE((
        SELECT SUM(ap.monto_aplicado)
        FROM aplicaciones_pago ap
        JOIN movimientos_credito abono ON ap.abono_id = abono.id
        WHERE ap.cargo_id = mc.id
          AND ap.status = 'active'
          AND abono.status = 'active'
      ), 0) AS "aplicado"
    FROM movimientos_credito mc
    WHERE mc.customer_id = $1
      AND mc.status = 'active'
      AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL')
    ORDER BY mc.fecha_movimiento ASC, mc.id ASC
  `;

  // Total abonado y cuanto de ese total ya esta asignado a cargos concretos
  const abonosQuery = `
    SELECT
      COALESCE((
        SELECT SUM(mc.monto)
        FROM movimientos_credito mc
        WHERE mc.customer_id = $1 AND mc.status = 'active' AND mc.tipo_movimiento = 'ABONO'
      ), 0) AS "totalAbonos",
      COALESCE((
        SELECT SUM(ap.monto_aplicado)
        FROM aplicaciones_pago ap
        JOIN movimientos_credito abono ON ap.abono_id = abono.id
        WHERE abono.customer_id = $1
          AND abono.status = 'active'
          AND ap.status = 'active'
      ), 0) AS "totalAplicado"
  `;

  const [cargosResult, abonosResult] = await Promise.all([
    executor.query(cargosQuery, [customerId]),
    executor.query(abonosQuery, [customerId])
  ]);

  // Abonos sin asignar: se reparten en FIFO (del cargo mas antiguo al mas reciente)
  let remanente = aCentimos(abonosResult.rows[0].totalAbonos) - aCentimos(abonosResult.rows[0].totalAplicado);
  if (remanente < 0) remanente = 0;

  const hoy = getPeruDate();

  return cargosResult.rows.map(row => {
    const montoCent = aCentimos(row.monto);
    const aplicadoCent = Math.min(aCentimos(row.aplicado), montoCent);
    let pendienteCent = montoCent - aplicadoCent;

    // Consumir el remanente de abonos historicos sobre este cargo
    let implicitoCent = 0;
    if (remanente > 0 && pendienteCent > 0) {
      implicitoCent = Math.min(remanente, pendienteCent);
      pendienteCent -= implicitoCent;
      remanente -= implicitoCent;
    }

    const pagadoCent = aplicadoCent + implicitoCent;
    const estadoPago = pendienteCent <= 0
      ? 'PAGADO'
      : (pagadoCent > 0 ? 'PARCIAL' : 'PENDIENTE');

    return {
      id: row.id,
      tipo: row.tipo,
      monto: aSoles(montoCent),
      montoPagado: aSoles(pagadoCent),
      montoPendiente: aSoles(pendienteCent),
      estadoPago,
      fechaMovimiento: row.fechaMovimiento,
      fechaVencimiento: row.fechaVencimiento,
      pedidoId: row.pedidoId,
      referencia: row.descripcion || `Movimiento #${row.id}`,
      esVencido: row.fechaVencimiento ? new Date(row.fechaVencimiento) < hoy && pendienteCent > 0 : false
    };
  });
};

/**
 * Cargos con saldo pendiente de un cliente (los que se pueden seleccionar al pagar)
 * @param {number} customerId - ID del cliente
 * @param {Object} [executor] - Cliente de transaccion; por defecto el pool
 * @returns {Promise<Array>} Cargos pendientes del mas antiguo al mas reciente
 */
const getPendingCharges = async (customerId, executor = pool) => {
  const cargos = await getChargesPaymentStatus(customerId, executor);
  return cargos.filter(c => c.montoPendiente > 0);
};

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

  // Estado de pago de cada cargo (cuanto se ha cancelado y cuanto queda pendiente)
  const estadoCargos = await getChargesPaymentStatus(customerId);
  const mapaCargos = new Map(estadoCargos.map(c => [c.id, c]));

  return {
    currentBalance,
    movements: movementsResult.rows.map(row => {
      const cargo = mapaCargos.get(row.id);
      return {
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
        // Un cargo solo sigue vencido mientras le quede saldo pendiente
        esVencido: cargo ? cargo.esVencido : (row.dueDate ? new Date(row.dueDate) < getPeruDate() : false),
        montoPagado: cargo ? cargo.montoPagado : null,
        montoPendiente: cargo ? cargo.montoPendiente : null,
        estadoPago: cargo ? cargo.estadoPago : null
      };
    }),
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
const getDebtors = async ({ page = 1, pageSize = 20, branchId, hasOverdue, search }) => {
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

  // Filtro por búsqueda de nombre de cliente
  if (search && search.trim()) {
    whereConditions.push(`u.name ILIKE $${paramIndex}`);
    params.push(`%${search.trim()}%`);
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
                AND p.estado != 'cancelado'
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

  // Resumen global (sin paginación ni búsqueda) para estadísticas reales
  const summaryParams = [];
  let summaryBranchCondition = '';
  if (branchId) {
    summaryParams.push(branchId);
    summaryBranchCondition = `AND (
      (c.route_id IS NOT NULL AND EXISTS (SELECT 1 FROM rutas_config rc WHERE rc.id = c.route_id AND rc.branch_id = $1))
      OR (c.route_id IS NULL AND u.branch_id = $1)
    )`;
  }
  const summaryQuery = `
    SELECT
      COUNT(*) AS total_deudores,
      COALESCE(SUM(sub.debt), 0) AS total_debt,
      COUNT(*) FILTER (WHERE sub.has_overdue) AS total_con_vencidos
    FROM (
      SELECT
        c.id,
        COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0
        ) - COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
        ) AS debt,
        EXISTS (
          SELECT 1 FROM movimientos_credito mc_v
          WHERE mc_v.customer_id = c.id
            AND mc_v.tipo_movimiento = 'CARGO'
            AND mc_v.status = 'active'
            AND mc_v.fecha_vencimiento IS NOT NULL
            AND mc_v.fecha_vencimiento < NOW()
        ) AS has_overdue
      FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.status = 'active'
      ${summaryBranchCondition}
    ) sub
    WHERE sub.debt > 0
  `;
  const summaryResult = await pool.query(summaryQuery, summaryParams);
  const summary = summaryResult.rows[0];

  return {
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    },
    summary: {
      totalDeudores: parseInt(summary.total_deudores) || 0,
      totalDebt: parseFloat(summary.total_debt) || 0,
      totalConVencidos: parseInt(summary.total_con_vencidos) || 0
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

  // Estado de pago de cada cargo (cuanto se ha cancelado y cuanto queda pendiente)
  const estadoCargos = await getChargesPaymentStatus(customerId);
  const mapaCargos = new Map(estadoCargos.map(c => [c.id, c]));

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
    movements: movementsResult.rows.map(row => {
      const cargo = mapaCargos.get(row.id);
      return {
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
        // Un cargo solo sigue vencido mientras le quede saldo pendiente
        esVencido: cargo ? cargo.esVencido : (row.dueDate ? new Date(row.dueDate) < getPeruDate() : false),
        montoPagado: cargo ? cargo.montoPagado : null,
        montoPendiente: cargo ? cargo.montoPendiente : null,
        estadoPago: cargo ? cargo.estadoPago : null
      };
    }),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
};

/**
 * Obtener todos los clientes con deuda y sus movimientos para exportación a Excel
 * No pagina: devuelve el universo completo de deudores (respetando sede y búsqueda)
 * junto con el detalle cronológico de cada movimiento de crédito.
 * @param {Object} params - Filtros
 * @param {number} [params.branchId] - Filtrar por sede
 * @param {string} [params.search] - Filtrar por nombre de cliente
 * @param {number} [params.customerId] - Exportar el estado de cuenta de un solo cliente
 * @param {string} [params.dateFrom] - Filtrar movimientos desde esta fecha (YYYY-MM-DD, inclusive)
 * @param {string} [params.dateTo] - Filtrar movimientos hasta esta fecha (YYYY-MM-DD, inclusive)
 * @returns {Promise<Object>} { debtors, movements }
 */
const getDebtorsForExport = async ({ branchId, search, customerId, dateFrom, dateTo } = {}) => {
  let whereConditions = ["c.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  // Exportación del estado de cuenta de un cliente puntual
  if (customerId) {
    whereConditions.push(`c.id = $${paramIndex}`);
    params.push(customerId);
    paramIndex++;
  }

  // Filtro por sede: consistente con getDebtors (API-022)
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

  // Filtro por búsqueda de nombre de cliente
  if (search && search.trim()) {
    whereConditions.push(`u.name ILIKE $${paramIndex}`);
    params.push(`%${search.trim()}%`);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Todos los deudores con deuda calculada > 0 (sin paginación)
  // Deuda = CARGOS + SALDO_INICIAL - ABONOS
  const debtorsQuery = `
    SELECT *
    FROM (
      SELECT
        c.id AS "customerId",
        u.name AS "customerName",
        COALESCE(u.phone, c.contact_phone) AS "phone",
        c.credit_days AS "creditDays",
        COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0
        ) - COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
        ) AS "totalDebt",
        (
          SELECT COUNT(*) FROM movimientos_credito mc
          WHERE mc.customer_id = c.id
            AND mc.tipo_movimiento = 'CARGO'
            AND mc.status = 'active'
            AND mc.fecha_vencimiento IS NOT NULL
            AND mc.fecha_vencimiento < NOW()
        ) AS "overdueCharges",
        (
          SELECT COUNT(*) FROM movimientos_credito mc3
          WHERE mc3.customer_id = c.id AND mc3.status = 'active'
        ) AS "movementCount",
        (
          SELECT MAX(mc2.fecha_movimiento) FROM movimientos_credito mc2
          WHERE mc2.customer_id = c.id AND mc2.tipo_movimiento = 'ABONO' AND mc2.status = 'active'
        ) AS "lastPaymentDate"
      FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      ${whereClause}
    ) sub
    ${customerId ? '' : 'WHERE sub."totalDebt" > 0'}
    ORDER BY sub."totalDebt" DESC
  `;
  const debtorsResult = await pool.query(debtorsQuery, params);

  const debtors = debtorsResult.rows.map(row => ({
    customerId: row.customerId,
    customerName: row.customerName,
    phone: row.phone || null,
    creditDays: row.creditDays || 0,
    totalDebt: parseFloat(row.totalDebt) || 0,
    overdueCharges: parseInt(row.overdueCharges) || 0,
    movementCount: parseInt(row.movementCount) || 0,
    lastPaymentDate: row.lastPaymentDate
  }));

  // Movimientos de todos los deudores (una sola query)
  // El rango de fechas (si se envía) filtra únicamente el detalle de movimientos:
  // el saldo del resumen siempre refleja la deuda acumulada real del cliente.
  let movements = [];
  const debtorIds = debtors.map(d => d.customerId);
  if (debtorIds.length > 0) {
    const movParams = [debtorIds];
    let movIndex = 2;
    let dateConditions = '';

    if (dateFrom) {
      dateConditions += ` AND mc.fecha_movimiento >= $${movIndex}::date`;
      movParams.push(dateFrom);
      movIndex++;
    }

    if (dateTo) {
      // Se suma un día para incluir todos los movimientos del día final
      dateConditions += ` AND mc.fecha_movimiento < ($${movIndex}::date + INTERVAL '1 day')`;
      movParams.push(dateTo);
      movIndex++;
    }

    const movementsQuery = `
      SELECT
        mc.customer_id AS "customerId",
        u.name AS "customerName",
        mc.tipo_movimiento AS "type",
        mc.monto AS "amount",
        mc.saldo_nuevo AS "balance",
        mc.fecha_movimiento AS "date",
        mc.fecha_vencimiento AS "dueDate",
        mc.pedido_id AS "orderId",
        mc.descripcion AS "description"
      FROM movimientos_credito mc
      LEFT JOIN customers c ON mc.customer_id = c.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE mc.customer_id = ANY($1) AND mc.status = 'active'
      ${dateConditions}
      ORDER BY u.name ASC, mc.fecha_movimiento ASC
    `;
    const movementsResult = await pool.query(movementsQuery, movParams);
    movements = movementsResult.rows.map(row => ({
      customerId: row.customerId,
      customerName: row.customerName,
      tipo: row.type,
      monto: parseFloat(row.amount) || 0,
      saldo: parseFloat(row.balance) || 0,
      fechaMovimiento: row.date,
      fechaVencimiento: row.dueDate,
      esVencido: row.dueDate ? new Date(row.dueDate) < getPeruDate() : false,
      pedidoId: row.orderId,
      referencia: row.description || `Movimiento #${row.orderId || ''}`.trim(),
      notas: row.description
    }));
  }

  return { debtors, movements };
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
  getDebtorsForExport,
  getChargesPaymentStatus,
  getPendingCharges,
  sendPaymentReminder
};
