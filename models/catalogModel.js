/**
 * Catalog Model - API-014, API-015
 * Segun diseno en 04_apis_lista.md (lineas 891-1045)
 * Tablas reales: productos, especies, medidas, presentaciones, precios_cliente, customers
 */
const pool = require('../config/db');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 500;

/**
 * Listar productos del catalogo con paginacion y filtros - API-014
 * @param {Object} params - Parametros de filtro y paginacion
 * @param {boolean} params.includeHidden - Si es true, incluye productos no visibles en catálogo (para uso administrativo)
 * @returns {Promise<Object>} Lista paginada de productos
 */
const listProducts = async ({ page = 1, pageSize = DEFAULT_PAGE_SIZE, speciesId, measureId, customerId, includeHidden = false }) => {
  const parsedSize = parseInt(pageSize);
  pageSize = parsedSize === 0 ? MAX_PAGE_SIZE : Math.min(parsedSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  // Solo productos activos. El filtro visible_en_catalogo solo aplica si includeHidden es false
  let whereConditions = ["p.status = 'active'"];
  if (!includeHidden) {
    whereConditions.push("p.visible_en_catalogo = true");
  }
  const params = [];
  let paramIndex = 1;

  // Filtro por especie
  if (speciesId) {
    whereConditions.push(`p.especie_id = $${paramIndex}`);
    params.push(speciesId);
    paramIndex++;
  }

  // Filtro por medida
  if (measureId) {
    whereConditions.push(`p.medida_id = $${paramIndex}`);
    params.push(measureId);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Query para contar total
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM productos p
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Query para obtener datos con precio personalizado si hay cliente
  let priceJoin = '';
  let priceSelect = 'p.precio_base AS "discountedPrice"';

  if (customerId) {
    priceJoin = `
      LEFT JOIN precios_cliente pc ON pc.producto_id = p.id
        AND pc.customer_id = $${paramIndex}
        AND pc.status = 'active'
        AND (pc.fecha_inicio IS NULL OR pc.fecha_inicio <= CURRENT_DATE)
        AND (pc.fecha_fin IS NULL OR pc.fecha_fin >= CURRENT_DATE)
    `;
    params.push(customerId);
    paramIndex++;
    priceSelect = 'COALESCE(pc.precio_especial, p.precio_base) AS "discountedPrice"';
  }

  const dataQuery = `
    SELECT
      p.id,
      p.codigo AS code,
      p.nombre AS name,
      p.especie_id AS "speciesId",
      e.nombre AS species,
      p.medida_id AS "measureId",
      m.nombre AS measure,
      m.abreviatura AS "measureAbbr",
      p.presentacion_id AS "presentationId",
      pr.nombre AS presentation,
      pr.peso AS "presentationKilos",
      p.precio_base AS "basePrice",
      ${priceSelect},
      p.stock_actual AS stock,
      p.imagen_url AS "imageUrl"
    FROM productos p
    LEFT JOIN especies e ON p.especie_id = e.id
    LEFT JOIN medidas m ON p.medida_id = m.id
    LEFT JOIN presentaciones pr ON p.presentacion_id = pr.id
    ${priceJoin}
    ${whereClause}
    ORDER BY p.nombre ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      especieId: row.speciesId,
      species: row.species,
      medidaId: row.measureId,
      measure: row.measure,
      measureAbbr: row.measureAbbr,
      presentacionId: row.presentationId,
      presentation: row.presentation,
      presentationKilos: parseFloat(row.presentationKilos) || 1,
      precioBaseKg: parseFloat(row.basePrice) || 0,
      basePrice: parseFloat(row.basePrice) || 0,
      discountedPrice: parseFloat(row.discountedPrice) || parseFloat(row.basePrice) || 0,
      stock: parseFloat(row.stock) || 0,
      imageUrl: row.imageUrl || null
    })),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
};

/**
 * Obtener detalle de un producto - API-015
 * @param {number} productId - ID del producto
 * @param {number|null} customerId - ID del cliente para precio personalizado
 * @returns {Promise<Object|null>} Detalle del producto
 */
const getProductById = async (productId, customerId = null) => {
  let priceJoin = '';
  let priceSelect = 'p.precio_base AS "discountedPrice"';
  const params = [productId];
  let paramIndex = 2;

  if (customerId) {
    priceJoin = `
      LEFT JOIN precios_cliente pc ON pc.producto_id = p.id
        AND pc.customer_id = $${paramIndex}
        AND pc.status = 'active'
        AND (pc.fecha_inicio IS NULL OR pc.fecha_inicio <= CURRENT_DATE)
        AND (pc.fecha_fin IS NULL OR pc.fecha_fin >= CURRENT_DATE)
    `;
    params.push(customerId);
    priceSelect = 'COALESCE(pc.precio_especial, p.precio_base) AS "discountedPrice"';
  }

  const query = `
    SELECT
      p.id,
      p.codigo AS code,
      p.nombre AS name,
      p.precio_base AS "basePrice",
      ${priceSelect},
      p.stock_actual AS stock,
      p.stock_minimo AS "stockMinimo",
      p.status,
      p.imagen_url AS "imageUrl",
      e.id AS "speciesId",
      e.nombre AS "speciesName",
      e.descripcion AS "speciesDescription",
      m.id AS "measureId",
      m.nombre AS "measureName",
      m.abreviatura AS "measureAbbr",
      pr.id AS "presentationId",
      pr.nombre AS "presentationName",
      pr.descripcion AS "presentationDescription",
      pr.peso AS "presentationKilos"
    FROM productos p
    LEFT JOIN especies e ON p.especie_id = e.id
    LEFT JOIN medidas m ON p.medida_id = m.id
    LEFT JOIN presentaciones pr ON p.presentacion_id = pr.id
    ${priceJoin}
    WHERE p.id = $1 AND p.status = 'active'
  `;

  const result = await pool.query(query, params);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    fullName: `${row.name} - ${row.speciesName || ''} ${row.measureName || ''} ${row.presentationName || ''}`.trim(),
    species: {
      id: row.speciesId,
      name: row.speciesName,
      description: row.speciesDescription
    },
    measure: {
      id: row.measureId,
      name: row.measureName,
      abbreviation: row.measureAbbr
    },
    presentation: {
      id: row.presentationId,
      name: row.presentationName,
      description: row.presentationDescription,
      kilos: parseFloat(row.presentationKilos) || 1
    },
    basePrice: parseFloat(row.basePrice) || 0,
    discountedPrice: parseFloat(row.discountedPrice) || parseFloat(row.basePrice) || 0,
    stock: parseFloat(row.stock) || 0,
    stockMinimo: parseFloat(row.stockMinimo) || 0,
    isActive: row.status === 'active',
    imageUrl: row.imageUrl || null
  };
};

/**
 * Listar especies activas (auxiliar para filtros)
 * @returns {Promise<Array>} Lista de especies
 */
const listSpecies = async () => {
  const query = `
    SELECT id, nombre AS name, descripcion AS description
    FROM especies
    WHERE status = 'active'
    ORDER BY nombre ASC
  `;
  const result = await pool.query(query);
  return result.rows;
};

/**
 * Listar medidas activas (auxiliar para filtros)
 * @returns {Promise<Array>} Lista de medidas
 */
const listMeasures = async () => {
  const query = `
    SELECT id, nombre AS name, abreviatura AS abbreviation, factor_conversion AS "conversionFactor"
    FROM medidas
    WHERE status = 'active'
    ORDER BY nombre ASC
  `;
  const result = await pool.query(query);
  return result.rows.map(row => ({
    ...row,
    conversionFactor: parseFloat(row.conversionFactor) || 1
  }));
};

/**
 * Listar presentaciones activas (auxiliar para filtros)
 * @returns {Promise<Array>} Lista de presentaciones
 */
const listPresentations = async () => {
  const query = `
    SELECT id, nombre AS name, descripcion AS description, peso AS weight
    FROM presentaciones
    WHERE status = 'active'
    ORDER BY nombre ASC
  `;
  const result = await pool.query(query);
  return result.rows.map(row => ({
    ...row,
    weight: parseFloat(row.weight) || 1
  }));
};

module.exports = {
  listProducts,
  getProductById,
  listSpecies,
  listMeasures,
  listPresentations
};
