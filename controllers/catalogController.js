/**
 * Catalog Controller - API-014, API-015
 * Segun diseno en 04_apis_lista.md (lineas 891-1045)
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR, CLIENTE
 */
const catalogModel = require('../models/catalogModel');

/**
 * Listar productos del catalogo - API-014
 * GET /api/v1/catalog/products
 * Query params:
 *   - includeHidden: Si es "true", incluye productos no visibles en catálogo (solo para ADMIN/SUPERADMIN)
 */
const listProducts = async (req, res) => {
  try {
    const { page, pageSize, speciesId, measureId, includeHidden, customerId: queryCustomerId } = req.query;

    // Determinar customerId:
    // 1. Si el usuario es CLIENTE, usar su customer_id asociado
    // 2. Si es ADMIN/COORDINADOR y se pasa customerId en query, usarlo para obtener precios personalizados
    let customerId = null;
    const isAdmin = req.user && ['superadministrador', 'administrador', 'coordinador'].includes(req.user.role_name?.toLowerCase());

    if (req.user && req.user.role_name?.toLowerCase() === 'cliente') {
      // Usuario cliente: obtener su customer_id
      const pool = require('../config/db');
      const customerResult = await pool.query(
        "SELECT id FROM customers WHERE user_id = $1 AND status = 'active'",
        [req.user.id]
      );
      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].id;
      }
    } else if (isAdmin && queryCustomerId) {
      // Admin/Coordinador: usar el customerId del query para obtener precios personalizados
      customerId = parseInt(queryCustomerId);
    }

    // Solo permitir includeHidden para roles administrativos (no clientes)
    const shouldIncludeHidden = includeHidden === 'true' && isAdmin;

    const parsedPageSize = parseInt(pageSize);
    const result = await catalogModel.listProducts({
      page: parseInt(page) || 1,
      pageSize: isNaN(parsedPageSize) ? undefined : parsedPageSize,
      speciesId: speciesId ? parseInt(speciesId) : null,
      measureId: measureId ? parseInt(measureId) : null,
      customerId,
      includeHidden: shouldIncludeHidden
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error en listProducts:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Obtener detalle de producto - API-015
 * GET /api/v1/catalog/products/:id
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID de producto invalido' });
    }

    // Obtener customerId si el usuario es cliente
    let customerId = null;
    if (req.user && req.user.role_name?.toLowerCase() === 'cliente') {
      const pool = require('../config/db');
      const customerResult = await pool.query(
        "SELECT id FROM customers WHERE user_id = $1 AND status = 'active'",
        [req.user.id]
      );
      if (customerResult.rows.length > 0) {
        customerId = customerResult.rows[0].id;
      }
    }

    const product = await catalogModel.getProductById(parseInt(id), customerId);

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    return res.status(200).json(product);
  } catch (error) {
    console.error('Error en getProductById:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Listar especies (auxiliar para filtros)
 * GET /api/v1/catalog/species
 */
const listSpecies = async (req, res) => {
  try {
    const species = await catalogModel.listSpecies();
    return res.status(200).json({ data: species });
  } catch (error) {
    console.error('Error en listSpecies:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Listar medidas (auxiliar para filtros)
 * GET /api/v1/catalog/measures
 */
const listMeasures = async (req, res) => {
  try {
    const measures = await catalogModel.listMeasures();
    return res.status(200).json({ data: measures });
  } catch (error) {
    console.error('Error en listMeasures:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * Listar presentaciones (auxiliar para filtros)
 * GET /api/v1/catalog/presentations
 */
const listPresentations = async (req, res) => {
  try {
    const presentations = await catalogModel.listPresentations();
    return res.status(200).json({ data: presentations });
  } catch (error) {
    console.error('Error en listPresentations:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  listProducts,
  getProductById,
  listSpecies,
  listMeasures,
  listPresentations
};
