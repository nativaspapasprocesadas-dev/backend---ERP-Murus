/**
 * Orders Model - API-006, API-007, API-008, API-009, API-010, API-011, API-012, API-013
 * Segun diseno en 04_apis_lista.md
 * Tablas reales: pedidos, pedido_detalles, rutas_diarias, rutas_config, movimientos_credito
 */
const pool = require('../config/db');
const { getPeruTimeString, getPeruDate, getPeruDateTomorrow, getPeruDateString } = require('../utils/dateUtils');

/**
 * Listar pedidos con paginacion y filtros - API-006
 * @param {Object} params - Parametros de filtro y paginacion
 * @returns {Promise<Object>} Lista paginada de pedidos
 */
const listOrders = async ({ page = 1, pageSize = 20, status, customerId, branchId, dateFrom, dateTo, userId, roleName }) => {
  // pageSize=0 significa sin limite (retornar todos los registros)
  const parsedPageSize = parseInt(pageSize);
  const allRecords = parsedPageSize === 0;
  pageSize = allRecords ? 0 : Math.min(parsedPageSize || 20, 100);
  page = parseInt(page) || 1;
  const offset = allRecords ? 0 : (page - 1) * pageSize;

  // Normalizar rol para comparacion case-insensitive
  const normalizedRole = roleName?.toLowerCase() || '';

  let whereConditions = ["p.status != 'inactive'"];
  const params = [];
  let paramIndex = 1;

  // Filtro por rol (case-insensitive)
  if (normalizedRole === 'cliente') {
    whereConditions.push(`p.customer_id = (SELECT id FROM customers WHERE user_id = $${paramIndex})`);
    params.push(userId);
    paramIndex++;
  } else if (branchId) {
    whereConditions.push(`p.branch_id = $${paramIndex}`);
    params.push(branchId);
    paramIndex++;
  }

  // Filtros opcionales
  if (status) {
    whereConditions.push(`p.estado = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }
  if (customerId) {
    whereConditions.push(`p.customer_id = $${paramIndex}`);
    params.push(customerId);
    paramIndex++;
  }
  if (dateFrom) {
    whereConditions.push(`DATE(p.fecha_pedido) >= $${paramIndex}`);
    params.push(dateFrom);
    paramIndex++;
  }
  if (dateTo) {
    whereConditions.push(`DATE(p.fecha_pedido) <= $${paramIndex}`);
    params.push(dateTo);
    paramIndex++;
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Query para contar total
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM pedidos p
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Query para obtener datos con todos los campos necesarios
  // NOTA: Usar date_time_registration para mostrar hora exacta (fecha_pedido es tipo DATE sin hora)
  const dataQuery = `
    SELECT
      p.id,
      p.numero_pedido AS "orderNumber",
      p.correlativo_sede AS "correlativoSede",
      p.estado AS status,
      p.tipo_pedido AS "tipoPedido",
      p.tipo_pago AS "tipoPago",
      p.subtotal,
      p.total,
      p.observaciones AS observations,
      p.date_time_registration AS "createdAt",
      p.branch_id AS "branchId",
      p.ruta_diaria_id AS "rutaDiariaId",
      c.id AS "customerId",
      COALESCE(c.contact_name, u.name) AS "customerName",
      u.email AS "customerEmail",
      c.customer_type AS "customerType",
      rc.nombre AS "rutaNombre",
      b.code AS "branchCode",
      (SELECT COUNT(*) FROM pedido_detalles pd WHERE pd.pedido_id = p.id AND pd.status = 'active') AS "itemsCount",
      (SELECT COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0)
       FROM pedido_detalles pd
       LEFT JOIN productos prod ON pd.producto_id = prod.id
       LEFT JOIN presentaciones pres ON prod.presentacion_id = pres.id
       WHERE pd.pedido_id = p.id AND pd.status = 'active') AS "totalKilos"
    FROM pedidos p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN rutas_diarias rd ON p.ruta_diaria_id = rd.id
    LEFT JOIN rutas_config rc ON rd.ruta_config_id = rc.id
    LEFT JOIN branches b ON p.branch_id = b.id
    ${whereClause}
    ORDER BY p.date_time_registration DESC
    ${allRecords ? '' : `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`}
  `;
  if (!allRecords) {
    params.push(pageSize, offset);
  }

  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      orderNumber: row.orderNumber,
      correlativoSede: row.correlativoSede,
      branchCode: row.branchCode,
      customerId: row.customerId,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      customerType: row.customerType,
      status: row.status,
      tipoPedido: row.tipoPedido,
      tipoPago: row.tipoPago,
      total: parseFloat(row.total) || 0,
      subtotal: parseFloat(row.subtotal) || 0,
      createdAt: row.createdAt,
      branchId: row.branchId,
      rutaDiariaId: row.rutaDiariaId,
      rutaNombre: row.rutaNombre,
      itemsCount: parseInt(row.itemsCount) || 0,
      totalKilos: parseFloat(row.totalKilos) || 0,
      observations: row.observations
    })),
    pagination: {
      total,
      page: allRecords ? 1 : page,
      pageSize: allRecords ? total : pageSize,
      totalPages: allRecords ? 1 : Math.ceil(total / pageSize)
    }
  };
};

/**
 * Obtener estadisticas de pedidos - API-007
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Object>} Estadisticas por estado
 * CORRECCION: Filtra por customer_id cuando el rol es CLIENTE
 */
const getOrdersStats = async ({ branchId, date, userId, roleName }) => {
  let whereConditions = ["status != 'inactive'"];
  const params = [];
  let paramIndex = 1;

  // Normalizar rol para comparacion case-insensitive
  const normalizedRole = roleName?.toLowerCase() || '';

  // CLIENTE solo ve estadisticas de sus propios pedidos
  if (normalizedRole === 'cliente') {
    whereConditions.push(`customer_id = (SELECT id FROM customers WHERE user_id = $${paramIndex})`);
    params.push(userId);
    paramIndex++;
  } else if (branchId) {
    // Otros roles filtran por sede
    whereConditions.push(`branch_id = $${paramIndex}`);
    params.push(branchId);
    paramIndex++;
  }

  if (date) {
    whereConditions.push(`DATE(fecha_pedido) = $${paramIndex}`);
    params.push(date);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  const query = `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
      COUNT(*) FILTER (WHERE estado = 'en_proceso') AS "enProceso",
      COUNT(*) FILTER (WHERE estado = 'completado') AS completados,
      COUNT(*) FILTER (WHERE estado = 'cancelado') AS cancelados
    FROM pedidos
    ${whereClause}
  `;

  const result = await pool.query(query, params);
  const row = result.rows[0];

  return {
    total: parseInt(row.total) || 0,
    pendientes: parseInt(row.pendientes) || 0,
    enProceso: parseInt(row.enProceso) || 0,
    completados: parseInt(row.completados) || 0,
    cancelados: parseInt(row.cancelados) || 0
  };
};

/**
 * Obtener detalle de un pedido - API-008
 * @param {number} orderId - ID del pedido
 * @returns {Promise<Object|null>} Detalle del pedido
 */
const getOrderById = async (orderId) => {
  // NOTA: Usar date_time_registration para mostrar hora exacta (fecha_pedido es tipo DATE sin hora)
  const orderQuery = `
    SELECT
      p.id,
      p.numero_pedido AS "orderNumber",
      p.correlativo_sede AS "correlativoSede",
      p.estado AS status,
      p.tipo_pedido AS "tipoPedido",
      p.subtotal,
      p.total,
      p.observaciones AS observations,
      p.date_time_registration AS "createdAt",
      p.ruta_diaria_id AS "rutaDiariaId",
      p.voucher_url AS "voucherUrl",
      p.estado_pago AS "estadoPago",
      p.tipo_pago AS "tipoPago",
      p.pago_anticipado AS "pagoAnticipado",
      p.branch_id AS "branchId",
      b.code AS "branchCode",
      c.id AS "customerId",
      c.contact_name AS "customerContactName",
      c.contact_phone AS "customerContactPhone",
      c.address AS "customerAddress",
      c.customer_type AS "customerType",
      u.name AS "customerName",
      u.email AS "customerEmail",
      rd.id AS "rutaDiariaId",
      rc.nombre AS "rutaNombre"
    FROM pedidos p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN rutas_diarias rd ON p.ruta_diaria_id = rd.id
    LEFT JOIN rutas_config rc ON rd.ruta_config_id = rc.id
    LEFT JOIN branches b ON p.branch_id = b.id
    WHERE p.id = $1 AND p.status != 'inactive'
  `;

  const orderResult = await pool.query(orderQuery, [orderId]);
  if (orderResult.rows.length === 0) return null;

  const order = orderResult.rows[0];

  // Obtener items del pedido con información completa del producto
  const itemsQuery = `
    SELECT
      pd.id,
      pd.producto_id AS "productId",
      pd.cantidad AS quantity,
      pd.precio_unitario AS "unitPrice",
      pd.subtotal_linea AS subtotal,
      pr.nombre AS "productName",
      pr.codigo AS "productCode",
      pr.imagen_url AS "imagenUrl",
      p.peso AS "kilosPorBolsa",
      m.nombre AS "medidaNombre",
      e.nombre AS "especieNombre",
      p.nombre AS "presentacionNombre"
    FROM pedido_detalles pd
    LEFT JOIN productos pr ON pd.producto_id = pr.id
    LEFT JOIN medidas m ON pr.medida_id = m.id
    LEFT JOIN especies e ON pr.especie_id = e.id
    LEFT JOIN presentaciones p ON pr.presentacion_id = p.id
    WHERE pd.pedido_id = $1 AND pd.status = 'active'
  `;

  const itemsResult = await pool.query(itemsQuery, [orderId]);

  // Procesar items y calcular totales
  const items = itemsResult.rows.map(item => {
    const cantidad = parseFloat(item.quantity) || 0;
    const kilosPorBolsa = parseFloat(item.kilosPorBolsa) || 0;
    const totalKilos = cantidad * kilosPorBolsa;

    return {
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      productCode: item.productCode,
      imagenUrl: item.imagenUrl || null,
      quantity: cantidad,
      unitPrice: parseFloat(item.unitPrice) || 0,
      subtotal: parseFloat(item.subtotal) || 0,
      kilosPorBolsa: kilosPorBolsa,
      totalKilos: totalKilos,
      especieNombre: item.especieNombre || null,
      medidaNombre: item.medidaNombre || null,
      presentacionNombre: item.presentacionNombre || null
    };
  });

  // Calcular total de kilos del pedido
  const totalKilosPedido = items.reduce((sum, item) => sum + item.totalKilos, 0);

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    correlativoSede: order.correlativoSede,
    branchId: order.branchId,
    branchCode: order.branchCode,
    customer: {
      id: order.customerId,
      name: order.customerName,
      contactName: order.customerContactName,
      contactPhone: order.customerContactPhone,
      address: order.customerAddress,
      email: order.customerEmail,
      customerType: order.customerType
    },
    status: order.status,
    tipoPedido: order.tipoPedido,
    route: order.rutaDiariaId ? {
      id: order.rutaDiariaId,
      name: order.rutaNombre
    } : null,
    items: items,
    totalKilos: totalKilosPedido,
    subtotal: parseFloat(order.subtotal) || 0,
    total: parseFloat(order.total) || 0,
    observations: order.observations,
    createdAt: order.createdAt,
    voucherUrl: order.voucherUrl || null,
    estadoPago: order.estadoPago || null,
    tipoPago: order.tipoPago || null,
    pagoAnticipado: order.pagoAnticipado || false
  };
};

/**
 * Crear nuevo pedido - API-009
 * @param {Object} orderData - Datos del pedido
 * @returns {Promise<Object>} Pedido creado
 *
 * CAMBIOS ELM-032:
 * - Agregado soporte para orderType (tipo_pedido: NORMAL|ADICIONAL)
 * - Agregado soporte para estimatedDeliveryDate (fecha_entrega)
 * - Agregado soporte para isPrepaid (indicador de pago anticipado, guardado en observations con flag especial)
 * - Agregado soporte para assignRoute (asignar ruta automaticamente solo si es Delivery Propio)
 */
const createOrder = async ({
  customerId,
  paymentType,
  creditDays,
  deliveryMethod,
  observations,
  items,
  orderType,
  estimatedDeliveryDate,
  isPrepaid,
  assignRoute,
  branchId,
  userId,
  voucherUrl
}) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // VALIDACION 1: Obtener información del cliente
    const customerQuery = `
      SELECT c.id, c.customer_type, c.route_id, c.credit_days
      FROM customers c
      WHERE c.id = $1 AND c.status = 'active'
    `;
    const customerResult = await client.query(customerQuery, [customerId]);

    if (customerResult.rows.length === 0) {
      throw new Error('Cliente no encontrado o inactivo');
    }

    const customer = customerResult.rows[0];
    const customerType = customer.customer_type || 'RECURRENTE';

    // NOTA: Ya no bloqueamos pedidos NO_RECURRENTE sin voucher aquí.
    // El frontend sube el voucher DESPUÉS de crear el pedido.
    // El voucher se validará en el flujo de aprobación de pago.

    // VALIDACION 2: Determinar tipo_pago según customer_type
    let tipoPago = null;
    if (customerType === 'RECURRENTE') {
      tipoPago = 'CREDITO';
    } else if (customerType === 'NO_RECURRENTE') {
      tipoPago = 'CONTADO';
    }

    // VALIDACION 3: Verificar horario de ruta y ajustar fecha si es necesario
    // Si se pasa el horario límite, el pedido se agenda para el día siguiente
    let agendadoParaManana = false;
    let fechaEntregaAjustada = null;

    if (customer.route_id && assignRoute === true) {
      const routeQuery = `
        SELECT rc.id, rc.nombre, rc.hora_limite_recepcion
        FROM rutas_config rc
        WHERE rc.id = $1 AND rc.status = 'active'
      `;
      const routeResult = await client.query(routeQuery, [customer.route_id]);

      if (routeResult.rows.length > 0) {
        const route = routeResult.rows[0];
        const horaLimite = route.hora_limite_recepcion;

        if (horaLimite) {
          // Obtener hora actual en formato "HH:MM" (hora de Perú)
          const horaActual = getPeruTimeString();

          // Si pasó el horario límite, agendar para el día siguiente
          if (horaActual > horaLimite) {
            agendadoParaManana = true;
            // Calcular fecha del día siguiente (hora de Perú)
            fechaEntregaAjustada = getPeruDateTomorrow();
          }
        }
      }
    }

    // Generar numero de pedido con formato PED-YYYY-NNNN
    const currentYear = getPeruDate().getFullYear();
    const orderNumberQuery = `
      SELECT COALESCE(MAX(CAST(SUBSTRING(numero_pedido FROM 10) AS INTEGER)), 0) + 1 AS next_num
      FROM pedidos
      WHERE numero_pedido LIKE $1
    `;
    const orderNumberResult = await client.query(orderNumberQuery, [`PED-${currentYear}-%`]);
    const nextNum = orderNumberResult.rows[0].next_num;
    const orderNumber = `PED-${currentYear}-${String(nextNum).padStart(4, '0')}`;

    // Generar correlativo independiente por sede
    const correlativoQuery = `
      SELECT COALESCE(MAX(correlativo_sede), 0) + 1 AS next_correlativo
      FROM pedidos
      WHERE branch_id = $1 AND status = 'active'
    `;
    const correlativoResult = await client.query(correlativoQuery, [branchId]);
    const correlativoSede = correlativoResult.rows[0].next_correlativo;

    // Calcular totales
    let subtotal = 0;
    for (const item of items) {
      subtotal += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
    }
    const total = subtotal; // Sin impuestos por ahora

    // Determinar tipo_pedido (convertir ADICIONAL a 'adicional', NORMAL a 'normal')
    const tipoPedidoDB = orderType === 'ADICIONAL' ? 'adicional' : 'normal';

    // Preparar observaciones con flag de pago anticipado si aplica
    let finalObservations = observations || '';
    if (isPrepaid && paymentType === 'CONTADO') {
      finalObservations = `[PAGADO_ANTICIPADO] ${finalObservations}`.trim();
    }

    // Preparar fecha de entrega estimada
    // Si se pasó el horario límite, usar la fecha ajustada (día siguiente)
    // Si no se proporciona fecha, usar la fecha actual de Perú como default
    // IMPORTANTE: Usar siempre strings YYYY-MM-DD para evitar problemas de timezone
    const fechaAUsar = fechaEntregaAjustada || estimatedDeliveryDate;
    let fechaEntrega;

    if (fechaAUsar) {
      // Si viene como string "YYYY-MM-DD", usarla directamente
      if (typeof fechaAUsar === 'string' && fechaAUsar.match(/^\d{4}-\d{2}-\d{2}$/)) {
        fechaEntrega = fechaAUsar;
      } else {
        // Si viene como Date object, convertir a string YYYY-MM-DD
        const dateObj = new Date(fechaAUsar);
        fechaEntrega = dateObj.toLocaleDateString('sv-SE'); // sv-SE da formato YYYY-MM-DD
      }
    } else {
      // CRÍTICO: Usar fecha de Perú, no del servidor (que puede estar en UTC)
      fechaEntrega = getPeruDateString();
    }

    // Insertar pedido con los nuevos campos: voucher_url, estado_pago, tipo_pago, correlativo_sede
    // NOTA: Usar NOW() en lugar de CURRENT_DATE para capturar hora exacta del pedido
    const insertOrderQuery = `
      INSERT INTO pedidos (
        numero_pedido, correlativo_sede, customer_id, branch_id, user_id_vendedor, fecha_pedido, fecha_entrega,
        estado, tipo_pedido, subtotal, descuento, total, observaciones, voucher_url,
        estado_pago, tipo_pago, user_id_registration
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6, 'pendiente', $7, $8, 0, $9, $10, $11, $12, $13, $5)
      RETURNING id, numero_pedido, correlativo_sede, estado, total, date_time_registration
    `;
    const orderResult = await client.query(insertOrderQuery, [
      orderNumber,
      correlativoSede,
      customerId,
      branchId,
      userId,
      fechaEntrega,
      tipoPedidoDB,
      subtotal,
      total,
      finalObservations,
      voucherUrl || null,
      voucherUrl ? 'PENDIENTE' : null,
      tipoPago
    ]);

    const orderId = orderResult.rows[0].id;
    const numeroOrden = orderResult.rows[0].numero_pedido;

    // Insertar items
    for (const item of items) {
      const itemSubtotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
      await client.query(`
        INSERT INTO pedido_detalles (pedido_id, producto_id, cantidad, precio_unitario, subtotal_linea, user_id_registration)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [orderId, item.productId, item.quantity, item.unitPrice, itemSubtotal, userId]);
    }

    // CARGO AUTOMÁTICO A CRÉDITO para clientes RECURRENTES
    // El pedido se carga inmediatamente al crédito del cliente
    let creditMovementId = null;
    if (customerType === 'RECURRENTE' && total > 0) {
      // Obtener saldo actual y días de crédito del cliente
      const balanceQuery = await client.query(
        'SELECT current_balance, credit_days FROM customers WHERE id = $1',
        [customerId]
      );
      const currentBalance = parseFloat(balanceQuery.rows[0]?.current_balance) || 0;
      const creditDays = parseInt(balanceQuery.rows[0]?.credit_days) || 30;
      const newBalance = currentBalance + total;

      // Crear movimiento de crédito tipo CARGO con fecha_vencimiento calculada
      const insertMovimiento = await client.query(`
        INSERT INTO movimientos_credito (
          customer_id, pedido_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo,
          descripcion, user_id_registration, fecha_vencimiento
        )
        VALUES ($1, $2, 'CARGO', $3, $4, $5, $6, $7, NOW() + INTERVAL '1 day' * $8)
        RETURNING id
      `, [
        customerId,
        orderId,
        total,
        currentBalance,
        newBalance,
        `Cargo por pedido ${numeroOrden}`,
        userId,
        creditDays
      ]);
      creditMovementId = insertMovimiento.rows[0].id;

      // Actualizar saldo del cliente
      await client.query(`
        UPDATE customers
        SET current_balance = $1, user_id_modification = $2, date_time_modification = NOW()
        WHERE id = $3
      `, [newBalance, userId, customerId]);

      console.log('[ORDEN-CREDITO] Cargo automático creado:', {
        customerId,
        orderId,
        monto: total,
        saldoAnterior: currentBalance,
        saldoNuevo: newBalance,
        movimientoId: creditMovementId
      });
    }

    // Asignación automática de ruta basada en route_id del cliente
    // SOLO se asigna ruta si assignRoute = true (solo para "Delivery Propio/Ruta")
    // No se asigna ruta para: Taxi/Delivery Externo, Recojo en Planta, Otro
    // Usa la fecha_entrega del pedido para buscar la ruta diaria correspondiente
    let assignedRouteId = null;

    if (assignRoute === true) {
      // Primero verificar qué route_id tiene el cliente
      const clienteRouteCheck = await client.query(
        'SELECT route_id FROM customers WHERE id = $1',
        [customerId]
      );
      const clienteRouteId = clienteRouteCheck.rows[0]?.route_id;

      if (clienteRouteId) {
        // Verificar si existe ruta diaria para esa fecha y ruta_config
        const rutaExistente = await client.query(`
          SELECT rd.id, rd.ruta_config_id, rd.fecha, rd.estado, rd.status
          FROM rutas_diarias rd
          WHERE rd.ruta_config_id = $1
            AND rd.fecha = $2::date
            AND rd.status = 'active'
            AND rd.estado IN ('pendiente', 'en_proceso', 'abierta', 'en_curso')
          LIMIT 1
        `, [clienteRouteId, fechaEntrega]);

        let rutaDiariaId = rutaExistente.rows[0]?.id;

        // Si no existe ruta diaria para esa fecha, crearla automáticamente
        if (!rutaDiariaId) {
          const crearRutaDiaria = await client.query(`
            INSERT INTO rutas_diarias (ruta_config_id, fecha, estado, status, user_id_registration)
            VALUES ($1, $2::date, 'pendiente', 'active', $3)
            RETURNING id
          `, [clienteRouteId, fechaEntrega, userId]);

          rutaDiariaId = crearRutaDiaria.rows[0]?.id;
        }

        // Asignar la ruta diaria al pedido
        if (rutaDiariaId) {
          await client.query(`
            UPDATE pedidos SET ruta_diaria_id = $1 WHERE id = $2
          `, [rutaDiariaId, orderId]);
          assignedRouteId = rutaDiariaId;
        }
      }
    }
    // Si assignRoute = false (Taxi, Recojo, Otro), no se asigna ruta (assignedRouteId queda null)

    await client.query('COMMIT');

    return {
      id: orderId,
      orderNumber: orderResult.rows[0].numero_pedido,
      correlativoSede: orderResult.rows[0].correlativo_sede,
      status: orderResult.rows[0].estado,
      total: parseFloat(orderResult.rows[0].total),
      rutaDiariaId: assignedRouteId,
      rutaAsignadaAuto: assignedRouteId !== null,
      creditMovementId: creditMovementId,
      cargadoACredito: creditMovementId !== null,
      agendadoParaManana: agendadoParaManana,
      fechaEntrega: fechaEntrega // Ya es string YYYY-MM-DD
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Actualizar pedido - API-010
 * @param {number} orderId - ID del pedido
 * @param {Array} items - Items a actualizar
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Pedido actualizado
 */
const updateOrder = async (orderId, items, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que el pedido existe y esta en estado pendiente
    const checkQuery = `SELECT id, estado FROM pedidos WHERE id = $1 AND status != 'inactive'`;
    const checkResult = await client.query(checkQuery, [orderId]);

    if (checkResult.rows.length === 0) {
      throw new Error('Pedido no encontrado');
    }
    if (checkResult.rows[0].estado !== 'pendiente') {
      throw new Error('Solo se pueden editar pedidos en estado pendiente');
    }

    // Procesar items
    for (const item of items) {
      if (item.deleted) {
        // Eliminar item (soft delete)
        await client.query(`
          UPDATE pedido_detalles SET status = 'inactive', user_id_modification = $1, date_time_modification = NOW()
          WHERE id = $2 AND pedido_id = $3
        `, [userId, item.id, orderId]);
      } else if (item.id && item.quantity !== undefined) {
        // Obtener precio unitario existente de la base de datos (no del frontend por seguridad)
        const precioQuery = await client.query(`
          SELECT precio_unitario FROM pedido_detalles WHERE id = $1 AND pedido_id = $2
        `, [item.id, orderId]);

        const precioUnitario = parseFloat(precioQuery.rows[0]?.precio_unitario) || 0;
        const itemSubtotal = (parseFloat(item.quantity) || 0) * precioUnitario;

        await client.query(`
          UPDATE pedido_detalles SET cantidad = $1, subtotal_linea = $2, user_id_modification = $3, date_time_modification = NOW()
          WHERE id = $4 AND pedido_id = $5
        `, [item.quantity, itemSubtotal, userId, item.id, orderId]);
      }
    }

    // Recalcular totales del pedido
    const totalsQuery = `
      SELECT COALESCE(SUM(subtotal_linea), 0) AS subtotal
      FROM pedido_detalles
      WHERE pedido_id = $1 AND status = 'active'
    `;
    const totalsResult = await client.query(totalsQuery, [orderId]);
    const newSubtotal = parseFloat(totalsResult.rows[0].subtotal) || 0;
    const newTotal = newSubtotal;

    await client.query(`
      UPDATE pedidos SET subtotal = $1, total = $2, user_id_modification = $3, date_time_modification = NOW()
      WHERE id = $4
    `, [newSubtotal, newTotal, userId, orderId]);

    // Sincronizar CARGO en movimientos_credito si el pedido tiene uno (clientes RECURRENTES)
    // El CARGO se creó al momento de crear el pedido con el total original.
    // Si el total cambió, debemos actualizar el monto del CARGO y el saldo del cliente.
    const cargoQuery = await client.query(`
      SELECT mc.id, mc.monto, mc.customer_id
      FROM movimientos_credito mc
      WHERE mc.pedido_id = $1 AND mc.tipo_movimiento = 'CARGO' AND mc.status = 'active'
    `, [orderId]);

    if (cargoQuery.rows.length > 0) {
      const cargo = cargoQuery.rows[0];
      const oldCargoMonto = parseFloat(cargo.monto) || 0;
      const diferencia = newTotal - oldCargoMonto;

      if (Math.abs(diferencia) > 0.01) {
        // Actualizar monto del CARGO
        await client.query(`
          UPDATE movimientos_credito
          SET monto = $1,
              descripcion = descripcion || ' [Ajustado por edicion de pedido]',
              user_id_modification = $2,
              date_time_modification = NOW()
          WHERE id = $3
        `, [newTotal, userId, cargo.id]);

        // Ajustar saldo del cliente con la diferencia
        await client.query(`
          UPDATE customers
          SET current_balance = current_balance + $1,
              user_id_modification = $2,
              date_time_modification = NOW()
          WHERE id = $3
        `, [diferencia, userId, cargo.customer_id]);

        console.log('[EDITAR-PEDIDO] CARGO actualizado:', {
          orderId, cargoId: cargo.id,
          montoAnterior: oldCargoMonto, montoNuevo: newTotal,
          diferencia, customerId: cargo.customer_id
        });
      }
    }

    await client.query('COMMIT');

    // Retornar pedido actualizado
    return await getOrderById(orderId);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Cancelar pedido - API-011
 * @param {number} orderId - ID del pedido
 * @param {string} reason - Motivo de cancelacion
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Pedido cancelado
 */
const cancelOrder = async (orderId, reason, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que el pedido puede ser cancelado
    const checkQuery = `SELECT id, estado, customer_id FROM pedidos WHERE id = $1 AND status != 'inactive'`;
    const checkResult = await client.query(checkQuery, [orderId]);

    if (checkResult.rows.length === 0) {
      throw new Error('Pedido no encontrado');
    }

    const currentStatus = checkResult.rows[0].estado;
    if (!['pendiente', 'en_proceso'].includes(currentStatus)) {
      throw new Error('Solo se pueden cancelar pedidos en estado pendiente o en_proceso');
    }

    const customerId = checkResult.rows[0].customer_id;

    // Desactivar cargos de credito asociados al pedido y revertir saldo del cliente
    const cargosQuery = await client.query(`
      SELECT id, monto FROM movimientos_credito
      WHERE pedido_id = $1 AND tipo_movimiento = 'CARGO' AND status = 'active'
    `, [orderId]);

    if (cargosQuery.rows.length > 0 && customerId) {
      const totalCargoRevertir = cargosQuery.rows.reduce((sum, c) => sum + parseFloat(c.monto), 0);
      const cargoIds = cargosQuery.rows.map(c => c.id);

      // Desactivar todos los cargos asociados
      await client.query(`
        UPDATE movimientos_credito
        SET status = 'inactive',
            descripcion = descripcion || ' [CANCELADO]',
            user_id_modification = $1,
            date_time_modification = NOW()
        WHERE id = ANY($2)
      `, [userId, cargoIds]);

      // Revertir saldo del cliente
      await client.query(`
        UPDATE customers
        SET current_balance = current_balance - $1,
            user_id_modification = $2,
            date_time_modification = NOW()
        WHERE id = $3
      `, [totalCargoRevertir, userId, customerId]);

      console.log('[CANCELAR-PEDIDO] Cargos desactivados y saldo revertido:', {
        orderId, customerId, cargosDesactivados: cargoIds.length, montoRevertido: totalCargoRevertir
      });
    }

    // Cancelar el pedido
    const updateQuery = `
      UPDATE pedidos
      SET estado = 'cancelado',
          observaciones = COALESCE(observaciones || ' | ', '') || 'CANCELADO: ' || $1,
          user_id_modification = $2,
          date_time_modification = NOW()
      WHERE id = $3
      RETURNING id, estado AS status, date_time_modification AS "cancelledAt"
    `;
    const result = await client.query(updateQuery, [reason, userId, orderId]);

    await client.query('COMMIT');
    return result.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Asignar pedido a ruta - API-012
 * @param {number} orderId - ID del pedido
 * @param {number} rutaDiariaId - ID de la ruta diaria
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Pedido con ruta asignada
 */
const assignRoute = async (orderId, rutaDiariaId, userId) => {
  // Verificar que el pedido existe y no está cancelado
  const checkPedido = `SELECT id, estado FROM pedidos WHERE id = $1 AND status != 'inactive'`;
  const pedidoResult = await pool.query(checkPedido, [orderId]);

  if (pedidoResult.rows.length === 0) {
    throw new Error('Pedido no encontrado');
  }
  if (pedidoResult.rows[0].estado === 'cancelado') {
    throw new Error('No se puede asignar ruta a un pedido cancelado');
  }

  // Verificar que la ruta diaria existe y está activa
  const checkRuta = `
    SELECT rd.id, rc.nombre
    FROM rutas_diarias rd
    JOIN rutas_config rc ON rd.ruta_config_id = rc.id
    WHERE rd.id = $1 AND rd.status = 'active'
  `;
  const rutaResult = await pool.query(checkRuta, [rutaDiariaId]);

  if (rutaResult.rows.length === 0) {
    throw new Error('Ruta diaria no encontrada o inactiva');
  }

  // Asignar ruta al pedido
  const updateQuery = `
    UPDATE pedidos
    SET ruta_diaria_id = $1,
        user_id_modification = $2,
        date_time_modification = NOW()
    WHERE id = $3
    RETURNING id, ruta_diaria_id
  `;

  await pool.query(updateQuery, [rutaDiariaId, userId, orderId]);

  return {
    id: orderId,
    routeId: rutaDiariaId,
    route: {
      name: rutaResult.rows[0].nombre
    }
  };
};

/**
 * Marcar pedido como entregado - API-013
 * @param {Object} data - Datos de entrega
 * @returns {Promise<Object>} Pedido entregado
 */
const deliverOrder = async ({ orderId, paymentType, cashAmount, creditAmount, creditDays, acceptExceedLimit, userId }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar estado del pedido y si ya tiene movimiento de crédito
    const checkPedido = `
      SELECT p.id, p.estado, p.total, p.customer_id, p.tipo_pago,
             c.current_balance, c.credit_days AS customer_credit_days,
             (SELECT COUNT(*) FROM movimientos_credito mc WHERE mc.pedido_id = p.id AND mc.tipo_movimiento = 'CARGO' AND mc.status = 'active') AS cargos_existentes
      FROM pedidos p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE p.id = $1 AND p.status != 'inactive'
    `;
    const pedidoResult = await client.query(checkPedido, [orderId]);

    if (pedidoResult.rows.length === 0) {
      throw new Error('Pedido no encontrado');
    }

    const pedido = pedidoResult.rows[0];
    if (!['pendiente', 'en_proceso'].includes(pedido.estado)) {
      throw new Error('Solo se pueden entregar pedidos en estado pendiente o en_proceso');
    }
    if (pedido.estado === 'completado') {
      throw new Error('El pedido ya fue entregado');
    }

    const total = parseFloat(pedido.total) || 0;
    const cash = parseFloat(cashAmount) || 0;
    const credit = parseFloat(creditAmount) || 0;

    // Validar montos si es MIXTO
    if (paymentType === 'MIXTO' && Math.abs((cash + credit) - total) > 0.01) {
      throw new Error('La suma de monto contado + monto crédito debe ser igual al total');
    }

    let creditMovementId = null;
    const cargosExistentes = parseInt(pedido.cargos_existentes) || 0;

    // Si hay monto a crédito Y no hay cargos previos (evitar duplicar cargo de clientes RECURRENTES)
    // Los clientes RECURRENTES ya tienen su cargo creado al momento de crear el pedido
    if (credit > 0 && pedido.customer_id && cargosExistentes === 0) {
      const currentBalance = parseFloat(pedido.current_balance) || 0;
      const customerCreditDays = parseInt(pedido.customer_credit_days) || 30;
      const newBalance = currentBalance + credit;

      // Crear movimiento de crédito (CARGO) con fecha_vencimiento calculada
      const insertMovimiento = `
        INSERT INTO movimientos_credito (
          customer_id, pedido_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo,
          descripcion, user_id_registration, fecha_vencimiento
        )
        VALUES ($1, $2, 'CARGO', $3, $4, $5, $6, $7, NOW() + INTERVAL '1 day' * $8)
        RETURNING id
      `;
      const movResult = await client.query(insertMovimiento, [
        pedido.customer_id, orderId, credit, currentBalance, newBalance,
        `Cargo por pedido #${orderId}`, userId, customerCreditDays
      ]);
      creditMovementId = movResult.rows[0].id;

      // Actualizar saldo del cliente
      await client.query(`
        UPDATE customers SET current_balance = $1, user_id_modification = $2, date_time_modification = NOW()
        WHERE id = $3
      `, [newBalance, userId, pedido.customer_id]);

      console.log('[ENTREGA] Cargo adicional creado en entrega (no había cargo previo)');
    } else if (cargosExistentes > 0) {
      console.log('[ENTREGA] Ya existe cargo previo para este pedido, no se crea duplicado');
    }

    // Actualizar pedido como entregado
    // Nota: monto_contado, monto_credito y dias_credito no existen en la tabla pedidos
    // La informacion de pago se guarda en movimientos_credito y en observaciones
    // NOTA: Usar NOW() en lugar de CURRENT_DATE para capturar hora exacta de entrega
    const updatePedido = `
      UPDATE pedidos
      SET estado = 'completado',
          fecha_entrega = NOW(),
          observaciones = COALESCE(observaciones || ' | ', '') || $1,
          user_id_modification = $2,
          date_time_modification = NOW()
      WHERE id = $3
      RETURNING id, estado, date_time_modification AS "deliveredAt"
    `;

    // Construir nota de pago para observaciones
    let notaPago = `Pago: ${paymentType}`;
    if (cash > 0) notaPago += ` | Contado: $${cash.toFixed(2)}`;
    if (credit > 0) notaPago += ` | Credito: $${credit.toFixed(2)} (${creditDays || 0} dias)`;

    const result = await client.query(updatePedido, [
      notaPago, userId, orderId
    ]);

    await client.query('COMMIT');

    return {
      id: orderId,
      status: 'completado',
      deliveredAt: result.rows[0].deliveredAt,
      creditMovementId
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Agregar voucher a un pedido
 * @param {number} orderId - ID del pedido
 * @param {string} voucherUrl - URL del archivo de voucher
 * @param {number} userId - ID del usuario que sube el voucher
 * @returns {Promise<Object>} Pedido actualizado
 */
const addVoucher = async (orderId, voucherUrl, userId) => {
  // Verificar que el pedido existe
  const checkQuery = `
    SELECT id, estado, voucher_url, observaciones
    FROM pedidos
    WHERE id = $1 AND status != 'inactive'
  `;
  const checkResult = await pool.query(checkQuery, [orderId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Pedido no encontrado');
  }

  const pedido = checkResult.rows[0];

  // Validar que el pedido no esté completado o cancelado
  if (pedido.estado === 'cancelado') {
    throw new Error('No se puede agregar voucher a un pedido cancelado');
  }

  // Actualizar voucher_url y estado_pago a PENDIENTE si no estaba definido
  const updateQuery = `
    UPDATE pedidos
    SET voucher_url = $1,
        estado_pago = COALESCE(estado_pago, 'PENDIENTE'),
        user_id_modification = $2,
        date_time_modification = NOW()
    WHERE id = $3
    RETURNING id, voucher_url, estado_pago
  `;

  const result = await pool.query(updateQuery, [voucherUrl, userId, orderId]);

  return {
    id: result.rows[0].id,
    voucherUrl: result.rows[0].voucher_url,
    estadoPago: result.rows[0].estado_pago
  };
};

/**
 * Actualizar estado de pago de un pedido
 * @param {number} orderId - ID del pedido
 * @param {string} status - APROBADO | RECHAZADO | PENDIENTE
 * @param {string} observaciones - Observaciones adicionales
 * @param {number} userId - ID del usuario que realiza la accion
 * @returns {Promise<Object>} Pedido actualizado
 */
const updatePaymentStatus = async (orderId, status, observaciones, userId) => {
  // Verificar que el pedido existe
  const checkQuery = `
    SELECT id, estado, voucher_url, estado_pago
    FROM pedidos
    WHERE id = $1 AND status != 'inactive'
  `;
  const checkResult = await pool.query(checkQuery, [orderId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Pedido no encontrado');
  }

  const pedido = checkResult.rows[0];

  // Validar que el pedido tenga voucher
  if (!pedido.voucher_url) {
    throw new Error('El pedido no tiene voucher asociado. No se puede aprobar/rechazar');
  }

  // Construir observaciones con nota de aprobacion/rechazo
  let notaActualizacion = '';
  if (status === 'APROBADO') {
    notaActualizacion = `[PAGO APROBADO]`;
  } else if (status === 'RECHAZADO') {
    notaActualizacion = `[PAGO RECHAZADO: ${observaciones}]`;
  } else {
    notaActualizacion = `[PAGO EN REVISION]`;
  }

  const finalObservaciones = pedido.observaciones
    ? `${pedido.observaciones} | ${notaActualizacion}`
    : notaActualizacion;

  // Actualizar estado_pago y observaciones
  const updateQuery = `
    UPDATE pedidos
    SET estado_pago = $1,
        observaciones = $2,
        user_id_modification = $3,
        date_time_modification = NOW()
    WHERE id = $4
    RETURNING id, estado_pago
  `;

  const result = await pool.query(updateQuery, [status, finalObservaciones, userId, orderId]);

  return {
    id: result.rows[0].id,
    estadoPago: result.rows[0].estado_pago
  };
};

module.exports = {
  listOrders,
  getOrdersStats,
  getOrderById,
  createOrder,
  updateOrder,
  cancelOrder,
  assignRoute,
  deliverOrder,
  addVoucher,
  updatePaymentStatus
};
