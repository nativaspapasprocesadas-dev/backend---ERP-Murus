/**
 * Routes Model - API-041, API-042, API-043
 * Segun diseno en 04_apis_lista.md
 * Tablas reales: rutas_config, rutas_diarias, pedidos, choferes
 */
const pool = require('../config/db');
const { getPeruDateString, getPeruDateDaysAgo, formatDateFromDB } = require('../utils/dateUtils');

/**
 * Crear configuracion de ruta - API-041
 * @param {Object} data - Datos de la ruta
 * @returns {Promise<Object>} Ruta creada
 */
const createRouteConfig = async ({ name, color, description, branchId, userId, horaLimiteRecepcion }) => {
  // Verificar que no exista una ruta con el mismo nombre en la sede
  const checkQuery = `
    SELECT id FROM rutas_config
    WHERE nombre = $1 AND branch_id = $2 AND status = 'active'
  `;
  const checkResult = await pool.query(checkQuery, [name, branchId]);

  if (checkResult.rows.length > 0) {
    throw new Error('Ya existe una ruta con ese nombre en esta sede');
  }

  // Validar formato de hora_limite_recepcion si se proporciona
  if (horaLimiteRecepcion && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(horaLimiteRecepcion)) {
    throw new Error('horaLimiteRecepcion debe tener formato HH:MM (00:00 - 23:59)');
  }

  // Obtener orden maximo para nueva ruta
  const orderQuery = `
    SELECT COALESCE(MAX(orden), 0) + 1 AS next_orden
    FROM rutas_config
    WHERE branch_id = $1 AND status = 'active'
  `;
  const orderResult = await pool.query(orderQuery, [branchId]);
  const orden = orderResult.rows[0].next_orden;

  const insertQuery = `
    INSERT INTO rutas_config (nombre, descripcion, branch_id, color, orden, hora_limite_recepcion, status, user_id_registration)
    VALUES ($1, $2, $3, $4, $5, $6, 'active', $7)
    RETURNING id, nombre, descripcion, branch_id, color, orden, hora_limite_recepcion, status, date_time_registration
  `;

  const result = await pool.query(insertQuery, [name, description, branchId, color || '#3B82F6', orden, horaLimiteRecepcion || null, userId]);
  const row = result.rows[0];

  return {
    id: row.id,
    name: row.nombre,
    color: row.color || '#3B82F6',
    description: row.descripcion,
    horaLimiteRecepcion: row.hora_limite_recepcion,
    isActive: row.status === 'active'
  };
};

/**
 * Actualizar configuracion de ruta - API-042
 * @param {number} routeConfigId - ID de la configuracion de ruta
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} Ruta actualizada
 */
