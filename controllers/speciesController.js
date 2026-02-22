/**
 * Species Controller - API-045, API-046, API-047, API-048
 * Segun diseno en 04_apis_lista.md
 */
const {
  listSpecies,
  createSpecies,
  updateSpecies,
  deleteSpecies
} = require('../models/speciesModel');
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
 * GET /api/v1/species - API-045
 * Listar especies
 */
const list = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { page, pageSize } = req.query;

    const result = await listSpecies({
      page,
      pageSize
    });

    // Response segun diseno API-045
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error listando especies:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/species - API-046
 * Crear especie
 */
const create = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { name, description, isActive } = req.body;

    // Validaciones segun diseno API-046
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'name es requerido' });
    }

    const result = await createSpecies({
      name: name.trim(),
      description,
      isActive,
      userId: decoded.id
    });

    // Response segun diseno API-046
    res.status(201).json({
      success: true,
      id: result.id,
      name: result.name,
      description: result.description,
      isActive: result.isActive
    });

  } catch (error) {
    console.error('Error creando especie:', error);
    if (error.message.includes('Ya existe')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/v1/species/:id - API-047
 * Actualizar especie
 */
const update = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    const { name, description, isActive } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de especie invalido' });
    }

    const result = await updateSpecies(parseInt(id), {
      name: name ? name.trim() : undefined,
      description,
      isActive,
      userId: decoded.id
    });

    // Response segun diseno API-047
    res.json({
      success: true,
      id: result.id,
      name: result.name,
      description: result.description,
      isActive: result.isActive
    });

  } catch (error) {
    console.error('Error actualizando especie:', error);
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
 * DELETE /api/v1/species/:id - API-048
 * Eliminar especie
 */
const remove = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de especie invalido' });
    }

    const result = await deleteSpecies(parseInt(id), decoded.id);

    // Response segun diseno API-048
    res.json({
      success: result.success
    });

  } catch (error) {
    console.error('Error eliminando especie:', error);
    if (error.message.includes('no encontrada')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    // Detectar error de dependencias (productos asociados)
    if (error.message.includes('No se puede eliminar')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  list,
  create,
  update,
  remove
};
