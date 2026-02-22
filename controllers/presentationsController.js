/**
 * Presentations Controller - API-053, API-054, API-055, API-056
 * Segun diseno en 04_apis_lista.md
 */
const presentationsModel = require('../models/presentationsModel');

/**
 * Listar presentaciones - API-053
 * GET /api/v1/presentations
 */
const list = async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await presentationsModel.listPresentations({ page, pageSize });
    res.json(result);
  } catch (error) {
    console.error('Error en list presentations:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Crear presentacion - API-054
 * POST /api/v1/presentations
 */
const create = async (req, res) => {
  try {
    const { name, description, weight, isActive } = req.body;

    // Validaciones segun diseno
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    // Validar peso si se proporciona
    if (weight !== undefined && weight !== null && weight !== '') {
      const pesoNum = parseFloat(weight);
      if (isNaN(pesoNum) || pesoNum <= 0) {
        return res.status(400).json({ error: 'El peso debe ser un numero mayor a 0' });
      }
    }

    const userId = req.user?.id || null;
    const result = await presentationsModel.createPresentation({
      name: name.trim(),
      description: description?.trim(),
      weight: weight ? parseFloat(weight) : undefined,
      isActive,
      userId
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error en create presentation:', error);
    if (error.message.includes('Ya existe')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Actualizar presentacion - API-055
 * PUT /api/v1/presentations/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, weight, isActive } = req.body;

    // Validar que id sea numerico
    const presentationId = parseInt(id);
    if (isNaN(presentationId)) {
      return res.status(400).json({ error: 'ID de presentacion invalido' });
    }

    // Validar peso si se proporciona
    if (weight !== undefined && weight !== null && weight !== '') {
      const pesoNum = parseFloat(weight);
      if (isNaN(pesoNum) || pesoNum <= 0) {
        return res.status(400).json({ error: 'El peso debe ser un numero mayor a 0' });
      }
    }

    const userId = req.user?.id || null;
    const result = await presentationsModel.updatePresentation(presentationId, {
      name: name?.trim(),
      description: description?.trim(),
      weight: weight ? parseFloat(weight) : undefined,
      isActive,
      userId
    });

    res.json(result);
  } catch (error) {
    console.error('Error en update presentation:', error);
    if (error.message === 'Presentacion no encontrada') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Ya existe')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Eliminar presentacion - API-056
 * DELETE /api/v1/presentations/:id
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    // Validar que id sea numerico
    const presentationId = parseInt(id);
    if (isNaN(presentationId)) {
      return res.status(400).json({ error: 'ID de presentacion invalido' });
    }

    const userId = req.user?.id || null;
    const result = await presentationsModel.deletePresentation(presentationId, userId);

    res.json(result);
  } catch (error) {
    console.error('Error en delete presentation:', error);
    if (error.message === 'Presentacion no encontrada') {
      return res.status(404).json({ error: error.message });
    }
    // Detectar error de dependencias (productos asociados)
    if (error.message.includes('No se puede eliminar')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Obtener presentacion por ID
 * GET /api/v1/presentations/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const presentationId = parseInt(id);
    if (isNaN(presentationId)) {
      return res.status(400).json({ error: 'ID de presentacion invalido' });
    }

    const result = await presentationsModel.getPresentationById(presentationId);

    if (!result) {
      return res.status(404).json({ error: 'Presentacion no encontrada' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error en getById presentation:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

module.exports = {
  list,
  create,
  update,
  remove,
  getById
};
