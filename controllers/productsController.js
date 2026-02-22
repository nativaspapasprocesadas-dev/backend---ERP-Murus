/**
 * Products Controller - API-057, API-058, API-059, API-060
 * Segun diseno en 04_apis_lista.md
 * Integrado con Wasabi S3 para almacenamiento de imagenes
 */
const productsModel = require('../models/productsModel');
const { uploadProductImage, deleteFile } = require('../services/wasabiService');

/**
 * Listar productos - API-057
 * GET /api/v1/products
 * Query params: page, pageSize, speciesId, measureId, presentationId, isActive, showInCatalog, search
 */
const list = async (req, res) => {
  try {
    const { page, pageSize, speciesId, measureId, presentationId, isActive, showInCatalog, search } = req.query;
    const result = await productsModel.listProducts({
      page,
      pageSize,
      speciesId: speciesId ? parseInt(speciesId) : undefined,
      measureId: measureId ? parseInt(measureId) : undefined,
      presentationId: presentationId ? parseInt(presentationId) : undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      showInCatalog: showInCatalog !== undefined ? showInCatalog === 'true' : undefined,
      search: search || undefined
    });
    res.json(result);
  } catch (error) {
    console.error('Error en list products:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Crear producto - API-058
 * POST /api/v1/products
 */
const create = async (req, res) => {
  try {
    const { speciesId, measureId, presentationId, basePrice, name, code, isActive, showInCatalog } = req.body;

    // Validaciones segun diseno API-058
    if (!speciesId) {
      return res.status(400).json({ error: 'speciesId es requerido' });
    }
    if (!measureId) {
      return res.status(400).json({ error: 'measureId es requerido' });
    }
    if (!presentationId) {
      return res.status(400).json({ error: 'presentationId es requerido' });
    }
    if (basePrice === undefined || basePrice === null || parseFloat(basePrice) < 0) {
      return res.status(400).json({ error: 'basePrice debe ser un numero positivo' });
    }

    // Subir imagen a Wasabi si se proporciono
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await uploadProductImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      imageUrl = uploadResult.url;
    }

    const userId = req.user?.id || null;
    const result = await productsModel.createProduct({
      speciesId: parseInt(speciesId),
      measureId: parseInt(measureId),
      presentationId: parseInt(presentationId),
      basePrice: parseFloat(basePrice),
      name: name?.trim(),
      code: code?.trim(),
      userId,
      imagenUrl: imageUrl,
      isActive: isActive !== undefined ? isActive : true,
      showInCatalog: showInCatalog !== undefined ? showInCatalog : true
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error en create product:', error);

    if (error.message.includes('Ya existe')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Actualizar producto - API-059
 * PUT /api/v1/products/:id
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { basePrice, isActive, showInCatalog, name, stockMinimo } = req.body;

    // Validar que id sea numerico
    const productId = parseInt(id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'ID de producto invalido' });
    }

    // Validar basePrice si se proporciona
    if (basePrice !== undefined && (isNaN(parseFloat(basePrice)) || parseFloat(basePrice) < 0)) {
      return res.status(400).json({ error: 'basePrice debe ser un numero positivo' });
    }

    // Si se subio nueva imagen, obtener la imagen anterior para eliminarla
    let imageUrl = undefined;
    let oldImageUrl = null;

    if (req.file) {
      // Obtener producto actual para eliminar imagen anterior
      const currentProduct = await productsModel.getProductById(productId);
      if (currentProduct && currentProduct.imageUrl) {
        oldImageUrl = currentProduct.imageUrl;
      }

      // Subir nueva imagen a Wasabi
      const uploadResult = await uploadProductImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      imageUrl = uploadResult.url;
    }

    const userId = req.user?.id || null;
    const result = await productsModel.updateProduct(productId, {
      basePrice: basePrice !== undefined ? parseFloat(basePrice) : undefined,
      isActive,
      showInCatalog,
      name: name?.trim(),
      stockMinimo: stockMinimo !== undefined ? parseFloat(stockMinimo) : undefined,
      imagenUrl: imageUrl,
      userId
    });

    // Eliminar imagen anterior de Wasabi si se subio nueva
    if (oldImageUrl) {
      await deleteFile(oldImageUrl);
    }

    res.json(result);
  } catch (error) {
    console.error('Error en update product:', error);

    if (error.message === 'Producto no encontrado') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'No hay campos para actualizar') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Eliminar producto - API-060
 * DELETE /api/v1/products/:id
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    // Validar que id sea numerico
    const productId = parseInt(id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'ID de producto invalido' });
    }

    const userId = req.user?.id || null;
    const result = await productsModel.deleteProduct(productId, userId);

    res.json(result);
  } catch (error) {
    console.error('Error en delete product:', error);
    if (error.message === 'Producto no encontrado') {
      return res.status(404).json({ error: error.message });
    }
    // Detectar error de dependencias (pedidos asociados)
    if (error.message.includes('No se puede eliminar')) {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Obtener producto por ID
 * GET /api/v1/products/:id
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    const productId = parseInt(id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'ID de producto invalido' });
    }

    const result = await productsModel.getProductById(productId);

    if (!result) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error en getById product:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Subir imagen de producto
 * POST /api/v1/products/:id/image
 */
const uploadImage = async (req, res) => {
  try {
    const { id } = req.params;

    const productId = parseInt(id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'ID de producto invalido' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se proporciono una imagen' });
    }

    // Subir imagen a Wasabi
    const uploadResult = await uploadProductImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    const imageUrl = uploadResult.url;
    const userId = req.user?.id || null;

    const result = await productsModel.updateProductImage(productId, imageUrl, userId);

    // Eliminar imagen anterior si existia
    if (result.oldImageUrl) {
      await deleteFile(result.oldImageUrl);
    }

    res.json({
      success: true,
      imageUrl: result.imageUrl,
      product: {
        id: result.id,
        code: result.code,
        name: result.name,
        imageUrl: result.imageUrl
      }
    });
  } catch (error) {
    console.error('Error en uploadImage product:', error);

    if (error.message === 'Producto no encontrado') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

/**
 * Listar productos para pedidos - Todos los productos activos
 * GET /api/v1/products/for-orders
 * A diferencia de /catalog/products, este endpoint devuelve TODOS los productos activos
 * sin importar si estan marcados como visibles en catalogo o no
 *
 * Si se proporciona customerId en query param, usa ese (para admin/coordinador creando pedido para cliente)
 * Si no, usa el customerId del usuario autenticado (para cliente haciendo su propio pedido)
 */
const listForOrders = async (req, res) => {
  try {
    const { speciesId, measureId, customerId: queryCustomerId } = req.query;
    // Prioridad: query param > usuario autenticado
    const customerId = queryCustomerId ? parseInt(queryCustomerId) : (req.user?.customerId || null);

    const result = await productsModel.listProductsForOrders({
      speciesId: speciesId ? parseInt(speciesId) : undefined,
      measureId: measureId ? parseInt(measureId) : undefined,
      customerId
    });

    res.json(result);
  } catch (error) {
    console.error('Error en listForOrders products:', error);
    res.status(500).json({ error: 'Error interno del servidor', message: error.message });
  }
};

module.exports = {
  list,
  create,
  update,
  remove,
  getById,
  uploadImage,
  listForOrders
};
