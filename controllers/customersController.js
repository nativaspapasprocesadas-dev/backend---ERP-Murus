/**
 * Customers Controller - API-016, API-017, API-018, API-019, API-020, API-080, API-081
 * Segun diseno en 04_apis_lista.md (lineas 1051-1387 para API-016 a 020)
 * API-080: GET /api/v1/customers/{id}/product-prices (linea 5020)
 * API-081: PUT /api/v1/customers/{id}/product-prices
 */
const {
  listCustomers,
  getCustomerDetail,
  createCustomer,
  updateCustomer,
  changeCustomerType,
  getCustomerById,
  getProductById,
  updateCustomerProductPrices,
  getCustomerProductPrices,
  getCustomerByUserId,
  deleteCustomer
} = require('../models/customersModel');
const jwt = require('jsonwebtoken');

/**
 * Decodificar token JWT y verificar rol
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
 * Verificar roles permitidos
 * @param {string} roleName - Nombre del rol del usuario
 * @param {Array} allowedRoles - Roles permitidos
 * @returns {boolean}
 */
const hasPermission = (roleName, allowedRoles) => {
  return allowedRoles.includes(roleName);
};

/**
 * PUT /api/v1/customers/:id/product-prices - API-081
 * Actualizar precios personalizados de productos para un cliente
 *
 * Segun diseno:
 * - Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 * - Request body: { prices: [{productId, customPrice, isActive}] }
 * - Response: { success, updated, created, removed, prices }
 */
