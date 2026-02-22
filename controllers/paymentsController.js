/**
 * Payments Controller - API-025, API-026
 * Segun diseno en 04_apis_lista.md lineas 1665-1813
 */
const {
  createPayment,
  listPayments
} = require('../models/paymentsModel');
const jwt = require('jsonwebtoken');

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
 * POST /api/v1/payments - API-025
 * Registrar pago de cliente
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const create = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para registrar pagos' });
    }

    const { customerId, amount, paymentMethod, reference, notes, signature } = req.body;

    // Validaciones segun diseno API-025
    if (!customerId) {
      return res.status(400).json({ success: false, error: 'customerId es requerido' });
    }

    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'amount debe ser un numero positivo' });
    }

    const validMethods = ['EFECTIVO', 'TRANSFERENCIA', 'DEPOSITO', 'YAPE', 'PLIN'];
    if (paymentMethod && !validMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: 'paymentMethod debe ser EFECTIVO, TRANSFERENCIA, DEPOSITO, YAPE o PLIN'
      });
    }

    const result = await createPayment({
      customerId: parseInt(customerId),
      amount: parseFloat(amount),
      paymentMethod: paymentMethod || 'EFECTIVO',
      reference,
      notes,
      signature: signature || null,
      userId: decoded.id
    });

    // Response segun diseno API-025
    res.status(201).json({
      success: true,
      id: result.id,
      customerId: result.customerId,
      amount: result.amount,
      creditMovementId: result.creditMovementId,
      newBalance: result.newBalance
    });

  } catch (error) {
    console.error('Error registrando pago:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('monto') || error.message.includes('positivo')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/payments - API-026
 * Listar historial de pagos
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const list = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para ver historial de pagos' });
    }

    const { page, pageSize, customerId, dateFrom, dateTo } = req.query;

    // Determinar branchId segun rol
    let branchIdFilter = null;
    if (decoded.role_name?.toLowerCase() !== 'superadministrador' && decoded.branch_id) {
      branchIdFilter = decoded.branch_id;
    }

    const result = await listPayments({
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      customerId: customerId ? parseInt(customerId) : null,
      dateFrom,
      dateTo,
      branchId: branchIdFilter
    });

    // Response segun diseno API-026
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error listando pagos:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  create,
  list
};
