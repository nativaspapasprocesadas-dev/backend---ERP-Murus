/**
 * Production Controller - API-044
 * Segun diseno en 04_apis_lista.md
 * Pizarra de Produccion - Pedidos con detalles expandidos y rutas activas
 */
const { getProductionBoard, getItemsListos, toggleItemListo, toggleItemsListoBatch } = require('../models/productionModel');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { emitToBranch } = require('../socket/socketManager');

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
 * Verificar roles permitidos (case-insensitive)
 */
const checkRoles = (decoded, allowedRoles) => {
  if (!decoded || !decoded.role_name) return false;
  const userRole = decoded.role_name.toLowerCase();
  const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());
  return normalizedAllowedRoles.includes(userRole);
};

/**
 * GET /api/v1/production/board - API-044
 * Obtener pizarra de produccion
 *
 * Query params:
 *   - date: fecha (YYYY-MM-DD), default: hoy
 *   - branchId: ID de sede (opcional, default: sede del usuario)
 *
 * Response:
 *   - pedidos: Array de pedidos con detalles expandidos (especie, medida, presentacion)
 *   - rutas: Array de rutas activas del dia
 *   - stats: Estadisticas (totalPedidos, totalRutas, etc.)
 */
const getBoard = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR, PRODUCCION
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR', 'PRODUCCION'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a la pizarra de produccion' });
    }

    const { date, branchId } = req.query;

    // SUPERADMINISTRADOR sin branchId ve todas las sedes
    // Otros roles usan su branch_id del token
    let effectiveBranchId = null;
    if (branchId) {
      effectiveBranchId = parseInt(branchId);
    } else if (decoded.role_name?.toUpperCase() !== 'SUPERADMINISTRADOR') {
      effectiveBranchId = decoded.branch_id;
    }

    const result = await getProductionBoard({
      date,
      branchId: effectiveBranchId
    });

    // Response con formato compatible con frontend
    res.json({
      success: true,
      date: result.date,
      pedidos: result.pedidos,
      rutas: result.rutas,
      stats: result.stats,
      pedidosAgendados: result.pedidosAgendados
    });

  } catch (error) {
    console.error('Error obteniendo pizarra de produccion:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/production/items-listos
 * Obtener items marcados como listos para la pizarra de produccion
 */
const getItemsListosController = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles: SUPERADMINISTRADOR, ADMINISTRADOR, PRODUCCION
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'PRODUCCION'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { date, branchId } = req.query;

    // Determinar branchId efectivo
    let effectiveBranchId = null;
    if (branchId) {
      effectiveBranchId = parseInt(branchId);
    } else if (decoded.role_name?.toUpperCase() !== 'SUPERADMINISTRADOR') {
      effectiveBranchId = decoded.branch_id;
    }

    const items = await getItemsListos({
      date,
      branchId: effectiveBranchId
    });

    res.json({
      success: true,
      data: items
    });

  } catch (error) {
    console.error('Error obteniendo items listos:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/production/toggle-item-listo
 * Marcar o desmarcar un detalle de pedido como listo
 */
const toggleItemListoController = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles: SUPERADMINISTRADOR, ADMINISTRADOR, PRODUCCION
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'PRODUCCION'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para modificar items de produccion' });
    }

    const { detalleId } = req.body;

    // Validaciones
    if (!detalleId) {
      return res.status(400).json({
        success: false,
        error: 'Falta campo requerido: detalleId'
      });
    }

    const result = await toggleItemListo({
      detalleId: parseInt(detalleId),
      userId: decoded.id
    });

    // Obtener branch_id real del pedido al que pertenece el detalle
    const branchQuery = await pool.query(
      'SELECT p.branch_id FROM pedido_detalles pd JOIN pedidos p ON pd.pedido_id = p.id WHERE pd.id = $1',
      [parseInt(detalleId)]
    );
    const orderBranchId = branchQuery.rows[0]?.branch_id || decoded.branch_id;

    // Emitir evento Socket.IO para actualizar pizarra en tiempo real
    emitToBranch('produccion:item-listo', {
      detalleId: parseInt(detalleId),
      listo: result.listo,
      userId: decoded.id,
      timestamp: new Date().toISOString()
    }, orderBranchId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error toggle item listo:', error);
    res.status(500).json({ success: false, error: error.message || 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/production/toggle-items-listo-batch
 * Marcar o desmarcar MULTIPLES detalles de pedido como listos en una sola operacion
 */
const toggleItemsListoBatchController = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'PRODUCCION'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para modificar items de produccion' });
    }

    const { detalleIds, targetListo } = req.body;

    if (!detalleIds || !Array.isArray(detalleIds) || detalleIds.length === 0) {
      return res.status(400).json({ success: false, error: 'detalleIds es requerido y debe ser un array no vacio' });
    }
    if (typeof targetListo !== 'boolean') {
      return res.status(400).json({ success: false, error: 'targetListo es requerido y debe ser boolean' });
    }

    const parsedIds = detalleIds.map(id => parseInt(id));

    const result = await toggleItemsListoBatch({
      detalleIds: parsedIds,
      targetListo,
      userId: decoded.id
    });

    // Obtener branch_id del primer detalle para emitir socket
    const branchQuery = await pool.query(
      'SELECT p.branch_id FROM pedido_detalles pd JOIN pedidos p ON pd.pedido_id = p.id WHERE pd.id = $1',
      [parsedIds[0]]
    );
    const orderBranchId = branchQuery.rows[0]?.branch_id || decoded.branch_id;

    // Emitir un evento por cada detalle actualizado para que otros clientes se sincronicen
    for (const item of result.updated) {
      emitToBranch('produccion:item-listo', {
        detalleId: item.id,
        listo: item.listo,
        userId: decoded.id,
        timestamp: new Date().toISOString()
      }, orderBranchId);
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error toggle items listo batch:', error);
    res.status(500).json({ success: false, error: error.message || 'Error interno del servidor' });
  }
};

module.exports = {
  getBoard,
  getItemsListosController,
  toggleItemListoController,
  toggleItemsListoBatchController
};
