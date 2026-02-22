/**
 * Measures Controller - API-049, API-050, API-051, API-052
 * Segun diseno en 04_apis_lista.md
 */
const measuresModel = require('../models/measuresModel');

/**
 * Listar medidas - API-049
 * GET /api/v1/measures
 */
const list = async (req, res) => {
  try {
    const { page, pageSize } = req.query;
    const result = await measuresModel.listMeasures({ page, pageSize });
    res.json(result);
  } catch (error) {
    console.error('Error en list measures:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Crear medida - API-050
 * POST /api/v1/measures
 */
const create = async (req, res) => {
  try {
    const { name, abbreviation, conversionFactor, isActive } = req.body;

    // Validaciones segun diseno
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'El nombre es requerido' });
    }

    const userId = req.user?.id || null;
    const result = await measuresModel.createMeasure({
      name: name.trim(),
      abbreviation: abbreviation?.trim(),
      conversionFactor,
      isActive,
      userId
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error en create measure:', error);
    if (error.message.includes('Ya existe')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Actualizar medida - API-051
 * PUT /api/v1/measures/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, abbreviation, conversionFactor, isActive } = req.body;

    // Validar que id sea numerico
    const measureId = parseInt(id);
    if (isNaN(measureId)) {
      return res.status(400).json({ error: 'ID de medida invalido' });
    }

    const userId = req.user?.id || null;
    const result = await measuresModel.updateMeasure(measureId, {
      name: name?.trim(),
      abbreviation: abbreviation?.trim(),
      conversionFactor,
      isActive,
      userId
    });

    res.json(result);
  } catch (error) {
    console.error('Error en update measure:', error);
    if (error.message === 'Medida no encontrada') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Ya existe')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Eliminar medida - API-052
 * DELETE /api/v1/measures/:id
 * Soft delete: cambia status a 'deleted'
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    // Validar que id sea numerico
    const measureId = parseInt(id);
    if (isNaN(measureId)) {
      return res.status(400).json({ error: 'ID de medida invalido' });
    }

    const userId = req.user?.id || null;
    const result = await measuresModel.deleteMeasure(measureId, userId);

    res.json(result);
  } catch (error) {
    console.error('Error en delete measure:', error);
    if (error.message === 'Medida no encontrada') {
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
 * Obtener medida por ID
 * GET /api/v1/measures/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const measureId = parseInt(id);
    if (isNaN(measureId)) {
      return res.status(400).json({ error: 'ID de medida invalido' });
    }

    const result = await measuresModel.getMeasureById(measureId);

    if (!result) {
      return res.status(404).json({ error: 'Medida no encontrada' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error en getById measure:', error);
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
