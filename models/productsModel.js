/**
 * Products Model - API-057, API-058, API-059, API-060
 * Segun diseno en 04_apis_lista.md
 * Tabla real: productos (schema.prisma linea 207)
 * Tablas relacionadas: especies, medidas, presentaciones
 */
const pool = require('../config/db');

/**
 * Listar productos con paginacion y filtros - API-057
 * GET /api/v1/products
 * @param {Object} params - Parametros de paginacion y filtros
 * @returns {Promise<Object>} Lista paginada de productos
 */
const listProducts = async ({ page = 1, pageSize = 20, speciesId, measureId, presentationId, isActive, showInCatalog, search, includeInactive = true }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  // Filtro de status: incluir inactivos por defecto para permitir reactivarlos desde admin
  const statusFilter = includeInactive ? "p.status IN ('active', 'inactive')" : "p.status = 'active'";
  let whereConditions = [statusFilter];
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

  // Filtro por presentación
  if (presentationId) {
    whereConditions.push(`p.presentacion_id = $${paramIndex}`);
    params.push(presentationId);
    paramIndex++;
  }

  // Filtro por estado activo específico (solo activos o solo inactivos)
  if (isActive !== undefined) {
    whereConditions.push(`p.status = $${paramIndex}`);
    params.push(isActive ? 'active' : 'inactive');
    paramIndex++;
  }

  // Filtro por visibilidad en catálogo
  if (showInCatalog !== undefined) {
    whereConditions.push(`p.visible_en_catalogo = $${paramIndex}`);
    params.push(showInCatalog);
    paramIndex++;
  }

  // Filtro por búsqueda de texto (nombre o código)
  if (search && search.trim()) {
    whereConditions.push(`(p.nombre ILIKE $${paramIndex} OR p.codigo ILIKE $${paramIndex} OR e.nombre ILIKE $${paramIndex})`);
    params.push(`%${search.trim()}%`);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Contar total (incluir JOIN a especies si hay búsqueda por texto)
  const countJoins = search && search.trim() ? 'LEFT JOIN especies e ON p.especie_id = e.id' : '';
  const countQuery = `SELECT COUNT(*) AS total FROM productos p ${countJoins} ${whereClause}`;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Obtener datos con JOINs a especies, medidas y presentaciones
  const dataQuery = `
    SELECT
      p.id,
      p.codigo AS code,
      p.nombre AS name,
      p.precio_base AS "basePrice",
      p.stock_actual AS "currentStock",
      p.stock_minimo AS "minStock",
      p.status,
      p.visible_en_catalogo AS "showInCatalog",
      p.date_time_registration AS "createdAt",
      p.imagen_url AS "imageUrl",
      e.id AS "speciesId",
      e.nombre AS "speciesName",
      m.id AS "measureId",
      m.nombre AS "measureName",
      m.abreviatura AS "measureAbbreviation",
      pr.id AS "presentationId",
      pr.nombre AS "presentationName",
      pr.peso AS "presentationKilos"
    FROM productos p
    LEFT JOIN especies e ON p.especie_id = e.id
    LEFT JOIN medidas m ON p.medida_id = m.id
    LEFT JOIN presentaciones pr ON p.presentacion_id = pr.id
    ${whereClause}
    ORDER BY p.status ASC, p.nombre ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      species: {
        id: row.speciesId,
        name: row.speciesName
      },
      measure: {
        id: row.measureId,
        name: row.measureName,
        abbreviation: row.measureAbbreviation
      },
      presentation: {
        id: row.presentationId,
        name: row.presentationName,
        kilos: row.presentationKilos ? parseFloat(row.presentationKilos) : 1
      },
      basePrice: row.basePrice ? parseFloat(row.basePrice) : 0,
      currentStock: row.currentStock ? parseFloat(row.currentStock) : 0,
      minStock: row.minStock ? parseFloat(row.minStock) : 0,
      isActive: row.status === 'active',
      showInCatalog: row.showInCatalog !== false,
      createdAt: row.createdAt,
      imageUrl: row.imageUrl
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
 * Crear producto - API-058
 * POST /api/v1/products
 * @param {Object} data - Datos del producto
 * @returns {Promise<Object>} Producto creado
 */
const createProduct = async ({ speciesId, measureId, presentationId, basePrice, name, code, userId, imagenUrl, isActive = true, showInCatalog = true }) => {
  // Verificar que la combinacion especie+medida+presentacion no exista
  const checkCombination = `
    SELECT id FROM productos
    WHERE especie_id = $1 AND medida_id = $2 AND presentacion_id = $3 AND status = 'active'
  `;
  const checkResult = await pool.query(checkCombination, [speciesId, measureId, presentationId]);

  if (checkResult.rows.length > 0) {
    throw new Error('Ya existe un producto con esta combinacion de especie, medida y presentacion');
  }

  // Obtener nombres para generar nombre automatico si no se proporciona
  let productName = name;
  if (!productName) {
    const namesQuery = `
      SELECT e.nombre AS especie, m.nombre AS medida, pr.nombre AS presentacion
      FROM especies e, medidas m, presentaciones pr
      WHERE e.id = $1 AND m.id = $2 AND pr.id = $3
    `;
    const namesResult = await pool.query(namesQuery, [speciesId, measureId, presentationId]);
    if (namesResult.rows.length > 0) {
      const row = namesResult.rows[0];
      productName = `${row.especie} - ${row.medida} - ${row.presentacion}`;
    } else {
      productName = `Producto ${speciesId}-${measureId}-${presentationId}`;
    }
  }

  // Generar codigo si no se proporciona
  let productCode = code;
  if (!productCode) {
    const codeQuery = `
      SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM 5) AS INTEGER)), 0) + 1 AS next_num
      FROM productos
      WHERE codigo LIKE 'PRD-%'
    `;
    const codeResult = await pool.query(codeQuery);
    const nextNum = codeResult.rows[0].next_num;
    productCode = `PRD-${String(nextNum).padStart(6, '0')}`;
  }

  const insertQuery = `
    INSERT INTO productos (codigo, nombre, especie_id, medida_id, presentacion_id, precio_base, user_id_registration, imagen_url, status, visible_en_catalogo)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, codigo AS code, nombre AS name, precio_base AS "basePrice", imagen_url AS "imageUrl", status, visible_en_catalogo AS "showInCatalog"
  `;

  const result = await pool.query(insertQuery, [
    productCode,
    productName,
    speciesId,
    measureId,
    presentationId,
    basePrice,
    userId,
    imagenUrl || null,
    isActive ? 'active' : 'inactive',
    showInCatalog
  ]);

  return {
    id: result.rows[0].id,
    code: result.rows[0].code,
    name: result.rows[0].name,
    basePrice: parseFloat(result.rows[0].basePrice),
    imageUrl: result.rows[0].imageUrl,
    isActive: result.rows[0].status === 'active',
    showInCatalog: result.rows[0].showInCatalog !== false
  };
};

/**
 * Actualizar producto - API-059
 * PUT /api/v1/products/{id}
 * @param {number} id - ID del producto
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} Producto actualizado
 */
const updateProduct = async (id, { basePrice, isActive, showInCatalog, name, stockMinimo, userId, imagenUrl }) => {
  // Verificar que existe (incluir inactivos para permitir reactivarlos)
  const checkQuery = `SELECT id, status FROM productos WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [id]);

  if (checkResult.rows.length === 0) {
    throw new Error('Producto no encontrado');
  }

  const updateFields = [];
  const params = [];
  let paramIndex = 1;

  // Segun diseno API-059: solo permite cambiar basePrice e isActive (no especie/medida/presentacion)
  if (basePrice !== undefined) {
    updateFields.push(`precio_base = $${paramIndex}`);
    params.push(basePrice);
    paramIndex++;
  }
  if (isActive !== undefined) {
    updateFields.push(`status = $${paramIndex}`);
    params.push(isActive ? 'active' : 'inactive');
    paramIndex++;
  }
  if (showInCatalog !== undefined) {
    updateFields.push(`visible_en_catalogo = $${paramIndex}`);
    params.push(showInCatalog);
    paramIndex++;
  }
  if (name !== undefined) {
    updateFields.push(`nombre = $${paramIndex}`);
    params.push(name);
    paramIndex++;
  }
  if (stockMinimo !== undefined) {
    updateFields.push(`stock_minimo = $${paramIndex}`);
    params.push(stockMinimo);
    paramIndex++;
  }
  if (imagenUrl !== undefined) {
    updateFields.push(`imagen_url = $${paramIndex}`);
    params.push(imagenUrl);
    paramIndex++;
  }

  if (updateFields.length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  updateFields.push(`user_id_modification = $${paramIndex}`);
  params.push(userId);
  paramIndex++;

  updateFields.push(`date_time_modification = NOW()`);

  params.push(id);

  const updateQuery = `
    UPDATE productos
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, codigo AS code, nombre AS name, precio_base AS "basePrice", status, visible_en_catalogo AS "showInCatalog", imagen_url AS "imageUrl"
  `;

  const result = await pool.query(updateQuery, params);

  return {
    id: result.rows[0].id,
    code: result.rows[0].code,
    name: result.rows[0].name,
    basePrice: parseFloat(result.rows[0].basePrice),
    isActive: result.rows[0].status === 'active',
    showInCatalog: result.rows[0].showInCatalog !== false,
    imageUrl: result.rows[0].imageUrl
  };
};