const updateRouteConfig = async (routeConfigId, { name, color, description, isActive, userId, horaLimiteRecepcion, order }) => {
  // Verificar que la ruta existe (incluir activas e inactivas para permitir reactivación)
  const checkQuery = `SELECT id, branch_id, status FROM rutas_config WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [routeConfigId]);

  if (checkResult.rows.length === 0) {
    throw new Error('Configuracion de ruta no encontrada');
  }

  const branchId = checkResult.rows[0].branch_id;

  // Si se cambia el nombre, verificar que no exista otra con el mismo nombre
  if (name) {
    const nameCheck = `
      SELECT id FROM rutas_config
      WHERE nombre = $1 AND branch_id = $2 AND id != $3 AND status = 'active'
    `;
    const nameResult = await pool.query(nameCheck, [name, branchId, routeConfigId]);
    if (nameResult.rows.length > 0) {
      throw new Error('Ya existe otra ruta con ese nombre en esta sede');
    }
  }

  // Validar formato de hora_limite_recepcion si se proporciona
  if (horaLimiteRecepcion !== undefined && horaLimiteRecepcion !== null && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(horaLimiteRecepcion)) {
    throw new Error('horaLimiteRecepcion debe tener formato HH:MM (00:00 - 23:59)');
  }

  // Construir query de actualizacion dinamica
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`nombre = $${paramIndex}`);
    params.push(name);
    paramIndex++;
  }
  if (color !== undefined) {
    updates.push(`color = $${paramIndex}`);
    params.push(color);
    paramIndex++;
  }
  if (description !== undefined) {
    updates.push(`descripcion = $${paramIndex}`);
    params.push(description);
    paramIndex++;
  }
  if (horaLimiteRecepcion !== undefined) {
    updates.push(`hora_limite_recepcion = $${paramIndex}`);
    params.push(horaLimiteRecepcion);
    paramIndex++;
  }
  if (order !== undefined) {
    updates.push(`orden = $${paramIndex}`);
    params.push(order);
    paramIndex++;
  }
  if (isActive !== undefined) {
    updates.push(`status = $${paramIndex}`);
    params.push(isActive ? 'active' : 'inactive');
    paramIndex++;
  }

  updates.push(`user_id_modification = $${paramIndex}`);
  params.push(userId);
  paramIndex++;

  updates.push('date_time_modification = NOW()');

  params.push(routeConfigId);

  const updateQuery = `
    UPDATE rutas_config
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, nombre, descripcion, color, hora_limite_recepcion, orden, status, date_time_modification
  `;

  const result = await pool.query(updateQuery, params);
  const row = result.rows[0];

  return {
    id: row.id,
    name: row.nombre,
    color: row.color || '#3B82F6',
    description: row.descripcion,
    horaLimiteRecepcion: row.hora_limite_recepcion,
    order: row.orden,
    isActive: row.status === 'active',
    updatedAt: row.date_time_modification
  };
};

/**
 * Obtener datos de ruta para exportar a PDF - API-043
 * @param {number} routeId - ID de la ruta diaria
 * @returns {Promise<Object>} Datos de la ruta con pedidos
 */
const getRouteForExport = async (routeId) => {
  // Obtener datos de la ruta diaria
  const routeQuery = `
    SELECT
      rd.id,
      rd.fecha,
      rd.estado,
      rd.hora_inicio,
      rd.hora_fin,
      rd.observaciones,
      rc.nombre AS ruta_nombre,
      rc.descripcion AS ruta_descripcion,
      ch.id AS chofer_id,
      ch.nombre AS chofer_nombre,
      ch.licencia AS chofer_licencia
    FROM rutas_diarias rd
    JOIN rutas_config rc ON rd.ruta_config_id = rc.id
    LEFT JOIN choferes ch ON rd.chofer_id = ch.id
    WHERE rd.id = $1 AND rd.status = 'active'
  `;

  const routeResult = await pool.query(routeQuery, [routeId]);

  if (routeResult.rows.length === 0) {
    throw new Error('Ruta no encontrada');
  }

  const route = routeResult.rows[0];

  // Obtener pedidos de la ruta
  const ordersQuery = `
    SELECT
      p.id,
      p.numero_pedido,
      p.total,
      p.estado,
      p.observaciones,
      c.contact_name AS cliente_contacto,
      c.contact_phone AS cliente_telefono,
      c.address AS cliente_direccion,
      u.name AS cliente_nombre
    FROM pedidos p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON c.user_id = u.id
    WHERE p.ruta_diaria_id = $1 AND p.status = 'active'
    ORDER BY p.id
  `;

  const ordersResult = await pool.query(ordersQuery, [routeId]);

  // Obtener detalles de cada pedido
  const ordersWithDetails = [];
  for (const order of ordersResult.rows) {
    const itemsQuery = `
      SELECT
        pd.cantidad,
        pd.precio_unitario,
        pd.subtotal_linea,
        pr.nombre AS producto_nombre,
        pr.codigo AS producto_codigo,
        e.nombre AS especie_nombre,
        m.nombre AS medida_nombre,
        pres.peso AS kilos_por_unidad,
        pres.nombre AS presentacion_nombre
      FROM pedido_detalles pd
      LEFT JOIN productos pr ON pd.producto_id = pr.id
      LEFT JOIN especies e ON pr.especie_id = e.id
      LEFT JOIN medidas m ON pr.medida_id = m.id
      LEFT JOIN presentaciones pres ON pr.presentacion_id = pres.id
      WHERE pd.pedido_id = $1 AND pd.status = 'active'
    `;
    const itemsResult = await pool.query(itemsQuery, [order.id]);

    // Calcular total de kilos
    let totalKilos = 0;
    const items = itemsResult.rows.map(item => {
      const cantidad = parseFloat(item.cantidad) || 0;
      const kilosPorUnidad = parseFloat(item.kilos_por_unidad) || 1;
      totalKilos += cantidad * kilosPorUnidad;
      return {
        productCode: item.producto_codigo,
        productName: item.producto_nombre,
        species: item.especie_nombre,
        measure: item.medida_nombre,
        presentation: item.presentacion_nombre,
        quantity: cantidad,
        kilos: kilosPorUnidad,
        unitPrice: parseFloat(item.precio_unitario) || 0,
        subtotal: parseFloat(item.subtotal_linea) || 0
      };
    });

    ordersWithDetails.push({
      id: order.id,
      orderNumber: order.numero_pedido,
      status: order.estado,
      customer: {
        name: order.cliente_nombre,
        contactName: order.cliente_contacto,
        phone: order.cliente_telefono,
        address: order.cliente_direccion
      },
      items,
      totalKilos,
      total: parseFloat(order.total) || 0,
      observations: order.observaciones
    });
  }

  // Calcular totales generales
  const totalKilosRoute = ordersWithDetails.reduce((sum, o) => sum + o.totalKilos, 0);
  const totalAmountRoute = ordersWithDetails.reduce((sum, o) => sum + o.total, 0);

  return {
    id: route.id,
    name: route.ruta_nombre,
    description: route.ruta_descripcion,
    date: formatDateFromDB(route.fecha),
    status: route.estado,
    startTime: route.hora_inicio,
    endTime: route.hora_fin,
    observations: route.observaciones,
    driver: route.chofer_id ? {
      id: route.chofer_id,
      name: route.chofer_nombre,
      license: route.chofer_licencia
    } : null,
    orders: ordersWithDetails,
    summary: {
      totalOrders: ordersWithDetails.length,
      totalKilos: totalKilosRoute,
      totalAmount: totalAmountRoute
    }
  };
};

/**
 * Listar rutas del dia - API-036
 * GET /api/v1/routes
 * Tablas: rutas_diarias, rutas_config, pedidos, choferes
 * @param {Object} filters - Filtros (date, dateFrom, dateTo, branchId, status, includeHistory)
 * @returns {Promise<Object>} Lista de rutas con estadisticas
 */
const listDailyRoutes = async ({ date, dateFrom, dateTo, branchId, status, userBranchId, roleName, includeHistory }) => {
  let whereConditions = ["rd.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  // Filtro por fecha(s)
  if (includeHistory === 'true' || includeHistory === true) {
    // Incluir historial: traer rutas de los ultimos 60 dias (hora de Perú)
    whereConditions.push(`rd.fecha >= $${paramIndex}`);
    params.push(getPeruDateDaysAgo(60));
    paramIndex++;
  } else if (dateFrom && dateTo) {
    // Rango de fechas especifico
    whereConditions.push(`rd.fecha >= $${paramIndex}`);
    params.push(dateFrom);
    paramIndex++;
    whereConditions.push(`rd.fecha <= $${paramIndex}`);
    params.push(dateTo);
    paramIndex++;
  } else {
    // Default: fecha especifica o fecha de hoy (hora de Perú)
    const targetDate = date || getPeruDateString();
    whereConditions.push(`rd.fecha = $${paramIndex}`);
    params.push(targetDate);
    paramIndex++;
  }

  // Filtro por sede segun rol
  if (roleName !== 'SUPERADMINISTRADOR' && userBranchId) {
    whereConditions.push(`rc.branch_id = $${paramIndex}`);
    params.push(userBranchId);
    paramIndex++;
  } else if (branchId) {
    whereConditions.push(`rc.branch_id = $${paramIndex}`);
    params.push(parseInt(branchId));
    paramIndex++;
  }

  // Filtro por estado
  if (status) {
    whereConditions.push(`rd.estado = $${paramIndex}`);
    params.push(status.toLowerCase());
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  // Query principal
  const dataQuery = `
    SELECT
      rd.id,
      rc.nombre AS name,
      rc.id AS "routeConfigId",
      rd.estado AS status,
      rd.fecha AS date,
      rd.hora_inicio AS "startTime",
      rd.hora_fin AS "endTime",
      rd.observaciones AS observations,
      ch.id AS "driverId",
      ch.nombre AS "driverName",
      ch.licencia AS "driverLicense",
      rc.branch_id AS "branchId",
      (SELECT COUNT(*) FROM pedidos p WHERE p.ruta_diaria_id = rd.id AND p.status = 'active') AS "orderCount",
      (SELECT COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0)
       FROM pedidos p
       JOIN pedido_detalles pd ON pd.pedido_id = p.id
       LEFT JOIN productos prod ON pd.producto_id = prod.id
       LEFT JOIN presentaciones pres ON prod.presentacion_id = pres.id
       WHERE p.ruta_diaria_id = rd.id AND p.status = 'active' AND pd.status = 'active') AS "totalKilos",
      (SELECT COALESCE(SUM(p.total), 0)
       FROM pedidos p
       WHERE p.ruta_diaria_id = rd.id AND p.status = 'active') AS "totalAmount"
    FROM rutas_diarias rd
    JOIN rutas_config rc ON rd.ruta_config_id = rc.id
    LEFT JOIN choferes ch ON rd.chofer_id = ch.id
    WHERE ${whereClause}
    ORDER BY rd.fecha DESC, rc.orden ASC, rc.nombre ASC
  `;

  const result = await pool.query(dataQuery, params);

  return {
    data: result.rows.map(row => ({
      id: row.id,
      name: row.name,
      routeConfigId: row.routeConfigId,
      color: '#3B82F6', // Color por defecto
      status: row.status,
      date: formatDateFromDB(row.date),
      startTime: row.startTime,
      endTime: row.endTime,
      observations: row.observations,
      orderCount: parseInt(row.orderCount) || 0,
      totalKilos: parseFloat(row.totalKilos) || 0,
      totalAmount: parseFloat(row.totalAmount) || 0,
      branchId: row.branchId,
      driverId: row.driverId,
      driverName: row.driverName,
      driverLicense: row.driverLicense,
      driver: row.driverId ? {
        id: row.driverId,
        name: row.driverName,
        license: row.driverLicense
      } : null
    }))
  };
};

/**
 * Obtener detalle de ruta - API-037
 * GET /api/v1/routes/{id}
 * @param {number} routeId - ID de la ruta diaria
 * @returns {Promise<Object>} Detalle de ruta con pedidos
 */
const getRouteDetail = async (routeId) => {
  // Obtener datos de la ruta
  const routeQuery = `
    SELECT
      rd.id,
      rc.nombre AS name,
      rd.estado AS status,
      rd.fecha AS date,
      rd.hora_inicio AS "startTime",
      rd.hora_fin AS "endTime",
      rd.observaciones AS observations,
      ch.id AS "driverId",
      ch.nombre AS "driverName",
      ch.licencia AS "driverLicense"
    FROM rutas_diarias rd
    JOIN rutas_config rc ON rd.ruta_config_id = rc.id
    LEFT JOIN choferes ch ON rd.chofer_id = ch.id
    WHERE rd.id = $1 AND rd.status = 'active'
  `;

  const routeResult = await pool.query(routeQuery, [routeId]);
  if (routeResult.rows.length === 0) {
    throw new Error('Ruta no encontrada');
  }

  const route = routeResult.rows[0];

  // Obtener pedidos de la ruta
  const ordersQuery = `
    SELECT
      p.id,
      p.numero_pedido AS "orderNumber",
      p.total,
      p.estado AS status,
      c.id AS "customerId",
      u.name AS "customerName",
      c.address AS "customerAddress",
      c.contact_phone AS "customerPhone",
      (SELECT COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0)
       FROM pedido_detalles pd
       LEFT JOIN productos prod ON pd.producto_id = prod.id
       LEFT JOIN presentaciones pres ON prod.presentacion_id = pres.id
       WHERE pd.pedido_id = p.id AND pd.status = 'active') AS "totalKilos"
    FROM pedidos p
    LEFT JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON c.user_id = u.id
    WHERE p.ruta_diaria_id = $1 AND p.status = 'active'
    ORDER BY p.id
  `;

  const ordersResult = await pool.query(ordersQuery, [routeId]);

  // Obtener items/detalles de cada pedido para poder imprimir tickets
  const ordersWithDetails = [];
  for (const order of ordersResult.rows) {
    const itemsQuery = `
      SELECT
        pd.cantidad,
        pd.precio_unitario,
        pd.subtotal_linea,
        pr.nombre AS producto_nombre,
        pr.codigo AS producto_codigo,
        e.nombre AS especie_nombre,
        m.nombre AS medida_nombre,
        pres.peso AS kilos_por_unidad,
        pres.nombre AS presentacion_nombre
      FROM pedido_detalles pd
      LEFT JOIN productos pr ON pd.producto_id = pr.id
      LEFT JOIN especies e ON pr.especie_id = e.id
      LEFT JOIN medidas m ON pr.medida_id = m.id
      LEFT JOIN presentaciones pres ON pr.presentacion_id = pres.id
      WHERE pd.pedido_id = $1 AND pd.status = 'active'
    `;
    const itemsResult = await pool.query(itemsQuery, [order.id]);

    // Obtener tipo de pago y pago anticipado del pedido
    const paymentQuery = `
      SELECT tipo_pago, pago_anticipado, observaciones
      FROM pedidos
      WHERE id = $1
    `;
    const paymentResult = await pool.query(paymentQuery, [order.id]);
    const paymentData = paymentResult.rows[0] || {};

    // Calcular total de kilos
    let totalKilosCalculado = 0;
    const items = itemsResult.rows.map(item => {
      const cantidad = parseFloat(item.cantidad) || 0;
      const kilosPorUnidad = parseFloat(item.kilos_por_unidad) || 1;
      totalKilosCalculado += cantidad * kilosPorUnidad;
      return {
        productCode: item.producto_codigo,
        productName: item.producto_nombre,
        species: item.especie_nombre,
        measure: item.medida_nombre,
        presentation: item.presentacion_nombre,
        quantity: cantidad,
        kilos: kilosPorUnidad,
        unitPrice: parseFloat(item.precio_unitario) || 0,
        subtotal: parseFloat(item.subtotal_linea) || 0
      };
    });

    ordersWithDetails.push({
      id: order.id,
      orderNumber: order.orderNumber,
      customer: {
        id: order.customerId,
        name: order.customerName,
        address: order.customerAddress,
        phone: order.customerPhone
      },
      items,
      totalKilos: totalKilosCalculado || parseFloat(order.totalKilos) || 0,
      total: parseFloat(order.total) || 0,
      status: order.status,
      tipoPago: paymentData.tipo_pago || 'PENDIENTE',
      pagadoAnticipado: paymentData.pago_anticipado || false,
      diasCredito: 0,
      observations: paymentData.observaciones || ''
    });
  }

  return {
    id: route.id,
    name: route.name,
    status: route.status,
    date: formatDateFromDB(route.date),
    startTime: route.startTime,
    endTime: route.endTime,
    observations: route.observations,
    driver: route.driverId ? {
      id: route.driverId,
      name: route.driverName,
      license: route.driverLicense
    } : null,
    orders: ordersWithDetails
  };
};

/**
 * Asignar chofer y enviar ruta - API-038
 * POST /api/v1/routes/{id}/dispatch
 * @param {number} routeId - ID de la ruta diaria
 * @param {number} driverId - ID del chofer
 * @param {number} userId - ID del usuario que ejecuta
 * @returns {Promise<Object>} Ruta actualizada
 */
const dispatchRoute = async (routeId, driverId, userId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar que la ruta existe y esta ABIERTA (pendiente)
    const routeCheck = await client.query(
      `SELECT id, estado, chofer_id FROM rutas_diarias WHERE id = $1 AND status = 'active'`,
      [routeId]
    );
    if (routeCheck.rows.length === 0) {
      throw new Error('Ruta no encontrada');
    }
    if (routeCheck.rows[0].estado !== 'pendiente') {
      throw new Error('La ruta debe estar en estado pendiente para ser enviada');
    }

    // Verificar que el chofer existe y esta activo
    const driverCheck = await client.query(`
      SELECT id, is_active, nombre
      FROM choferes
      WHERE id = $1 AND status = 'active'
    `, [driverId]);
    if (driverCheck.rows.length === 0) {
      throw new Error('Chofer no encontrado');
    }
    if (!driverCheck.rows[0].is_active) {
      throw new Error('El chofer no esta activo');
    }

    // Verificar que el chofer no esta asignado a otra ruta activa hoy
    const driverRouteCheck = await client.query(`
      SELECT id FROM rutas_diarias
      WHERE chofer_id = $1
        AND fecha = CURRENT_DATE
        AND estado NOT IN ('completada', 'cancelada')
        AND id != $2
        AND status = 'active'
    `, [driverId, routeId]);
    if (driverRouteCheck.rows.length > 0) {
      throw new Error('El chofer ya esta asignado a otra ruta activa hoy');
    }

    // Actualizar ruta: asignar chofer y cambiar estado a 'en_curso'
    const updateQuery = `
      UPDATE rutas_diarias
      SET
        chofer_id = $1,
        estado = 'en_curso',
        hora_inicio = NOW(),
        user_id_modification = $2,
        date_time_modification = NOW()
      WHERE id = $3
      RETURNING id, estado, chofer_id, hora_inicio
    `;
    const updateResult = await client.query(updateQuery, [driverId, userId, routeId]);

    await client.query('COMMIT');

    // Obtener datos del chofer para response
    const driverData = await pool.query(`
      SELECT id, nombre AS name, licencia AS license
      FROM choferes
      WHERE id = $1
    `, [driverId]);

    return {
      id: updateResult.rows[0].id,
      status: updateResult.rows[0].estado,
      dispatchedAt: updateResult.rows[0].hora_inicio,
      driver: {
        id: driverData.rows[0].id,
        name: driverData.rows[0].name,
        license: driverData.rows[0].license
      }
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Completar ruta - API-039
 * POST /api/v1/routes/{id}/complete
 * @param {number} routeId - ID de la ruta diaria
 * @param {number} userId - ID del usuario que ejecuta
 * @returns {Promise<Object>} Ruta completada
 *
 * IMPORTANTE: Al completar una ruta, también se marcan como "completado"
 * todos los pedidos asociados a esa ruta.
 */
const completeRoute = async (routeId, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que la ruta existe y esta ENVIADA (en_curso)
    const routeCheck = await client.query(
      `SELECT id, estado FROM rutas_diarias WHERE id = $1 AND status = 'active'`,
      [routeId]
    );
    if (routeCheck.rows.length === 0) {
      throw new Error('Ruta no encontrada');
    }

    const currentStatus = routeCheck.rows[0].estado;

    // Si ya esta completada, retornar estado actual (idempotente)
    if (currentStatus === 'completada') {
      await client.query('COMMIT');
      const existingRoute = await pool.query(`
        SELECT id, estado, hora_fin
        FROM rutas_diarias
        WHERE id = $1
      `, [routeId]);
      return {
        id: existingRoute.rows[0].id,
        status: existingRoute.rows[0].estado,
        completedAt: existingRoute.rows[0].hora_fin
      };
    }

    if (currentStatus !== 'en_curso') {
      throw new Error('La ruta debe estar en curso para ser completada');
    }

    // 1. Actualizar ruta: cambiar estado a 'completada'
    const updateRouteQuery = `
      UPDATE rutas_diarias
      SET
        estado = 'completada',
        hora_fin = NOW(),
        user_id_modification = $1,
        date_time_modification = NOW()
      WHERE id = $2
      RETURNING id, estado, hora_fin
    `;
    const updateResult = await client.query(updateRouteQuery, [userId, routeId]);

    // 2. Actualizar todos los pedidos de esta ruta a estado 'completado'
    const updateOrdersQuery = `
      UPDATE pedidos
      SET
        estado = 'completado',
        user_id_modification = $1,
        date_time_modification = NOW()
      WHERE ruta_diaria_id = $2
        AND status = 'active'
        AND estado NOT IN ('cancelado', 'completado')
    `;
    const ordersResult = await client.query(updateOrdersQuery, [userId, routeId]);

    await client.query('COMMIT');

    return {
      id: updateResult.rows[0].id,
      status: updateResult.rows[0].estado,
      completedAt: updateResult.rows[0].hora_fin,
      ordersCompleted: ordersResult.rowCount
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Reabrir ruta - Revertir de en_curso a pendiente
 * POST /api/v1/routes/{id}/reopen
 * Mantiene el chofer asignado. Solo revierte el estado para permitir agregar más pedidos.
 * @param {number} routeId - ID de la ruta diaria
 * @param {number} userId - ID del usuario que ejecuta
 * @returns {Promise<Object>} Ruta reabierta
 */
const reopenRoute = async (routeId, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const routeCheck = await client.query(
      `SELECT id, estado, chofer_id FROM rutas_diarias WHERE id = $1 AND status = 'active'`,
      [routeId]
    );
    if (routeCheck.rows.length === 0) {
      throw new Error('Ruta no encontrada');
    }

    const currentStatus = routeCheck.rows[0].estado;

    if (currentStatus !== 'en_curso') {
      throw new Error('Solo se puede reabrir una ruta que está en curso (enviada)');
    }

    const updateQuery = `
      UPDATE rutas_diarias
      SET
        estado = 'pendiente',
        user_id_modification = $1,
        date_time_modification = NOW()
      WHERE id = $2
      RETURNING id, estado, chofer_id
    `;
    const updateResult = await client.query(updateQuery, [userId, routeId]);

    await client.query('COMMIT');

    return {
      id: updateResult.rows[0].id,
      status: updateResult.rows[0].estado,
      driverId: updateResult.rows[0].chofer_id
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Listar configuracion de rutas - API-040
 * GET /api/v1/routes/config
 * @param {Object} filters - Filtros (branchId)
 * @returns {Promise<Array>} Lista de configuraciones de rutas
 */
const listRouteConfigs = async ({ branchId, userBranchId, roleName, includeInactive }) => {
  let whereConditions = [];
  const params = [];
  let paramIndex = 1;

  // Por defecto mostrar todas las rutas (activas e inactivas) para permitir gestión completa
  // Solo filtrar por 'active' si explícitamente se pide (includeInactive = false)
  if (includeInactive === false) {
    whereConditions.push("rc.status = 'active'");
  } else {
    // Excluir solo las eliminadas permanentemente (si hubiera ese estado)
    whereConditions.push("rc.status IN ('active', 'inactive')");
  }

  // Filtro por sede segun rol
  if (roleName !== 'SUPERADMINISTRADOR' && userBranchId) {
    whereConditions.push(`rc.branch_id = $${paramIndex}`);
    params.push(userBranchId);
    paramIndex++;
  } else if (branchId) {
    whereConditions.push(`rc.branch_id = $${paramIndex}`);
    params.push(parseInt(branchId));
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  const query = `
    SELECT
      rc.id,
      rc.nombre AS name,
      rc.descripcion AS description,
      rc.branch_id AS "branchId",
      b.name AS "branchName",
      rc.color,
      rc.orden AS "order",
      rc.hora_limite_recepcion AS "horaLimiteRecepcion",
      rc.status = 'active' AS "isActive"
    FROM rutas_config rc
    LEFT JOIN branches b ON rc.branch_id = b.id
    WHERE ${whereClause}
    ORDER BY rc.orden ASC, rc.nombre ASC
  `;

  const result = await pool.query(query, params);

  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    color: row.color || '#3B82F6',
    description: row.description,
    branchId: row.branchId,
    branchName: row.branchName,
    order: row.order,
    horaLimiteRecepcion: row.horaLimiteRecepcion,
    isActive: row.isActive
  }));
};

/**
 * Obtener configuracion de ruta por ID
 * GET /api/v1/routes/config/:id
 * @param {number} routeConfigId - ID de la configuracion de ruta
 * @returns {Promise<Object>} Configuracion de ruta
 */
const getRouteConfigById = async (routeConfigId) => {
  const query = `
    SELECT
      rc.id,
      rc.nombre AS name,
      rc.descripcion AS description,
      rc.branch_id AS "branchId",
      b.name AS "branchName",
      rc.color,
      rc.orden AS "order",
      rc.hora_limite_recepcion AS "horaLimiteRecepcion",
      rc.status = 'active' AS "isActive"
    FROM rutas_config rc
    LEFT JOIN branches b ON rc.branch_id = b.id
    WHERE rc.id = $1 AND rc.status != 'inactive'
  `;

  const result = await pool.query(query, [routeConfigId]);

  if (result.rows.length === 0) {
    throw new Error('Configuracion de ruta no encontrada');
  }

  const row = result.rows[0];

  return {
    id: row.id,
    name: row.name,
    color: row.color || '#3B82F6',
    description: row.description,
    branchId: row.branchId,
    branchName: row.branchName,
    order: row.order,
    horaLimiteRecepcion: row.horaLimiteRecepcion,
    isActive: row.isActive
  };
};

/**
 * Validar estado de horario de una ruta
 * GET /api/v1/routes/config/:id/schedule-status
 * @param {number} routeConfigId - ID de la configuracion de ruta
 * @returns {Promise<Object>} Estado de la ruta (abierta/cerrada)
 */
const validateScheduleStatus = async (routeConfigId) => {
  // Obtener configuracion de ruta
  const routeConfig = await getRouteConfigById(routeConfigId);

  // Si no tiene hora_limite_recepcion, la ruta esta siempre abierta
  if (!routeConfig.horaLimiteRecepcion) {
    return {
      isOpen: true,
      horaLimiteRecepcion: null,
      message: 'La ruta no tiene horario limite configurado. Esta abierta todo el dia.'
    };
  }

  // Obtener hora actual (formato HH:MM)
  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Comparar horas
  const isOpen = currentTime <= routeConfig.horaLimiteRecepcion;

  return {
    isOpen,
    horaLimiteRecepcion: routeConfig.horaLimiteRecepcion,
    currentTime,
    message: isOpen
      ? `La ruta esta ABIERTA. Puede recibir pedidos hasta las ${routeConfig.horaLimiteRecepcion}.`
      : `La ruta esta CERRADA. El horario limite era ${routeConfig.horaLimiteRecepcion}.`
  };
};

module.exports = {
  createRouteConfig,
  updateRouteConfig,
  getRouteForExport,
  listDailyRoutes,
  getRouteDetail,
  dispatchRoute,
  completeRoute,
  reopenRoute,
  listRouteConfigs,
  getRouteConfigById,
  validateScheduleStatus
};
