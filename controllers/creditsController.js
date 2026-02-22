/**
 * Credits Controller - API-021, API-022, API-023, API-024
 * Segun diseno en 04_apis_lista.md lineas 1393-1659
 */
const {
  getClientCreditAccount,
  getDebtors,
  getCustomerCreditAccount,
  sendPaymentReminder
} = require('../models/creditsModel');
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
 * GET /api/v1/credits/account - API-021
 * Obtener estado de cuenta del cliente autenticado
 * Roles permitidos: CLIENTE
 */
const getAccount = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar que es rol CLIENTE (case-insensitive)
    if (decoded.role_name?.toLowerCase() !== 'cliente') {
      return res.status(403).json({ success: false, error: 'Solo clientes pueden acceder a su estado de cuenta' });
    }

    const { page, pageSize } = req.query;

    const result = await getClientCreditAccount(decoded.id, {
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20
    });

    // Response segun diseno API-021
    res.json({
      success: true,
      currentBalance: result.currentBalance,
      movements: result.movements,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error obteniendo estado de cuenta:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/credits/debtors - API-022
 * Listar clientes con deuda
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const listDebtors = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a esta informacion' });
    }

    const { page, pageSize, branchId, hasOverdue } = req.query;

    const result = await getDebtors({
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      branchId: branchId ? parseInt(branchId) : (decoded.role_name?.toLowerCase() !== 'superadministrador' ? decoded.branch_id : null),
      hasOverdue
    });

    // Response segun diseno API-022
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error listando deudores:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/credits/customers/:customerId - API-023
 * Obtener cuenta de cliente especifico
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const getCustomerAccount = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a esta informacion' });
    }

    const { customerId } = req.params;
    const { page, pageSize } = req.query;

    if (!customerId || isNaN(parseInt(customerId))) {
      return res.status(400).json({ success: false, error: 'customerId invalido' });
    }

    const result = await getCustomerCreditAccount(parseInt(customerId), {
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20
    });

    // Response segun diseno API-023
    res.json({
      success: true,
      customer: result.customer,
      currentBalance: result.currentBalance,
      movements: result.movements,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error obteniendo cuenta de cliente:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/credits/customers/:customerId/reminder - API-024
 * Enviar recordatorio de pago
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const sendReminder = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para enviar recordatorios' });
    }

    const { customerId } = req.params;
    const { message } = req.body;

    if (!customerId || isNaN(parseInt(customerId))) {
      return res.status(400).json({ success: false, error: 'customerId invalido' });
    }

    const result = await sendPaymentReminder(parseInt(customerId), message, decoded.id);

    // Response segun diseno API-024
    res.json({
      success: result.success,
      announcementId: result.announcementId
    });

  } catch (error) {
    console.error('Error enviando recordatorio:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('deuda')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  getAccount,
  listDebtors,
  getCustomerAccount,
  sendReminder
};