const updateProductPrices = async (req, res) => {
  try {
    // Verificar autenticacion
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Token invalido o expirado'
      });
    }

    // Verificar rol - API-081: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
    const allowedRoles = ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'];
    if (!hasPermission(decoded.role_name, allowedRoles)) {
      return res.status(403).json({
        success: false,
        error: 'No tiene permisos para realizar esta operacion'
      });
    }

    // Obtener ID del cliente desde path params
    const customerId = parseInt(req.params.id);
    if (!customerId || isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de cliente invalido'
      });
    }

    // Validar request body
    const { prices } = req.body;
    if (!prices || !Array.isArray(prices)) {
      return res.status(400).json({
        success: false,
        error: 'El campo prices es requerido y debe ser un array'
      });
    }

    // Verificar que el cliente existe y esta activo
    const customer = await getCustomerById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado o inactivo'
      });
    }

    // Validar cada precio en el array
    const validationErrors = [];
    for (let i = 0; i < prices.length; i++) {
      const priceItem = prices[i];

      // Validar productId
      if (!priceItem.productId) {
        validationErrors.push(`prices[${i}].productId es requerido`);
        continue;
      }

      const productId = parseInt(priceItem.productId);
      if (isNaN(productId)) {
        validationErrors.push(`prices[${i}].productId debe ser un numero valido`);
        continue;
      }

      // Verificar que el producto existe
      const product = await getProductById(productId);
      if (!product) {
        validationErrors.push(`prices[${i}].productId: Producto ${productId} no encontrado o inactivo`);
        continue;
      }

      // Validar customPrice si no es null
      if (priceItem.customPrice !== null && priceItem.customPrice !== undefined) {
        const customPrice = parseFloat(priceItem.customPrice);
        if (isNaN(customPrice) || customPrice < 0) {
          validationErrors.push(`prices[${i}].customPrice debe ser un decimal positivo o null`);
        }
      }

      // Validar isActive si se proporciona
      if (priceItem.isActive !== undefined && typeof priceItem.isActive !== 'boolean') {
        validationErrors.push(`prices[${i}].isActive debe ser un boolean`);
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Errores de validacion',
        details: validationErrors
      });
    }

    // Ejecutar actualizacion de precios
    const result = await updateCustomerProductPrices(
      customerId,
      prices.map(p => ({
        productId: parseInt(p.productId),
        customPrice: p.customPrice === null ? null : parseFloat(p.customPrice),
        isActive: p.isActive
      })),
      decoded.id
    );

    // Response segun diseno API-081
    res.json({
      success: true,
      updated: result.updated,
      created: result.created,
      removed: result.removed,
      prices: result.prices
    });

  } catch (error) {
    console.error('Error actualizando precios de cliente:', error);

    // Manejar conflictos de constraint unique
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Conflicto: precio duplicado para producto'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * GET /api/v1/customers - API-016
 * Listar clientes con paginacion y filtros
 */
const list = async (req, res) => {
  try {
    const { page, pageSize, search, customerType, branchId } = req.query;

    // Obtener branch_id del usuario autenticado (viene del JWT con snake_case)
    const userBranchId = req.user?.branch_id || req.user?.branchId || null;

    const result = await listCustomers({
      page: parseInt(page) || 1,
      pageSize: pageSize !== undefined ? parseInt(pageSize) : 20,
      search: search || null,
      customerType: customerType || null,
      branchId: branchId ? parseInt(branchId) : userBranchId,
      userId: req.user?.id,
      roleName: req.user?.role_name || req.user?.roleName
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error en list customers:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/customers/:id - API-017
 * Obtener detalle de un cliente
 */
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID de cliente invalido' });
    }

    const customer = await getCustomerDetail(parseInt(id));

    if (!customer) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    return res.status(200).json(customer);
  } catch (error) {
    console.error('Error en getById customer:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/customers/me
 * Obtener los datos del cliente del usuario logueado
 * Solo accesible por rol CLIENTE
 * NOTA: El middleware verifyToken ya pone req.user y checkRole ya verificó el rol
 */
const getMe = async (req, res) => {
  try {
    // req.user viene del middleware verifyToken
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Usuario no autenticado' });
    }

    const customer = await getCustomerByUserId(req.user.id);

    if (!customer) {
      return res.status(404).json({ success: false, error: 'No se encontro informacion de cliente para este usuario' });
    }

    return res.status(200).json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Error en getMe customer:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/customers - API-018
 * Crear nuevo cliente
 */
const create = async (req, res) => {
  try {
    const { name, phone, address, routeId, creditDays, discountPercentage, customerType, password, contactName, contactPosition, contactPhone } = req.body;

    // Validaciones segun diseno
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Nombre es requerido y debe tener minimo 2 caracteres' });
    }
    if (!phone) {
      return res.status(400).json({ error: 'Telefono es requerido' });
    }

    const result = await createCustomer({
      name,
      phone,
      address,
      routeId: routeId ? parseInt(routeId) : null,
      creditDays: creditDays !== undefined ? parseInt(creditDays) : undefined,
      discountPercentage: discountPercentage ? parseFloat(discountPercentage) : 0,
      customerType: customerType || 'RECURRENTE',
      password,
      contactName,
      contactPosition,
      contactPhone,
      userId: req.user?.id,
      creatorBranchId: req.user?.branch_id
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('Error en create customer:', error);

    if (error.message === 'El nombre ya esta registrado') {
      return res.status(409).json({ error: error.message });
    }
    if (error.message === 'Rol CLIENTE no encontrado') {
      return res.status(500).json({ error: 'Configuracion de roles incorrecta' });
    }

    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/v1/customers/:id - API-019
 * Actualizar cliente existente
 */
const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, contactPhone, address, routeId, creditDays, discountPercentage, customerType, contactName, contactPosition } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID de cliente invalido' });
    }

    const result = await updateCustomer(parseInt(id), {
      name,
      phone,
      contactPhone,
      address,
      routeId: routeId !== undefined ? (routeId ? parseInt(routeId) : null) : undefined,
      creditDays: creditDays !== undefined ? parseInt(creditDays) : undefined,
      discountPercentage: discountPercentage !== undefined ? parseFloat(discountPercentage) : undefined,
      customerType,
      contactName,
      contactPosition,
      userId: req.user?.id
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error en update customer:', error);

    if (error.message === 'Cliente no encontrado') {
      return res.status(404).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * PATCH /api/v1/customers/:id/type - API-020
 * Cambiar tipo de cliente (RECURRENTE/NO_RECURRENTE)
 */
const changeType = async (req, res) => {
  try {
    const { id } = req.params;
    const { customerType } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'ID de cliente invalido' });
    }

    if (!customerType || !['RECURRENTE', 'NO_RECURRENTE'].includes(customerType)) {
      return res.status(400).json({ error: 'customerType debe ser RECURRENTE o NO_RECURRENTE' });
    }

    const result = await changeCustomerType(parseInt(id), customerType, req.user?.id);

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error en changeType customer:', error);

    if (error.message === 'Cliente no encontrado') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('invalido')) {
      return res.status(400).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/customers/:id/product-prices - API-080
 * Obtener precios personalizados de productos para un cliente
 *
 * Segun diseno API-080:
 * - Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 * - Query params: page, pageSize, speciesId, search
 * - Response: PaginatedList<CustomerProductPriceDTO>
 */
const getProductPrices = async (req, res) => {
  try {
    // Verificar autenticacion
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({
        success: false,
        error: 'Token invalido o expirado'
      });
    }

    // Verificar rol - API-080: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
    const allowedRoles = ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'];
    if (!hasPermission(decoded.role_name, allowedRoles)) {
      return res.status(403).json({
        success: false,
        error: 'No tiene permisos para acceder a esta informacion'
      });
    }

    // Obtener ID del cliente desde path params
    const customerId = parseInt(req.params.id);
    if (!customerId || isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de cliente invalido'
      });
    }

    // Verificar que el cliente existe y esta activo
    const customer = await getCustomerById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado o inactivo'
      });
    }

    // Obtener parametros de query
    const { page, pageSize, speciesId, search } = req.query;

    // Ejecutar query con paginacion y filtros
    const result = await getCustomerProductPrices(customerId, {
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 20,
      speciesId: speciesId ? parseInt(speciesId) : null,
      search: search || null
    });

    // Response segun diseno API-080: PaginatedList<CustomerProductPriceDTO>
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error obteniendo precios de cliente:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * DELETE /api/v1/customers/:id
 * Eliminar cliente (soft delete)
 * El cliente y su usuario asociado se marcan como 'deleted'
 * Los pedidos y créditos existentes NO se afectan
 */
const remove = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }

    // Solo SUPERADMINISTRADOR y ADMINISTRADOR pueden eliminar clientes
    if (!hasPermission(decoded.role_name, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({
        success: false,
        error: 'No tiene permisos para eliminar clientes'
      });
    }

    const customerId = parseInt(req.params.id);
    if (isNaN(customerId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de cliente inválido'
      });
    }

    const result = await deleteCustomer(customerId, decoded.id);

    res.json({
      success: true,
      message: result.message,
      data: result.customer
    });

  } catch (error) {
    console.error('Error eliminando cliente:', error);

    if (error.message === 'Cliente no encontrado o ya fue eliminado') {
      return res.status(404).json({
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

module.exports = {
  // API-016 a API-020
  list,
  getById,
  create,
  update,
  changeType,
  // API-080
  getProductPrices,
  // API-081
  updateProductPrices,
  // /customers/me - Cliente actual
  getMe,
  // DELETE - Eliminar cliente
  remove
};
