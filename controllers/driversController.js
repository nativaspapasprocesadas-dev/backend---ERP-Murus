/**
 * Drivers Controller - API-032, API-033, API-034, API-035
 * Segun diseno en 04_apis_lista.md (lineas 2122-2363)
 *
 * Roles_permitidos: SUPERADMINISTRADOR, ADMINISTRADOR
 * Requiere_autenticacion: true
 */
const {
  listDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver
} = require('../models/driversModel');
const jwt = require('jsonwebtoken');

/**
 * Decodificar token JWT y extraer datos del usuario
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
 * GET /api/v1/drivers - API-032
 * Listar choferes con paginacion y filtros
 *
 * Query params:
 *   - page: integer (default 1)
 *   - pageSize: integer (default 20, max 100)
 *   - isActive: boolean
 *   - branchId: integer
 *
 * Response:
 *   - data[]: lista de choferes
 *   - stats: { total, active, inactive }
 *   - pagination: { total, page, pageSize, totalPages }
 *
 * Acceso:
 *   - SUPERADMINISTRADOR: ve todos los choferes de todas las sedes
 *   - ADMINISTRADOR: ve choferes de su sede
 *   - COORDINADOR: ve choferes de su sede (para asignar rutas)
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

    const { page, pageSize, isActive, branchId } = req.query;

    const result = await listDrivers({
      page,
      pageSize,
      isActive,
      branchId: branchId ? parseInt(branchId) : null,
      userBranchId: decoded.branch_id,
      roleName: decoded.role_name
    });

    // Response segun diseno API-032
    res.json({
      success: true,
      data: result.data,
      stats: result.stats,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error listando choferes:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/drivers/:id
 * Obtener chofer por ID (endpoint adicional util, no definido en diseno pero necesario)
 */
const getById = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de chofer invalido' });
    }

    const driver = await getDriverById(parseInt(id));
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Chofer no encontrado' });
    }

    res.json({
      success: true,
      ...driver
    });

  } catch (error) {
    console.error('Error obteniendo chofer:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/drivers - API-033
 * Crear nuevo chofer (registro interno, NO crea usuario)
 *
 * Request body:
 *   - name: string (requerido)
 *   - license: string (opcional)
 *   - phone: string (opcional)
 *   - branchId: integer (requerido)
 *   - licenseExpiry: date (opcional)
 *
 * Response:
 *   - id: integer
 */
const create = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles: SUPERADMINISTRADOR, ADMINISTRADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para crear choferes' });
    }

    const { name, license, phone, branchId, licenseExpiry, notes } = req.body;

    // Validaciones
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'El nombre es requerido' });
    }
    if (!branchId) {
      return res.status(400).json({ success: false, error: 'La sede es requerida' });
    }

    // Si es ADMINISTRADOR, solo puede crear en su sede
    if (decoded.role_name?.toLowerCase() === 'administrador' && parseInt(branchId) !== decoded.branch_id) {
      return res.status(403).json({ success: false, error: 'Solo puede crear choferes en su sede' });
    }

    const result = await createDriver({
      name: name.trim(),
      license: license ? license.trim() : null,
      phone: phone ? phone.trim() : null,
      branchId: parseInt(branchId),
      licenseExpiry: licenseExpiry || null,
      notes: notes ? notes.trim() : null,
      registrationUserId: decoded.id
    });

    res.status(201).json({
      success: true,
      id: result.id,
      name: result.name
    });

  } catch (error) {
    console.error('Error creando chofer:', error.message);

    if (error.message.includes('licencia')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Error de datos duplicados' });
    }

    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/v1/drivers/:id - API-034
 * Actualizar chofer existente
 *
 * Request params:
 *   - id: integer (requerido)
 *
 * Request body:
 *   - name: string (opcional)
 *   - license: string (opcional)
 *   - phone: string (opcional)
 *   - licenseExpiry: date (opcional)
 *   - isActive: boolean (opcional)
 *
 * Response:
 *   - id: integer
 *   - ...campos actualizados
 */
const update = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles: SUPERADMINISTRADOR, ADMINISTRADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para actualizar choferes' });
    }

    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de chofer invalido' });
    }

    const { name, license, phone, licenseExpiry, notes, isActive, branchId } = req.body;

    const result = await updateDriver(
      parseInt(id),
      { name, license, phone, licenseExpiry, notes, isActive, branchId },
      decoded.id
    );

    res.json({
      success: true,
      id: result.id,
      name: result.name,
      license: result.license,
      phone: result.phone,
      licenseExpiry: result.licenseExpiry,
      notes: result.notes,
      isActive: result.isActive
    });

  } catch (error) {
    console.error('Error actualizando chofer:', error);

    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('licencia')) {
      return res.status(409).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/v1/drivers/:id - API-035
 * Eliminar chofer (soft delete)
 *
 * Request params:
 *   - id: integer (requerido)
 *
 * Response:
 *   - success: boolean
 */
const remove = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar roles: SUPERADMINISTRADOR, ADMINISTRADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para eliminar choferes' });
    }

    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de chofer invalido' });
    }

    const result = await deleteDriver(parseInt(id), decoded.id);

    // Response segun diseno API-035
    res.json({
      success: result.success
    });

  } catch (error) {
    console.error('Error eliminando chofer:', error);

    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('rutas activas')) {
      return res.status(409).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove
};
