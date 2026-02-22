/**
 * Branches Controller - API-071, API-072, API-073, API-074
 * Segun diseno en 04_apis_lista.md linea 4522
 */
const {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchById
} = require('../models/branchesModel');
const jwt = require('jsonwebtoken');

/**
 * Extraer usuario del token JWT
 * @param {Object} req - Request
 * @returns {Object|null} Usuario decodificado o null
 */
const getUserFromToken = (req) => {
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
 * Verificar si el usuario es SUPERADMINISTRADOR (case-insensitive)
 * @param {Object} user - Usuario decodificado
 * @returns {boolean}
 */
const isSuperAdmin = (user) => {
  return user && user.role_name && user.role_name.toLowerCase() === 'superadministrador';
};

/**
 * GET /api/v1/branches - API-071
 * Listar sedes con paginacion y filtros
 * Acceso:
 *   - SUPERADMINISTRADOR: ve todas las sedes
 *   - ADMINISTRADOR/otros: solo ve su sede asignada
 */
const list = async (req, res) => {
  try {
    const user = getUserFromToken(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado o invalido'
      });
    }

    const { page, pageSize, isActive, includeInactive } = req.query;

    // SUPERADMINISTRADOR ve todas las sedes (incluyendo inactivas para gestión)
    if (isSuperAdmin(user)) {
      const result = await listBranches({
        page,
        pageSize,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        includeInactive: includeInactive === 'true'
      });

      return res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    }

    // ADMINISTRADOR y otros roles: solo ven su sede asignada
    if (user.branch_id) {
      const branch = await getBranchById(user.branch_id);

      if (branch) {
        return res.json({
          success: true,
          data: [branch],
          pagination: { total: 1, page: 1, pageSize: 1, totalPages: 1 }
        });
      }
    }

    // Usuario sin sede asignada
    return res.json({
      success: true,
      data: [],
      pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 }
    });

  } catch (error) {
    console.error('Error listando sedes:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * POST /api/v1/branches - API-072
 * Crear nueva sede
 */
const create = async (req, res) => {
  try {
    const user = getUserFromToken(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado o invalido'
      });
    }

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        success: false,
        error: 'Solo SUPERADMINISTRADOR puede crear sedes'
      });
    }

    const { name, code, address, phone, email, manager, isMain, color } = req.body;

    // Validaciones segun diseno
    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'El nombre de la sede es requerido'
      });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de email invalido'
      });
    }

    const branch = await createBranch(
      { name, code, address, phone, email, manager, isMain, color },
      user.id
    );

    res.status(201).json({
      success: true,
      data: branch
    });

  } catch (error) {
    console.error('Error creando sede:', error);

    if (error.message.includes('Ya existe')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * PUT /api/v1/branches/:id - API-073
 * Actualizar sede existente
 */
const update = async (req, res) => {
  try {
    const user = getUserFromToken(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado o invalido'
      });
    }

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        success: false,
        error: 'Solo SUPERADMINISTRADOR puede actualizar sedes'
      });
    }

    const { id } = req.params;
    const branchId = parseInt(id);

    if (isNaN(branchId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de sede invalido'
      });
    }

    const { name, address, phone, email, manager, isMain, color, isActive } = req.body;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de email invalido'
      });
    }

    const branch = await updateBranch(
      branchId,
      { name, address, phone, email, manager, isMain, color, isActive },
      user.id
    );

    res.json({
      success: true,
      data: branch
    });

  } catch (error) {
    console.error('Error actualizando sede:', error);

    if (error.message === 'Sede no encontrada') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('Ya existe')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * DELETE /api/v1/branches/:id - API-074
 * Eliminar sede
 */
const remove = async (req, res) => {
  try {
    const user = getUserFromToken(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado o invalido'
      });
    }

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        success: false,
        error: 'Solo SUPERADMINISTRADOR puede eliminar sedes'
      });
    }

    const { id } = req.params;
    const branchId = parseInt(id);

    if (isNaN(branchId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de sede invalido'
      });
    }

    const result = await deleteBranch(branchId, user.id);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error eliminando sede:', error);

    if (error.message === 'Sede no encontrada') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('usuarios activos')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * GET /api/v1/branches/:id
 * Obtener sede por ID (auxiliar)
 */
const getById = async (req, res) => {
  try {
    const user = getUserFromToken(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado o invalido'
      });
    }

    if (!isSuperAdmin(user)) {
      return res.status(403).json({
        success: false,
        error: 'Solo SUPERADMINISTRADOR puede ver detalles de sedes'
      });
    }

    const { id } = req.params;
    const branchId = parseInt(id);

    if (isNaN(branchId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de sede invalido'
      });
    }

    const branch = await getBranchById(branchId);

    if (!branch) {
      return res.status(404).json({
        success: false,
        error: 'Sede no encontrada'
      });
    }

    res.json({
      success: true,
      data: branch
    });

  } catch (error) {
    console.error('Error obteniendo sede:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

module.exports = {
  list,
  create,
  update,
  remove,
  getById
};
