/**
 * Reports Model - API-061, API-062, API-063, API-064, API-065, API-066
 * Segun diseno en 04_apis_lista.md
 * Tablas reales: pedidos, pedido_detalles, productos, especies, customers, rutas_diarias, rutas_config, movimientos_credito
 */
const pool = require('../config/db');
const { getPeruDateString, formatDateFromDB } = require('../utils/dateUtils');

/**
 * Obtener resumen de reportes - API-061
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Object>} Resumen general de ventas
 */
const getReportsSummary = async ({ dateFrom, dateTo, branchId }) => {
  let whereConditions = ["p.status = 'active'", "p.estado = 'completado'"];
  const params = [];
  let paramIndex = 1;

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
  if (branchId) {
    whereConditions.push(`p.branch_id = $${paramIndex}`);
    params.push(branchId);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Query para totales generales
  // Fuente de verdad: pedido_detalles (subtotal_linea para montos, cantidad * peso para kilos)
  const totalsQuery = `
    SELECT
      COUNT(DISTINCT p.id) AS total_orders,
      COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0) AS total_kilos,
      COALESCE(SUM(pd.subtotal_linea), 0) AS total_amount
    FROM pedidos p
    LEFT JOIN pedido_detalles pd ON p.id = pd.pedido_id AND pd.status = 'active'
    LEFT JOIN productos prod ON pd.producto_id = prod.id
    LEFT JOIN presentaciones pres ON prod.presentacion_id = pres.id
    ${whereClause}
  `;
  const totalsResult = await pool.query(totalsQuery, params);
  const totals = totalsResult.rows[0];

  // Query para top 5 clientes por monto
  const topClientsQuery = `
    SELECT
      c.id,
      COALESCE(c.contact_name, u.name) AS name,
      SUM(p.total) AS total_amount,
      COUNT(p.id) AS orders_count
    FROM pedidos p
    JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON c.user_id = u.id
    ${whereClause}
    GROUP BY c.id, c.contact_name, u.name
    ORDER BY total_amount DESC
    LIMIT 5
  `;
  const topClientsResult = await pool.query(topClientsQuery, params);

  // Query para top 5 productos por cantidad
  const topProductsQuery = `
    SELECT
      pr.id,
      pr.nombre AS name,
      pr.codigo AS code,
      SUM(pd.cantidad) AS total_quantity
    FROM pedidos p
    JOIN pedido_detalles pd ON p.id = pd.pedido_id AND pd.status = 'active'
    JOIN productos pr ON pd.producto_id = pr.id
    ${whereClause}
    GROUP BY pr.id, pr.nombre, pr.codigo
    ORDER BY total_quantity DESC
    LIMIT 5
  `;
  const topProductsResult = await pool.query(topProductsQuery, params);

  // Query para estado de cartera (deuda total y vencida)
  // IMPORTANTE: Usamos cálculo dinámico (CARGO + SALDO_INICIAL - ABONO) para consistencia con creditsModel
  // y el mismo filtro de sede (ruta del cliente O sede del usuario)
  let portfolioWhereConditions = ["c.status = 'active'"];
  const portfolioParams = [];
  let portfolioParamIndex = 1;

  // Filtro por sede: consistente con creditsModel.js (API-022)
  // Filtra clientes cuya ruta pertenece a la sede O cuyo usuario pertenece a la sede
  if (branchId) {
    portfolioWhereConditions.push(`(
      (c.route_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM rutas_config rc WHERE rc.id = c.route_id AND rc.branch_id = $${portfolioParamIndex}
      ))
      OR (c.route_id IS NULL AND u.branch_id = $${portfolioParamIndex})
    )`);
    portfolioParams.push(branchId);
    portfolioParamIndex++;
  }

  const portfolioWhereClause = 'WHERE ' + portfolioWhereConditions.join(' AND ');

  // Query con cálculo dinámico de deuda: CARGO + SALDO_INICIAL - ABONO
  // Consistente con creditsModel.js para evitar discrepancias
  const portfolioQuery = `
    SELECT
      COALESCE(SUM(CASE
        WHEN (
          COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
          - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                      WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
        ) > 0 THEN (
          COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
          - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                      WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
        )
        ELSE 0
      END), 0) AS total_debt,
      COUNT(CASE
        WHEN (
          COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
          - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                      WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
        ) > 0 THEN 1
      END) AS customers_with_debt
    FROM customers c
    LEFT JOIN users u ON c.user_id = u.id
    ${portfolioWhereClause}
  `;
  const portfolioResult = await pool.query(portfolioQuery, portfolioParams);
  const portfolio = portfolioResult.rows[0];

  // Calcular deuda vencida y cantidad de clientes con deuda vencida
  // Usando el mismo filtro de sede y cálculo dinámico para consistencia
  let overdueWhereConditions = [
    "c.status = 'active'"
  ];
  const overdueParams = [];
  let overdueParamIndex = 1;

  if (branchId) {
    overdueWhereConditions.push(`(
      (c.route_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM rutas_config rc WHERE rc.id = c.route_id AND rc.branch_id = $${overdueParamIndex}
      ))
      OR (c.route_id IS NULL AND u.branch_id = $${overdueParamIndex})
    )`);
    overdueParams.push(branchId);
    overdueParamIndex++;
  }

  const overdueWhereClause = 'WHERE ' + overdueWhereConditions.join(' AND ');

  // Query para clientes con cargos vencidos (que tengan deuda > 0)
  const overdueDebtQuery = `
    SELECT
      COALESCE(SUM(sub.overdue_amount), 0) AS overdue_debt,
      COUNT(*) AS customers_with_overdue
    FROM (
      SELECT
        c.id,
        (
          SELECT COALESCE(SUM(mc.monto), 0)
          FROM movimientos_credito mc
          WHERE mc.customer_id = c.id
            AND mc.status = 'active'
            AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL')
            AND mc.fecha_vencimiento IS NOT NULL
            AND mc.fecha_vencimiento < NOW()
        ) AS overdue_amount,
        (
          COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
          - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                      WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
        ) AS total_debt
      FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      ${overdueWhereClause}
    ) sub
    WHERE sub.total_debt > 0 AND sub.overdue_amount > 0
  `;
  const overdueDebtResult = await pool.query(overdueDebtQuery, overdueParams);
  const overdueDebt = parseFloat(overdueDebtResult.rows[0].overdue_debt) || 0;
  const customersWithOverdueDebt = parseInt(overdueDebtResult.rows[0].customers_with_overdue) || 0;

  // Calcular clientes cerca del límite de crédito (>=80%)
  // Usando el mismo filtro de sede para consistencia
  let nearLimitWhereConditions = [
    "c.status = 'active'",
    "c.credit_limit > 0"
  ];
  const nearLimitParams = [];
  let nearLimitParamIndex = 1;

  if (branchId) {
    nearLimitWhereConditions.push(`(
      (c.route_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM rutas_config rc WHERE rc.id = c.route_id AND rc.branch_id = $${nearLimitParamIndex}
      ))
      OR (c.route_id IS NULL AND u.branch_id = $${nearLimitParamIndex})
    )`);
    nearLimitParams.push(branchId);
    nearLimitParamIndex++;
  }

  const nearLimitWhereClause = 'WHERE ' + nearLimitWhereConditions.join(' AND ');

  // Query con cálculo dinámico de deuda para comparar con límite de crédito
  const nearLimitQuery = `
    SELECT COUNT(*) AS customers_near_limit
    FROM (
      SELECT
        c.id,
        c.credit_limit,
        (
          COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
          - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                      WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
        ) AS current_debt
      FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      ${nearLimitWhereClause}
    ) sub
    WHERE sub.current_debt > 0 AND (sub.current_debt / sub.credit_limit) >= 0.8
  `;
  const nearLimitResult = await pool.query(nearLimitQuery, nearLimitParams);
  const customersNearLimit = parseInt(nearLimitResult.rows[0].customers_near_limit) || 0;

  return {
    totalOrders: parseInt(totals.total_orders) || 0,
    totalKilos: parseFloat(totals.total_kilos) || 0,
    totalAmount: parseFloat(totals.total_amount) || 0,
    topClients: topClientsResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      totalAmount: parseFloat(row.total_amount) || 0,
      ordersCount: parseInt(row.orders_count) || 0
    })),
    topProducts: topProductsResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      code: row.code,
      totalQuantity: parseFloat(row.total_quantity) || 0
    })),
    portfolioStatus: {
      totalDebt: parseFloat(portfolio.total_debt) || 0,
      overdueDebt: overdueDebt,
      customersWithDebt: parseInt(portfolio.customers_with_debt) || 0,
      customersWithOverdueDebt: customersWithOverdueDebt,
      customersNearLimit: customersNearLimit
    }
  };
};

