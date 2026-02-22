/**
 * Orders Controller - API-006 a API-013 + Vouchers
 * Segun diseno en 04_apis_lista.md
 * Integrado con Wasabi S3 para almacenamiento de vouchers
 */
const {
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
} = require('../models/ordersModel');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { uploadVoucher } = require('../services/wasabiService');
const { emitToBranch } = require('../socket/socketManager');

/**
 * Obtener branch_id real de un pedido
 */
const getOrderBranchId = async (orderId) => {
  const result = await pool.query('SELECT branch_id FROM pedidos WHERE id = $1', [orderId]);
  return result.rows[0]?.branch_id || null;
};

/**
 * Decodificar token JWT
 */
const decodeToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

/**
 * GET /api/v1/orders - API-006
 * Listar pedidos con paginacion y filtros
 */
const list = async (req, res) => {
  try {
    const decoded = decodeToken(req);

    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { page, pageSize, status, customerId, branchId, dateFrom, dateTo } = req.query;

    // SUPERADMINISTRADOR sin branchId ve todas las sedes
    // Otros roles usan su branch_id del token
    let effectiveBranchId = null;
    if (branchId) {
      effectiveBranchId = parseInt(branchId);
    } else if (decoded.role_name?.toUpperCase() !== 'SUPERADMINISTRADOR') {
      effectiveBranchId = decoded.branch_id;
    }

    const result = await listOrders({
      page,
      pageSize,
      status,
      customerId: customerId ? parseInt(customerId) : null,
      branchId: effectiveBranchId,
      dateFrom,
      dateTo,
      userId: decoded.id,
      roleName: decoded.role_name
    });

    // Response segun diseno API-006
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error listando pedidos:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/orders/stats - API-007
 * Obtener estadisticas de pedidos
 * CORRECCION: Filtra por customer_id cuando el rol es CLIENTE
 */
const stats = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { branchId, date } = req.query;

    // CLIENTE solo ve sus propias estadisticas
    // Otros roles ven por sede
    const result = await getOrdersStats({
      branchId: branchId ? parseInt(branchId) : decoded.branch_id,
      date,
      userId: decoded.id,
      roleName: decoded.role_name
    });

    // Response segun diseno API-007
    res.json({
      success: true,
      total: result.total,
      pendientes: result.pendientes,
      enProceso: result.enProceso,
      completados: result.completados,
      cancelados: result.cancelados
    });

  } catch (error) {
    console.error('Error obteniendo estadisticas de pedidos:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/orders/:id - API-008
 * Obtener detalle de un pedido
 */
const getById = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de pedido invalido' });
    }

    const order = await getOrderById(parseInt(id));
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
    }

    // Response segun diseno API-008
    res.json({
      success: true,
      ...order
    });

  } catch (error) {
    console.error('Error obteniendo detalle de pedido:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/orders - API-009
 * Crear nuevo pedido
 *
 * CAMBIOS ELM-032:
 * - Agregado soporte para orderType (tipo_pedido: NORMAL|ADICIONAL)
 * - Agregado soporte para estimatedDeliveryDate (fecha_entrega_estimada)
 * - Agregado soporte para isPrepaid (pagado_anticipado)
 * - Agregada validacion de observations (min 10 chars para pedidos ADICIONALES)
 */
const create = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const {
      customerId,
      paymentType,
      creditDays,
      deliveryMethod,
      observations,
      items,
      orderType,
      estimatedDeliveryDate,
      isPrepaid,
      assignRoute // Flag para asignar ruta automaticamente (solo si es Delivery Propio)
    } = req.body;

    // Validaciones segun diseno API-009
    if (!paymentType || !['CONTADO', 'CREDITO'].includes(paymentType)) {
      return res.status(400).json({ success: false, error: 'paymentType debe ser CONTADO o CREDITO' });
    }
    if (!deliveryMethod || !['DELIVERY', 'RECOJO'].includes(deliveryMethod)) {
      return res.status(400).json({ success: false, error: 'deliveryMethod debe ser DELIVERY o RECOJO' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items es requerido y debe ser un array no vacio' });
    }

    // Validar orderType si se proporciona
    if (orderType && !['NORMAL', 'ADICIONAL'].includes(orderType)) {
      return res.status(400).json({ success: false, error: 'orderType debe ser NORMAL o ADICIONAL' });
    }

    // Validar observations para pedidos ADICIONALES (min 10 caracteres)
    const finalOrderType = orderType || 'NORMAL';
    if (finalOrderType === 'ADICIONAL') {
      if (!observations || observations.trim().length < 10) {
        return res.status(400).json({
          success: false,
          error: 'Para pedidos adicionales, el comentario es obligatorio (minimo 10 caracteres)'
        });
      }
      if (observations.length > 500) {
        return res.status(400).json({
          success: false,
          error: 'El comentario no puede exceder 500 caracteres'
        });
      }
    }

    // Validar estimatedDeliveryDate si se proporciona
    if (estimatedDeliveryDate) {
      const date = new Date(estimatedDeliveryDate);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ success: false, error: 'estimatedDeliveryDate debe ser una fecha valida' });
      }
    }

    // Validar cada item
    for (const item of items) {
      if (!item.productId) {
        return res.status(400).json({ success: false, error: 'Cada item debe tener productId' });
      }
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ success: false, error: 'Cada item debe tener quantity positivo' });
      }
    }

    // Determinar branchId: del usuario o del cliente (para SUPERADMINISTRADOR)
    let effectiveBranchId = decoded.branch_id;

    if (!effectiveBranchId && customerId) {
      // SUPERADMINISTRADOR sin sede: obtener sede del cliente via su ruta
      const branchQuery = await pool.query(`
        SELECT rc.branch_id
        FROM customers c
        JOIN rutas_config rc ON c.route_id = rc.id
        WHERE c.id = $1 AND rc.status = 'active'
      `, [customerId]);

      if (branchQuery.rows.length > 0 && branchQuery.rows[0].branch_id) {
        effectiveBranchId = branchQuery.rows[0].branch_id;
      }
    }

    if (!effectiveBranchId) {
      return res.status(400).json({
        success: false,
        error: 'No se puede crear el pedido: no se pudo determinar la sede. El cliente debe tener una ruta asignada.'
      });
    }

    const result = await createOrder({
      customerId: customerId ? parseInt(customerId) : null,
      paymentType,
      creditDays: creditDays ? parseInt(creditDays) : 0,
      deliveryMethod,
      observations,
      items,
      orderType: finalOrderType,
      estimatedDeliveryDate: estimatedDeliveryDate || null,
      isPrepaid: isPrepaid || false,
      assignRoute: assignRoute === true, // Solo asignar ruta si explicitamente es true
      branchId: effectiveBranchId,
      userId: decoded.id
    });

    // Emitir evento Socket.IO para actualizar pizarra en tiempo real
    emitToBranch('pedido:creado', {
      id: result.id,
      orderNumber: result.orderNumber,
      branchId: effectiveBranchId,
      timestamp: new Date().toISOString()
    }, effectiveBranchId);

    // Response segun diseno API-009
    res.status(201).json({
      success: true,
      id: result.id,
      orderNumber: result.orderNumber,
      correlativoSede: result.correlativoSede,
      status: result.status,
      total: result.total
    });

  } catch (error) {
    console.error('Error creando pedido:', error);

    // Errores de validación conocidos - devolver 400
    if (error.message.includes('Cliente no encontrado') ||
        error.message.includes('inactivo')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('NO RECURRENTES') ||
        error.message.includes('voucher')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error.message.includes('horario') ||
        error.message.includes('hora')) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/v1/orders/:id - API-010
 * Actualizar pedido
 */
const update = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    const { items } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de pedido invalido' });
    }

    const result = await updateOrder(parseInt(id), items || [], decoded.id);

    // Obtener branch_id real del pedido (no del usuario, que puede ser SUPERADMIN sin sede)
    const orderBranchId = await getOrderBranchId(parseInt(id));

    // Emitir evento Socket.IO
    emitToBranch('pedido:actualizado', {
      id: result.id,
      timestamp: new Date().toISOString()
    }, orderBranchId);

    // Response segun diseno API-010
    res.json({
      success: true,
      id: result.id,
      total: result.total,
      items: result.items
    });

  } catch (error) {
    console.error('Error actualizando pedido:', error);
    if (error.message.includes('PENDIENTE')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/orders/:id/cancel - API-011
 * Cancelar pedido
 */
const cancel = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de pedido invalido' });
    }

    const result = await cancelOrder(parseInt(id), reason || '', decoded.id);

    // Obtener branch_id real del pedido
    const orderBranchId = await getOrderBranchId(parseInt(id));

    // Emitir evento Socket.IO
    emitToBranch('pedido:cancelado', {
      id: result.id,
      timestamp: new Date().toISOString()
    }, orderBranchId);

    // Response segun diseno API-011
    res.json({
      success: true,
      id: result.id,
      status: result.status,
      cancelledAt: result.cancelledAt
    });

  } catch (error) {
    console.error('Error cancelando pedido:', error);
    if (error.message.includes('PENDIENTE') || error.message.includes('EN_PROCESO')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/orders/:id/assign-route - API-012
 * Asignar pedido a ruta
 */
const assignToRoute = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    const { routeId } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de pedido invalido' });
    }
    if (!routeId) {
      return res.status(400).json({ success: false, error: 'routeId es requerido' });
    }

    const result = await assignRoute(parseInt(id), parseInt(routeId), decoded.id);

    // Obtener branch_id real del pedido
    const orderBranchId = await getOrderBranchId(parseInt(id));

    // Emitir evento Socket.IO
    emitToBranch('pedido:ruta-asignada', {
      id: result.id,
      routeId: result.routeId,
      timestamp: new Date().toISOString()
    }, orderBranchId);

    res.json({
      success: true,
      id: result.id,
      routeId: result.routeId,
      route: result.route
    });

  } catch (error) {
    console.error('Error asignando ruta:', error);
    if (error.message.includes('no encontrad')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('cancelado')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/orders/:id/deliver - API-013
 * Marcar pedido como entregado
 */
const deliver = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    const { paymentType, cashAmount, creditAmount, creditDays, acceptExceedLimit } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de pedido invalido' });
    }
    if (!paymentType || !['CONTADO', 'CREDITO', 'MIXTO'].includes(paymentType)) {
      return res.status(400).json({ success: false, error: 'paymentType debe ser CONTADO, CREDITO o MIXTO' });
    }

    const result = await deliverOrder({
      orderId: parseInt(id),
      paymentType,
      cashAmount: cashAmount || 0,
      creditAmount: creditAmount || 0,
      creditDays: creditDays || 0,
      acceptExceedLimit: acceptExceedLimit || false,
      userId: decoded.id
    });

    // Obtener branch_id real del pedido
    const orderBranchId = await getOrderBranchId(parseInt(id));

    // Emitir evento Socket.IO
    emitToBranch('pedido:entregado', {
      id: result.id,
      timestamp: new Date().toISOString()
    }, orderBranchId);

    res.json({
      success: true,
      id: result.id,
      status: result.status,
      deliveredAt: result.deliveredAt,
      creditMovementId: result.creditMovementId
    });

  } catch (error) {
    console.error('Error entregando pedido:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('entregado') || error.message.includes('estado')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    if (error.message.includes('suma')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/orders/:id/voucher
 * Subir voucher de pago a Wasabi S3
 */
const uploadVoucherFile = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de pedido invalido' });
    }

    // Verificar que se haya subido un archivo
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se proporciono ningun archivo de voucher' });
    }

    // Subir voucher a Wasabi S3
    const uploadResult = await uploadVoucher(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    const voucherUrl = uploadResult.url;

    // Actualizar el pedido con el voucher
    const result = await addVoucher(parseInt(id), voucherUrl, decoded.id);

    res.json({
      success: true,
      id: result.id,
      voucherUrl: result.voucherUrl,
      message: 'Voucher subido correctamente'
    });

  } catch (error) {
    console.error('Error subiendo voucher:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('estado')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * PATCH /api/v1/orders/:id/approve-payment
 * Aprobar o rechazar pago (solo ADMIN y SUPERADMIN)
 */
const approvePayment = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    const { status, observaciones } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de pedido invalido' });
    }

    // Validar status
    if (!status || !['APROBADO', 'RECHAZADO', 'PENDIENTE'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'status debe ser APROBADO, RECHAZADO o PENDIENTE'
      });
    }

    // Si es rechazado, observaciones es obligatorio
    if (status === 'RECHAZADO' && (!observaciones || observaciones.trim().length < 5)) {
      return res.status(400).json({
        success: false,
        error: 'Las observaciones son obligatorias al rechazar un pago (minimo 5 caracteres)'
      });
    }

    // Actualizar el estado de pago
    const result = await updatePaymentStatus(parseInt(id), status, observaciones || '', decoded.id);

    res.json({
      success: true,
      id: result.id,
      estadoPago: result.estadoPago,
      message: `Pago ${status.toLowerCase()} correctamente`
    });

  } catch (error) {
    console.error('Error aprobando/rechazando pago:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('voucher')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  list,
  stats,
  getById,
  create,
  update,
  cancel,
  assignToRoute,
  deliver,
  uploadVoucherFile,
  approvePayment
};
