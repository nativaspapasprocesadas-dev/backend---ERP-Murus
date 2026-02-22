/**
 * Routes Controller - API-041, API-042, API-043
 * Segun diseno en 04_apis_lista.md
 */
const {
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
} = require('../models/routesModel');
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
 * POST /api/v1/routes/config - API-041
 * Crear configuracion de ruta
 */
const createConfig = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { name, color, description, branchId, horaLimiteRecepcion } = req.body;

    // Validaciones segun diseno API-041
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name es requerido' });
    }

    // Validar formato de color hex si se proporciona
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ success: false, error: 'color debe ser formato hex valido (#RRGGBB)' });
    }

    // Validar formato de horaLimiteRecepcion si se proporciona
    if (horaLimiteRecepcion && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(horaLimiteRecepcion)) {
      return res.status(400).json({ success: false, error: 'horaLimiteRecepcion debe tener formato HH:MM (00:00 - 23:59)' });
    }

    // Determinar branchId segun rol
    let targetBranchId;
    if (decoded.role_name === 'SUPERADMINISTRADOR') {
      // SUPERADMIN puede especificar branchId, si no lo hace usa el suyo
      targetBranchId = branchId ? parseInt(branchId) : decoded.branch_id;
    } else {
      // Otros roles solo pueden crear rutas en su propia sede
      targetBranchId = decoded.branch_id;
    }

    if (!targetBranchId) {
      const errorMsg = decoded.role_name === 'SUPERADMINISTRADOR'
        ? 'Debe seleccionar una sede para la ruta'
        : 'No tiene una sede asignada. Contacte al administrador';
      return res.status(400).json({ success: false, error: errorMsg });
    }

    const result = await createRouteConfig({
      name: name.trim(),
      color,
      description,
      branchId: targetBranchId,
      userId: decoded.id,
      horaLimiteRecepcion
    });

    // Response segun diseno API-041
    res.status(201).json({
      success: true,
      id: result.id,
      name: result.name,
      color: result.color,
      description: result.description,
      horaLimiteRecepcion: result.horaLimiteRecepcion,
      isActive: result.isActive
    });

  } catch (error) {
    console.error('Error creando configuracion de ruta:', error);
    if (error.message.includes('Ya existe')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/v1/routes/config/:id - API-042
 * Actualizar configuracion de ruta
 */
const updateConfig = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    const { name, color, description, isActive, horaLimiteRecepcion, order } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de configuracion invalido' });
    }

    // Validar formato de color hex si se proporciona
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ success: false, error: 'color debe ser formato hex valido (#RRGGBB)' });
    }

    // Validar formato de horaLimiteRecepcion si se proporciona
    if (horaLimiteRecepcion !== undefined && horaLimiteRecepcion !== null && horaLimiteRecepcion !== '' && !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(horaLimiteRecepcion)) {
      return res.status(400).json({ success: false, error: 'horaLimiteRecepcion debe tener formato HH:MM (00:00 - 23:59)' });
    }

    const result = await updateRouteConfig(parseInt(id), {
      name: name ? name.trim() : undefined,
      color,
      description,
      isActive,
      userId: decoded.id,
      horaLimiteRecepcion: horaLimiteRecepcion === '' ? null : horaLimiteRecepcion,
      order: order !== undefined ? parseInt(order) : undefined
    });

    // Response segun diseno API-042
    res.json({
      success: true,
      id: result.id,
      name: result.name,
      color: result.color,
      description: result.description,
      horaLimiteRecepcion: result.horaLimiteRecepcion,
      isActive: result.isActive,
      updatedAt: result.updatedAt
    });

  } catch (error) {
    console.error('Error actualizando configuracion de ruta:', error);
    if (error.message.includes('no encontrada')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('Ya existe')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/routes/:id/export/pdf - API-043
 * Exportar ruta a PDF
 * Nota: Este endpoint retorna los datos estructurados para generar el PDF en el frontend
 * o puede generar el PDF directamente si se implementa una libreria como pdfkit
 */
const exportPdf = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    const { includeSignature, includeSender, includeRecipient } = req.query;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de ruta invalido' });
    }

    const routeData = await getRouteForExport(parseInt(id));

    // Agregar opciones de exportacion
    routeData.exportOptions = {
      includeSignature: includeSignature === 'true',
      includeSender: includeSender === 'true',
      includeRecipient: includeRecipient === 'true'
    };

    // Por ahora retornamos JSON con los datos estructurados
    // En produccion, se podria generar el PDF con pdfkit o similar
    // y retornar Content-Type: application/pdf
    res.json({
      success: true,
      data: routeData,
      message: 'Datos listos para generar PDF'
    });

  } catch (error) {
    console.error('Error exportando ruta a PDF:', error);
    if (error.message.includes('no encontrada')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
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
 * GET /api/v1/routes - API-036
 * Listar rutas del dia
 */
const list = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { date, dateFrom, dateTo, branchId, status, includeHistory } = req.query;

    const result = await listDailyRoutes({
      date,
      dateFrom,
      dateTo,
      branchId: branchId ? parseInt(branchId) : null,
      status,
      userBranchId: decoded.branch_id,
      roleName: decoded.role_name,
      includeHistory
    });

    // Response segun diseno API-036
    res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('Error listando rutas:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/routes/:id - API-037
 * Obtener detalle de ruta
 */
const getById = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de ruta invalido' });
    }

    const result = await getRouteDetail(parseInt(id));

    // Response segun diseno API-037
    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error obteniendo detalle de ruta:', error);
    if (error.message.includes('no encontrada')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/routes/:id/dispatch - API-038
 * Asignar chofer y enviar ruta
 */
const dispatch = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para despachar rutas' });
    }

    const { id } = req.params;
    const { driverId } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de ruta invalido' });
    }

    if (!driverId) {
      return res.status(400).json({ success: false, error: 'driverId es requerido' });
    }

    const result = await dispatchRoute(parseInt(id), parseInt(driverId), decoded.id);

    // Response segun diseno API-038
    res.json({
      success: true,
      id: result.id,
      status: result.status,
      dispatchedAt: result.dispatchedAt,
      driver: result.driver
    });

  } catch (error) {
    console.error('Error despachando ruta:', error);
    if (error.message.includes('no encontrada') || error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('pendiente') || error.message.includes('activo') || error.message.includes('asignado')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/routes/:id/complete - API-039
 * Completar ruta
 */
const complete = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para completar rutas' });
    }

    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de ruta invalido' });
    }

    const result = await completeRoute(parseInt(id), decoded.id);

    // Response segun diseno API-039
    res.json({
      success: true,
      id: result.id,
      status: result.status,
      completedAt: result.completedAt
    });

  } catch (error) {
    console.error('Error completando ruta:', error);
    if (error.message.includes('no encontrada')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('en curso')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/routes/:id/reopen
 * Reabrir ruta (revertir de enviada a abierta para agregar más pedidos)
 */
const reopen = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para reabrir rutas' });
    }

    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de ruta invalido' });
    }

    const result = await reopenRoute(parseInt(id), decoded.id);

    res.json({
      success: true,
      id: result.id,
      status: result.status,
      driverId: result.driverId
    });

  } catch (error) {
    console.error('Error reabriendo ruta:', error);
    if (error.message.includes('no encontrada')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('en curso')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/routes/config - API-040
 * Listar configuracion de rutas
 */
const listConfig = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles - CLIENTE incluido para poder ver nombres de rutas
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR', 'CLIENTE', 'PRODUCCION'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { branchId } = req.query;

    const result = await listRouteConfigs({
      branchId: branchId ? parseInt(branchId) : null,
      userBranchId: decoded.branch_id,
      roleName: decoded.role_name
    });

    // Response segun diseno API-040
    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error listando configuracion de rutas:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/routes/config/:id/schedule-status
 * Validar estado de horario de una ruta
 */
const getScheduleStatus = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de configuracion invalido' });
    }

    const result = await validateScheduleStatus(parseInt(id));

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error validando estado de horario de ruta:', error);
    if (error.message.includes('no encontrada')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  createConfig,
  updateConfig,
  exportPdf,
  list,
  getById,
  dispatch,
  complete,
  reopen,
  listConfig,
  getScheduleStatus
};