/**
 * Eliminar producto - API-060
 * DELETE /api/v1/products/{id}
 * Soft delete: cambia status a 'deleted'
 * NO permite eliminar si tiene pedidos activos asociados (por configuracion del aplicativo)
 * @param {number} id - ID del producto
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Resultado de eliminacion
 */
const deleteProduct = async (id, userId) => {
  // Verificar que existe (incluir inactivos)
  const checkQuery = `SELECT id, nombre, codigo, status FROM productos WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [id]);

  if (checkResult.rows.length === 0) {
    throw new Error('Producto no encontrado');
  }

  const productName = checkResult.rows[0].nombre;
  const productCode = checkResult.rows[0].codigo;

  // Si ya está eliminado, no hacer nada
  if (checkResult.rows[0].status === 'deleted') {
    return { success: true, message: 'El producto ya estaba eliminado' };
  }

  // Verificar que no tenga pedidos activos asociados
  const ordersCheck = `
    SELECT COUNT(*) AS count
    FROM pedido_detalles pd
    JOIN pedidos p ON pd.pedido_id = p.id
    WHERE pd.producto_id = $1
    AND pd.status = 'active'
    AND p.estado NOT IN ('completado', 'cancelado')
  `;
  const ordersResult = await pool.query(ordersCheck, [id]);
  const orderCount = parseInt(ordersResult.rows[0].count);

  if (orderCount > 0) {
    throw new Error(`No se puede eliminar el producto "${productName}" (${productCode}) porque tiene ${orderCount} pedido(s) activo(s) asociado(s). Primero debe completar o cancelar los pedidos que incluyen este producto.`);
  }

  // Soft delete (status = 'deleted' para que no aparezca en frontend)
  const deleteQuery = `
    UPDATE productos
    SET status = 'deleted', user_id_modification = $1, date_time_modification = NOW()
    WHERE id = $2
  `;

  await pool.query(deleteQuery, [userId, id]);

  return { success: true };
};

/**
 * Obtener producto por ID
 * @param {number} id - ID del producto
 * @returns {Promise<Object|null>} Producto encontrado
 */
const getProductById = async (id) => {
  const query = `
    SELECT
      p.id,
      p.codigo AS code,
      p.nombre AS name,
      p.precio_base AS "basePrice",
      p.stock_actual AS "currentStock",
      p.stock_minimo AS "minStock",
      p.status,
      p.imagen_url AS "imageUrl",
      e.id AS "speciesId",
      e.nombre AS "speciesName",
      m.id AS "measureId",
      m.nombre AS "measureName",
      m.abreviatura AS "measureAbbreviation",
      pr.id AS "presentationId",
      pr.nombre AS "presentationName"
    FROM productos p
    LEFT JOIN especies e ON p.especie_id = e.id
    LEFT JOIN medidas m ON p.medida_id = m.id
    LEFT JOIN presentaciones pr ON p.presentacion_id = pr.id
    WHERE p.id = $1
  `;
  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    species: {
      id: row.speciesId,
      name: row.speciesName
    },
    measure: {
      id: row.measureId,
      name: row.measureName,
      abbreviation: row.measureAbbreviation
    },
    presentation: {
      id: row.presentationId,
      name: row.presentationName
    },
    basePrice: row.basePrice ? parseFloat(row.basePrice) : 0,
    currentStock: row.currentStock ? parseFloat(row.currentStock) : 0,
    minStock: row.minStock ? parseFloat(row.minStock) : 0,
    isActive: row.status === 'active',
    imageUrl: row.imageUrl
  };
};

/**
 * Actualizar solo la imagen de un producto
 * @param {number} id - ID del producto
 * @param {string} imagenUrl - URL de la imagen
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Producto actualizado
 */
const updateProductImage = async (id, imagenUrl, userId) => {
  // Verificar que existe y obtener imagen anterior (incluir inactivos)
  const checkQuery = `SELECT id, imagen_url FROM productos WHERE id = $1`;
  const checkResult = await pool.query(checkQuery, [id]);

  if (checkResult.rows.length === 0) {
    throw new Error('Producto no encontrado');
  }

  const oldImageUrl = checkResult.rows[0].imagen_url;

  const updateQuery = `
    UPDATE productos
    SET imagen_url = $1, user_id_modification = $2, date_time_modification = NOW()
    WHERE id = $3
    RETURNING id, codigo AS code, nombre AS name, imagen_url AS "imageUrl"
  `;

  const result = await pool.query(updateQuery, [imagenUrl, userId, id]);

  return {
    id: result.rows[0].id,
    code: result.rows[0].code,
    name: result.rows[0].name,
    imageUrl: result.rows[0].imageUrl,
    oldImageUrl
  };
};

/**
 * Listar productos para pedidos - Devuelve TODOS los productos activos
 * Sin filtrar por visible_en_catalogo (para que aparezcan todos al hacer pedidos)
 * GET /api/v1/products/for-orders
 * @param {Object} params - Parametros de filtro
 * @returns {Promise<Object>} Lista de productos
 */
const listProductsForOrders = async ({ speciesId, measureId, customerId } = {}) => {
  // Solo productos activos (sin filtrar por visible_en_catalogo)
  let whereConditions = ["p.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  if (speciesId) {
    whereConditions.push(`p.especie_id = $${paramIndex}`);
    params.push(speciesId);
    paramIndex++;
  }

  if (measureId) {
    whereConditions.push(`p.medida_id = $${paramIndex}`);
    params.push(measureId);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

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
      p.imagen_url AS "imageUrl",
      p.visible_en_catalogo AS "showInCatalog"
    FROM productos p
    LEFT JOIN especies e ON p.especie_id = e.id
    LEFT JOIN medidas m ON p.medida_id = m.id
    LEFT JOIN presentaciones pr ON p.presentacion_id = pr.id
    ${priceJoin}
    ${whereClause}
    ORDER BY p.nombre ASC
  `;

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
      imageUrl: row.imageUrl || null,
      showInCatalog: row.showInCatalog !== false
    }))
  };
};

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductById,
  updateProductImage,
  listProductsForOrders
};