/**
 * Reporte de ventas diarias - API-062
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Object>} Reporte de ventas por dia
 */
const getDailySalesReport = async ({ dateFrom, dateTo, branchId }) => {
  let whereConditions = ["p.status = 'active'", "p.estado = 'completado'"];
  const params = [];
  let paramIndex = 1;

  // dateFrom y dateTo son obligatorios segun diseno
  whereConditions.push(`DATE(p.fecha_pedido) >= $${paramIndex}`);
  params.push(dateFrom);
  paramIndex++;

  whereConditions.push(`DATE(p.fecha_pedido) <= $${paramIndex}`);
  params.push(dateTo);
  paramIndex++;

  if (branchId) {
    whereConditions.push(`p.branch_id = $${paramIndex}`);
    params.push(branchId);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Query para resumen total
  // NOTA: total_kilos se calcula como pd.cantidad * pres.peso
  // donde peso es el peso en kg de la presentacion
  // NOTA: total_amount usa pd.subtotal_linea para coincidir con la tabla de productos
  const summaryQuery = `
    SELECT
      COUNT(DISTINCT p.id) AS total_orders,
      COALESCE(SUM(pd.subtotal_linea), 0) AS total_amount,
      COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0) AS total_kilos,
      COALESCE(SUM(pd.cantidad), 0) AS total_bags,
      COUNT(DISTINCT pd.producto_id) AS total_products
    FROM pedidos p
    LEFT JOIN pedido_detalles pd ON p.id = pd.pedido_id AND pd.status = 'active'
    LEFT JOIN productos prod ON pd.producto_id = prod.id
    LEFT JOIN presentaciones pres ON prod.presentacion_id = pres.id
    ${whereClause}
  `;
  const summaryResult = await pool.query(summaryQuery, params);
  const summary = summaryResult.rows[0];

  // Query para detalle por producto
  // NOTA: Campos corregidos segun estructura real de tablas:
  // - total_kilos = pd.cantidad * pres.peso (peso de presentacion)
  // - total_monto = pd.subtotal_linea
  // - precio_promedio_kg = pd.precio_unitario / pres.peso
  // - imagen_url no existe en tabla productos
  const detailsByProductQuery = `
    SELECT
      prod.id AS producto_id,
      prod.nombre AS nombre_producto,
      esp.nombre AS especie,
      med.nombre AS medida,
      pres.peso AS presentacion_peso,
      pres.nombre AS tipo_corte,
      COALESCE(SUM(pd.cantidad), 0) AS cantidad_bolsas,
      COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0) AS total_kilos,
      COALESCE(AVG(pd.precio_unitario / NULLIF(pres.peso, 0)), 0) AS precio_promedio_kg,
      COALESCE(SUM(pd.subtotal_linea), 0) AS total_monto,
      COUNT(DISTINCT p.id) AS cantidad_pedidos
    FROM pedido_detalles pd
    INNER JOIN pedidos p ON pd.pedido_id = p.id
    INNER JOIN productos prod ON pd.producto_id = prod.id AND prod.status = 'active'
    LEFT JOIN especies esp ON prod.especie_id = esp.id AND esp.status = 'active'
    LEFT JOIN medidas med ON prod.medida_id = med.id AND med.status = 'active'
    LEFT JOIN presentaciones pres ON prod.presentacion_id = pres.id AND pres.status = 'active'
    ${whereClause.replace('p.status', 'pd.status')}
    GROUP BY prod.id, prod.nombre, esp.nombre, med.nombre, pres.peso, pres.nombre
    ORDER BY total_monto DESC
  `;
  const detailsByProductResult = await pool.query(detailsByProductQuery, params);

  return {
    summary: {
      totalOrders: parseInt(summary.total_orders) || 0,
      totalAmount: parseFloat(summary.total_amount) || 0,
      totalKilos: parseFloat(summary.total_kilos) || 0,
      totalBags: parseInt(summary.total_bags) || 0,
      totalProducts: parseInt(summary.total_products) || 0
    },
    productDetails: detailsByProductResult.rows.map(row => ({
      productoId: row.producto_id,
      nombreProducto: row.nombre_producto,
      especie: row.especie,
      medida: row.medida,
      presentacion: parseFloat(row.presentacion) || 0,
      tipoCorte: row.tipo_corte,
      cantidadBolsas: parseInt(row.cantidad_bolsas) || 0,
      totalKilos: parseFloat(row.total_kilos) || 0,
      precioPromedioKg: parseFloat(row.precio_promedio_kg) || 0,
      totalMonto: parseFloat(row.total_monto) || 0,
      cantidadPedidos: parseInt(row.cantidad_pedidos) || 0
    }))
  };
};

/**
 * Reporte de rutas - API-063
 * @param {Object} params - Parametros de filtro (dateFrom, dateTo, branchId)
 * @returns {Promise<Object>} Reporte de rendimiento por ruta
 */
const getRoutesReport = async ({ dateFrom, dateTo, branchId }) => {
  const hoy = getPeruDateString();
  const fechaInicio = dateFrom || hoy;
  const fechaFin = dateTo || dateFrom || hoy;

  let whereConditions = ["rd.status = 'active'", "DATE(rd.fecha) >= $1", "DATE(rd.fecha) <= $2"];
  const params = [fechaInicio, fechaFin];
  let paramIndex = 3;

  if (branchId) {
    whereConditions.push(`rc.branch_id = $${paramIndex}`);
    params.push(branchId);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Query principal: rutas con totales, logistica y chofer
  const query = `
    SELECT
      rc.id AS route_config_id,
      rc.nombre AS route_name,
      rc.color AS route_color,
      rc.descripcion AS route_descripcion,
      rc.hora_limite_recepcion,
      rd.id AS route_daily_id,
      rd.estado AS route_status,
      rd.fecha AS route_date,
      rd.hora_inicio,
      rd.hora_fin,
      rd.kilometraje_inicio,
      rd.kilometraje_fin,
      rd.observaciones,
      rd.chofer_id,
      ch.nombre AS chofer_nombre,
      ch.telefono AS chofer_telefono,
      COUNT(DISTINCT p.id) AS order_count,
      COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0) AS total_kilos,
      COALESCE((SELECT SUM(sub_p.total) FROM pedidos sub_p WHERE sub_p.ruta_diaria_id = rd.id AND sub_p.status = 'active' AND sub_p.estado != 'cancelado'), 0) AS total_amount
    FROM rutas_diarias rd
    JOIN rutas_config rc ON rd.ruta_config_id = rc.id
    LEFT JOIN choferes ch ON rd.chofer_id = ch.id
    LEFT JOIN pedidos p ON p.ruta_diaria_id = rd.id AND p.status = 'active' AND p.estado != 'cancelado'
    LEFT JOIN pedido_detalles pd ON p.id = pd.pedido_id AND pd.status = 'active'
    LEFT JOIN productos prod ON pd.producto_id = prod.id
    LEFT JOIN presentaciones pres ON prod.presentacion_id = pres.id
    ${whereClause}
    GROUP BY rc.id, rc.nombre, rc.color, rc.descripcion, rc.hora_limite_recepcion,
             rd.id, rd.estado, rd.fecha, rd.hora_inicio, rd.hora_fin,
             rd.kilometraje_inicio, rd.kilometraje_fin, rd.observaciones,
             rd.chofer_id, ch.nombre, ch.telefono
    HAVING COUNT(DISTINCT p.id) > 0
    ORDER BY rd.fecha DESC, rc.nombre ASC
  `;

  const result = await pool.query(query, params);

  // Obtener todos los route_daily_ids para queries batch
  const dailyIds = result.rows.map(r => r.route_daily_id);

  let ordersMap = {};
  let productDetailsMap = {};

  if (dailyIds.length > 0) {
    // Query batch: pedidos con info de cliente (1 sola query para todos)
    const ordersQuery = `
      SELECT
        p.ruta_diaria_id,
        p.id,
        p.numero_pedido,
        u.name AS cliente,
        c.address AS direccion,
        c.contact_phone AS telefono_contacto,
        c.customer_type AS tipo_cliente,
        p.total,
        p.estado
      FROM pedidos p
      LEFT JOIN customers c ON p.customer_id = c.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE p.ruta_diaria_id = ANY($1) AND p.status = 'active' AND p.estado != 'cancelado'
      ORDER BY p.ruta_diaria_id, p.numero_pedido
    `;
    const ordersResult = await pool.query(ordersQuery, [dailyIds]);

    ordersResult.rows.forEach(row => {
      const key = row.ruta_diaria_id;
      if (!ordersMap[key]) ordersMap[key] = [];
      ordersMap[key].push({
        id: row.id,
        numeroPedido: row.numero_pedido,
        cliente: row.cliente || 'Sin nombre',
        direccion: row.direccion || null,
        telefonoContacto: row.telefono_contacto || null,
        tipoCliente: row.tipo_cliente || null,
        total: parseFloat(row.total) || 0,
        estado: row.estado
      });
    });

    // Query batch: productos agrupados por ruta (1 sola query para todos)
    const productQuery = `
      SELECT
        p.ruta_diaria_id,
        prod.nombre AS nombre_producto,
        esp.nombre AS especie,
        SUM(pd.cantidad) AS cantidad_bolsas,
        SUM(pd.cantidad * COALESCE(pres.peso, 1)) AS total_kilos
      FROM pedido_detalles pd
      JOIN pedidos p ON pd.pedido_id = p.id
      JOIN productos prod ON pd.producto_id = prod.id
      LEFT JOIN especies esp ON prod.especie_id = esp.id
      LEFT JOIN presentaciones pres ON prod.presentacion_id = pres.id
      WHERE p.ruta_diaria_id = ANY($1) AND p.status = 'active' AND p.estado != 'cancelado' AND pd.status = 'active'
      GROUP BY p.ruta_diaria_id, prod.nombre, esp.nombre
      ORDER BY p.ruta_diaria_id, total_kilos DESC
    `;
    const productResult = await pool.query(productQuery, [dailyIds]);

    productResult.rows.forEach(row => {
      const key = row.ruta_diaria_id;
      if (!productDetailsMap[key]) productDetailsMap[key] = [];
      productDetailsMap[key].push({
        nombreProducto: row.nombre_producto,
        especie: row.especie || 'Sin especie',
        cantidadBolsas: parseInt(row.cantidad_bolsas) || 0,
        totalKilos: parseFloat(row.total_kilos) || 0
      });
    });
  }

  // Ensamblar respuesta
  const routes = result.rows.map(row => ({
    id: row.route_config_id,
    dailyId: row.route_daily_id,
    name: row.route_name,
    color: row.route_color || '#3B82F6',
    descripcion: row.route_descripcion || null,
    horaLimite: row.hora_limite_recepcion || null,
    date: formatDateFromDB(row.route_date),
    status: row.route_status || 'pendiente',
    horaInicio: row.hora_inicio || null,
    horaFin: row.hora_fin || null,
    kmInicio: row.kilometraje_inicio ? parseFloat(row.kilometraje_inicio) : null,
    kmFin: row.kilometraje_fin ? parseFloat(row.kilometraje_fin) : null,
    observaciones: row.observaciones || null,
    orderCount: parseInt(row.order_count) || 0,
    totalKilos: parseFloat(row.total_kilos) || 0,
    totalAmount: parseFloat(row.total_amount) || 0,
    choferId: row.chofer_id || null,
    choferNombre: row.chofer_nombre || null,
    choferTelefono: row.chofer_telefono || null,
    orders: ordersMap[row.route_daily_id] || [],
    productDetails: productDetailsMap[row.route_daily_id] || []
  }));

  return {
    dateFrom: fechaInicio,
    dateTo: fechaFin,
    routes
  };
};

/**
 * Reporte de kilos por especie - API-064
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Object>} Distribucion de kilos por especie
 */
const getKilosBySpeciesReport = async ({ dateFrom, dateTo, speciesId, branchId, groupByDate = false }) => {
  let whereConditions = ["p.status = 'active'", "p.estado = 'completado'"];
  const params = [];
  let paramIndex = 1;

  // dateFrom y dateTo son obligatorios segun diseno
  whereConditions.push(`DATE(p.fecha_pedido) >= $${paramIndex}`);
  params.push(dateFrom);
  paramIndex++;

  whereConditions.push(`DATE(p.fecha_pedido) <= $${paramIndex}`);
  params.push(dateTo);
  paramIndex++;

  if (speciesId) {
    whereConditions.push(`e.id = $${paramIndex}`);
    params.push(speciesId);
    paramIndex++;
  }
  if (branchId) {
    whereConditions.push(`p.branch_id = $${paramIndex}`);
    params.push(branchId);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Query para total general (kilos y pedidos)
  // Fuente de verdad: cantidad * peso de presentacion = kilos reales
  const totalQuery = `
    SELECT
      COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0) AS total_kilos,
      COUNT(DISTINCT p.id) AS total_orders
    FROM pedidos p
    JOIN pedido_detalles pd ON p.id = pd.pedido_id AND pd.status = 'active'
    JOIN productos pr ON pd.producto_id = pr.id
    JOIN especies e ON pr.especie_id = e.id
    LEFT JOIN presentaciones pres ON pr.presentacion_id = pres.id
    ${whereClause}
  `;
  const totalResult = await pool.query(totalQuery, params);
  const totalKilos = parseFloat(totalResult.rows[0].total_kilos) || 0;
  const totalOrders = parseInt(totalResult.rows[0].total_orders) || 0;

  // Query para detalle por especie (agregado)
  const detailQuery = `
    SELECT
      e.id,
      e.nombre AS species,
      COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0) AS kilos
    FROM pedidos p
    JOIN pedido_detalles pd ON p.id = pd.pedido_id AND pd.status = 'active'
    JOIN productos pr ON pd.producto_id = pr.id
    JOIN especies e ON pr.especie_id = e.id
    LEFT JOIN presentaciones pres ON pr.presentacion_id = pres.id
    ${whereClause}
    GROUP BY e.id, e.nombre
    ORDER BY kilos DESC
  `;
  const detailResult = await pool.query(detailQuery, params);

  const baseResponse = {
    totalKilos,
    totalOrders,
    bySpecies: detailResult.rows.map(row => ({
      id: row.id,
      species: row.species,
      kilos: parseFloat(row.kilos) || 0,
      percentage: totalKilos > 0 ? ((parseFloat(row.kilos) || 0) / totalKilos * 100).toFixed(2) : 0
    }))
  };

  // Si se solicita agrupación por fecha, agregar el desglose diario
  if (groupByDate === true || groupByDate === 'true') {
    // Query para kilos por especie por día
    const dailyDetailQuery = `
      SELECT
        DATE(p.fecha_pedido) AS fecha,
        e.id AS especie_id,
        e.nombre AS especie,
        COALESCE(SUM(pd.cantidad * COALESCE(pres.peso, 1)), 0) AS kilos
      FROM pedidos p
      JOIN pedido_detalles pd ON p.id = pd.pedido_id AND pd.status = 'active'
      JOIN productos pr ON pd.producto_id = pr.id
      JOIN especies e ON pr.especie_id = e.id
      LEFT JOIN presentaciones pres ON pr.presentacion_id = pres.id
      ${whereClause}
      GROUP BY DATE(p.fecha_pedido), e.id, e.nombre
      ORDER BY fecha DESC, especie ASC
    `;
    const dailyDetailResult = await pool.query(dailyDetailQuery, params);

    // Query separada para pedidos únicos por día
    const dailyOrdersQuery = `
      SELECT
        DATE(p.fecha_pedido) AS fecha,
        COUNT(DISTINCT p.id) AS pedidos
      FROM pedidos p
      JOIN pedido_detalles pd ON p.id = pd.pedido_id AND pd.status = 'active'
      JOIN productos pr ON pd.producto_id = pr.id
      JOIN especies e ON pr.especie_id = e.id
      ${whereClause}
      GROUP BY DATE(p.fecha_pedido)
    `;
    const dailyOrdersResult = await pool.query(dailyOrdersQuery, params);

    // Crear mapa de pedidos por fecha
    // Usar formatDateFromDB para evitar problemas de timezone
    const pedidosPorFecha = {};
    dailyOrdersResult.rows.forEach(row => {
      const fechaStr = formatDateFromDB(row.fecha);
      pedidosPorFecha[fechaStr] = parseInt(row.pedidos) || 0;
    });

    baseResponse.byDate = dailyDetailResult.rows.map(row => {
      const fechaStr = formatDateFromDB(row.fecha);
      return {
        fecha: fechaStr,  // Devolver como string YYYY-MM-DD para evitar problemas de timezone
        especieId: row.especie_id,
        especie: row.especie,
        kilos: parseFloat(row.kilos) || 0,
        pedidos: pedidosPorFecha[fechaStr] || 0
      };
    });
  }

  return baseResponse;
};

/**
 * Reporte de clientes - API-065
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Object>} Estadisticas de clientes
 */
const getCustomersReport = async ({ branchId, hasDebt, customerType, page = 1, pageSize = 20 }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  let whereConditions = ["c.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  // Filtro por sede: consistente con creditsModel.js y reportsModel (API-061)
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

  // Filtro por deuda usando cálculo dinámico (CARGO + SALDO_INICIAL - ABONO)
  if (hasDebt === 'true' || hasDebt === true) {
    whereConditions.push(`(
      COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
      - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                  WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
    ) > 0`);
  } else if (hasDebt === 'false' || hasDebt === false) {
    whereConditions.push(`(
      COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
      - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                  WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
    ) <= 0`);
  }

  // Filtro por tipo de cliente (RECURRENTE o NO_RECURRENTE)
  if (customerType) {
    whereConditions.push(`c.customer_type = $${paramIndex}`);
    params.push(customerType);
    paramIndex++;
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Query para resumen total usando cálculo dinámico
  const summaryQuery = `
    SELECT
      COUNT(c.id) AS total_customers,
      COALESCE(SUM(CASE
        WHEN (
          COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
          - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                      WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
        ) > 0 THEN (
          COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
          - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                      WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
        )
        ELSE 0
      END), 0) AS total_debt,
      COUNT(CASE
        WHEN (
          COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
          - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                      WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
        ) > 0 THEN 1
      END) AS customers_with_debt,
      COUNT(CASE WHEN COALESCE(u.is_active, true) = true THEN 1 END) AS active_customers
    FROM customers c
    LEFT JOIN users u ON c.user_id = u.id
    ${whereClause}
  `;
  const summaryResult = await pool.query(summaryQuery, params);
  const summary = summaryResult.rows[0];

  // Calcular deuda vencida (aplicando los mismos filtros)
  // Si se filtra por "sin deuda", la deuda vencida es 0
  let overdueDebt = 0;

  if (hasDebt !== 'false' && hasDebt !== false) {
    let overdueWhereConditions = ["c.status = 'active'"];
    const overdueParams = [];
    let overdueParamIndex = 1;

    // Filtro de sede consistente
    if (branchId) {
      overdueWhereConditions.push(`(
        (c.route_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM rutas_config rc WHERE rc.id = c.route_id AND rc.branch_id = $${overdueParamIndex}
        ))
        OR (c.route_id IS NULL AND u.branch_id = $${overdueParamIndex})
      )`);
      overdueParams.push(branchId);
      overdueParamIndex++;
    }

    // Aplicar filtro de tipo de cliente a deuda vencida
    if (customerType) {
      overdueWhereConditions.push(`c.customer_type = $${overdueParamIndex}`);
      overdueParams.push(customerType);
      overdueParamIndex++;
    }

    const overdueWhereClause = 'WHERE ' + overdueWhereConditions.join(' AND ');

    // Query con cálculo dinámico de deuda
    const overdueDebtQuery = `
      SELECT COALESCE(SUM(sub.overdue_amount), 0) AS overdue_debt
      FROM (
        SELECT
          c.id,
          (
            SELECT COALESCE(SUM(mc.monto), 0)
            FROM movimientos_credito mc
            WHERE mc.customer_id = c.id
              AND mc.status = 'active'
              AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL')
              AND mc.fecha_vencimiento IS NOT NULL
              AND mc.fecha_vencimiento < NOW()
          ) AS overdue_amount,
          (
            COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                      WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
            - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                        WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
          ) AS total_debt
        FROM customers c
        LEFT JOIN users u ON c.user_id = u.id
        ${overdueWhereClause}
      ) sub
      WHERE sub.total_debt > 0 AND sub.overdue_amount > 0
    `;
    const overdueDebtResult = await pool.query(overdueDebtQuery, overdueParams);
    overdueDebt = parseFloat(overdueDebtResult.rows[0].overdue_debt) || 0;
  }

  // Query para contar total de registros
  const countQuery = `
    SELECT COUNT(c.id) AS total
    FROM customers c
    LEFT JOIN users u ON c.user_id = u.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Query para listado de clientes con deuda vencida individual
  // Usando cálculo dinámico de deuda para consistencia
  const customersQuery = `
    SELECT
      c.id,
      u.name AS name,
      u.email,
      c.address,
      (
        COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                  WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
        - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
      ) AS total_debt,
      c.credit_days,
      c.customer_type,
      u.phone,
      COALESCE(u.is_active, true) AS is_active,
      (
        SELECT COUNT(*)
        FROM pedidos p
        WHERE p.customer_id = c.id AND p.status = 'active' AND p.estado = 'completado'
      ) AS orders_completed,
      (
        SELECT COALESCE(SUM(mc.monto), 0)
        FROM movimientos_credito mc
        WHERE mc.customer_id = c.id
          AND mc.status = 'active'
          AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL')
          AND mc.fecha_vencimiento IS NOT NULL
          AND mc.fecha_vencimiento < NOW()
      ) AS overdue_debt,
      (
        SELECT MAX(p.fecha_entrega)
        FROM pedidos p
        WHERE p.customer_id = c.id AND p.status = 'active' AND p.estado = 'completado'
      ) AS last_order_date
    FROM customers c
    LEFT JOIN users u ON c.user_id = u.id
    ${whereClause}
    ORDER BY total_debt DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const customersResult = await pool.query(customersQuery, params);

  return {
    summary: {
      totalCustomers: parseInt(summary.total_customers) || 0,
      totalDebt: parseFloat(summary.total_debt) || 0,
      overdueDebt: overdueDebt,
      customersWithDebt: parseInt(summary.customers_with_debt) || 0,
      activeCustomers: parseInt(summary.active_customers) || 0
    },
    customers: customersResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      address: row.address,
      phone: row.phone,
      customerType: row.customer_type,
      totalDebt: parseFloat(row.total_debt) || 0,
      creditDays: parseInt(row.credit_days) || 0,
      ordersCompleted: parseInt(row.orders_completed) || 0,
      overdueDebt: parseFloat(row.overdue_debt) || 0,
      lastOrderDate: row.last_order_date || null,
      isActive: row.is_active === true || row.is_active === 'true'
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
 * Exportar reporte de clientes - API-066
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Array>} Datos para exportar
 */
const getCustomersExportData = async ({ branchId, format = 'xlsx' }) => {
  let whereConditions = ["c.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  // Filtro por sede: consistente con creditsModel.js y reportsModel
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

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Query con cálculo dinámico de saldo
  const query = `
    SELECT
      c.id,
      u.name AS nombre,
      u.email,
      c.address AS direccion,
      c.contact_phone AS telefono,
      (
        COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                  WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0)
        - COALESCE((SELECT SUM(monto) FROM movimientos_credito mc
                    WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0)
      ) AS saldo_actual,
      c.credit_days AS dias_credito,
      (
        SELECT COUNT(*)
        FROM pedidos p
        WHERE p.customer_id = c.id AND p.status = 'active' AND p.estado = 'completado'
      ) AS pedidos_completados,
      (
        SELECT COALESCE(SUM(p.total), 0)
        FROM pedidos p
        WHERE p.customer_id = c.id AND p.status = 'active' AND p.estado = 'completado'
      ) AS total_compras
    FROM customers c
    LEFT JOIN users u ON c.user_id = u.id
    ${whereClause}
    ORDER BY saldo_actual DESC
  `;

  const result = await pool.query(query, params);

  return result.rows.map(row => ({
    id: row.id,
    nombre: row.nombre,
    email: row.email,
    direccion: row.direccion,
    telefono: row.telefono,
    saldo_actual: parseFloat(row.saldo_actual) || 0,
    dias_credito: parseInt(row.dias_credito) || 0,
    pedidos_completados: parseInt(row.pedidos_completados) || 0,
    total_compras: parseFloat(row.total_compras) || 0
  }));
};

module.exports = {
  getReportsSummary,
  getDailySalesReport,
  getRoutesReport,
  getKilosBySpeciesReport,
  getCustomersReport,
  getCustomersExportData
};
