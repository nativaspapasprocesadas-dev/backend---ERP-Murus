/**
 * Customers Model - API-016, API-017, API-018, API-019, API-020, API-081
 * Segun diseno en 04_apis_lista.md (lineas 1051-1387 para API-016 a 020)
 * Tablas reales: customers, users, productos, precios_cliente, movimientos_credito
 */
const pool = require('../config/db');

/**
 * Listar clientes con paginacion y filtros - API-016
 * @param {Object} params - Parametros de filtro y paginacion
 * @returns {Promise<Object>} Lista paginada de clientes
 */
const listCustomers = async ({ page = 1, pageSize = 20, search, customerType, branchId, userId, roleName }) => {
  // pageSize=0 significa sin limite (retornar todos los registros)
  const parsedPageSize = parseInt(pageSize);
  const allRecords = parsedPageSize === 0;
  pageSize = allRecords ? 0 : Math.min(parsedPageSize || 20, 100);
  page = parseInt(page) || 1;
  const offset = allRecords ? 0 : (page - 1) * pageSize;

  let whereConditions = ["c.status = 'active'", "u.status = 'active'"];
  const params = [];
  let paramIndex = 1;

  // Filtro por sede segun rol
  // Filtra clientes cuya ruta pertenece a la sede O cuyo usuario pertenece a la sede
  if (branchId) {
    whereConditions.push(`(
      (c.route_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM rutas_config rc WHERE rc.id = c.route_id AND rc.branch_id = $${paramIndex}
      ))
      OR (c.route_id IS NULL AND u.branch_id = $${paramIndex})
    )`);
    params.push(branchId);
    paramIndex++;
  }

  // Filtro de busqueda
  if (search) {
    whereConditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR c.contact_name ILIKE $${paramIndex})`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Query para contar total
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM customers c
    JOIN users u ON c.user_id = u.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Query para obtener datos con deuda calculada, estado de vencimiento y resumen de creditos
  const dataQuery = `
    SELECT
      c.id,
      c.user_id AS "userId",
      u.name,
      u.email,
      u.phone AS "userPhone",
      c.contact_phone AS phone,
      c.contact_name AS "contactName",
      c.contact_position AS "contactPosition",
      c.address,
      c.route_id AS "routeId",
      rc.nombre AS "routeName",
      c.credit_days AS "creditDays",
      c.current_balance AS "currentBalance",
      c.customer_type AS "customerType",
      -- Deuda total: CARGOS + SALDO_INICIAL - ABONOS
      COALESCE(
        (SELECT SUM(monto) FROM movimientos_credito mc
         WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'),
        0
      ) - COALESCE(
        (SELECT SUM(monto) FROM movimientos_credito mc
         WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'),
        0
      ) AS "totalDebt",
      -- hasOverdueDebt: true solo si tiene cargo vencido Y deuda total > 0
      (
        EXISTS (
          SELECT 1 FROM movimientos_credito mc_overdue
          WHERE mc_overdue.customer_id = c.id
            AND mc_overdue.tipo_movimiento = 'CARGO'
            AND mc_overdue.status = 'active'
            AND mc_overdue.fecha_vencimiento IS NOT NULL
            AND mc_overdue.fecha_vencimiento < NOW()
        )
        AND (
          COALESCE(
            (SELECT SUM(monto) FROM movimientos_credito mc_debt
             WHERE mc_debt.customer_id = c.id AND mc_debt.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc_debt.status = 'active'), 0
          ) - COALESCE(
            (SELECT SUM(monto) FROM movimientos_credito mc_debt
             WHERE mc_debt.customer_id = c.id AND mc_debt.tipo_movimiento = 'ABONO' AND mc_debt.status = 'active'), 0
          )
        ) > 0
      ) AS "hasOverdueDebt",
      -- Conteo de creditos pendientes (CARGOS activos del cliente)
      COALESCE(
        (SELECT COUNT(*) FROM movimientos_credito mc_pend
         WHERE mc_pend.customer_id = c.id
           AND mc_pend.tipo_movimiento = 'CARGO'
           AND mc_pend.status = 'active'),
        0
      ) AS "pendingCreditsCount",
      -- Conteo de creditos vencidos (CARGOS activos con fecha_vencimiento pasada)
      COALESCE(
        (SELECT COUNT(*) FROM movimientos_credito mc_venc
         WHERE mc_venc.customer_id = c.id
           AND mc_venc.tipo_movimiento = 'CARGO'
           AND mc_venc.status = 'active'
           AND mc_venc.fecha_vencimiento IS NOT NULL
           AND mc_venc.fecha_vencimiento < NOW()),
        0
      ) AS "overdueCreditsCount",
      -- Monto total vencido (suma de cargos vencidos menos abonos del cliente)
      GREATEST(
        COALESCE(
          (SELECT SUM(mc_venc_monto.monto) FROM movimientos_credito mc_venc_monto
           WHERE mc_venc_monto.customer_id = c.id
             AND mc_venc_monto.tipo_movimiento = 'CARGO'
             AND mc_venc_monto.status = 'active'
             AND mc_venc_monto.fecha_vencimiento IS NOT NULL
             AND mc_venc_monto.fecha_vencimiento < NOW()),
          0
        ),
        0
      ) AS "overdueAmount"
    FROM customers c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN rutas_config rc ON c.route_id = rc.id
    ${whereClause}
    ORDER BY u.name ASC
    ${allRecords ? '' : `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`}
  `;
  if (!allRecords) {
    params.push(pageSize, offset);
  }

  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows.map(row => {
      const currentBalance = parseFloat(row.currentBalance) || 0;
      return {
        id: row.id,
        userId: row.userId,
        name: row.name,
        email: row.email,
        phone: row.phone || row.userPhone,
        contactPhone: row.phone,
        contactName: row.contactName,
        contactPosition: row.contactPosition,
        address: row.address,
        routeId: row.routeId,
        routeName: row.routeName || null,
        creditDays: row.creditDays || 0,
        currentBalance: currentBalance,
        totalDebt: parseFloat(row.totalDebt) || 0,
        customerType: row.customerType || 'RECURRENTE',
        hasOverdueDebt: row.hasOverdueDebt === true,
        // Resumen de creditos
        pendingCreditsCount: parseInt(row.pendingCreditsCount) || 0,
        overdueCreditsCount: parseInt(row.overdueCreditsCount) || 0,
        overdueAmount: parseFloat(row.overdueAmount) || 0
      };
    }),
    pagination: {
      total,
      page: allRecords ? 1 : page,
      pageSize: allRecords ? total : pageSize,
      totalPages: allRecords ? 1 : Math.ceil(total / pageSize)
    }
  };
};

/**
 * Obtener detalle completo de un cliente - API-017
 * @param {number} customerId - ID del cliente
 * @returns {Promise<Object|null>} Detalle completo del cliente
 */
const getCustomerDetail = async (customerId) => {
  const query = `
    SELECT
      c.id,
      c.user_id AS "userId",
      u.name,
      u.email,
      u.phone AS "userPhone",
      u.is_active AS "isActive",
      u.branch_id AS "branchId",
      c.address,
      c.route_id AS "routeId",
      c.contact_name AS "contactName",
      c.contact_position AS "contactPosition",
      c.contact_phone AS phone,
      c.credit_days AS "creditDays",
      c.current_balance AS "currentBalance",
      c.customer_type AS "customerType",
      c.date_time_registration AS "createdAt"
    FROM customers c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = $1 AND c.status = 'active'
  `;

  const result = await pool.query(query, [customerId]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  // Calcular deuda total: CARGOS + SALDO_INICIAL - ABONOS
  const debtQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') THEN monto ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN tipo_movimiento = 'ABONO' THEN monto ELSE 0 END), 0) AS "totalDebt"
    FROM movimientos_credito
    WHERE customer_id = $1 AND status = 'active'
  `;
  const debtResult = await pool.query(debtQuery, [customerId]);
  const totalDebt = parseFloat(debtResult.rows[0]?.totalDebt) || 0;
  const currentBalance = parseFloat(row.currentBalance) || 0;

  return {
    id: row.id,
    user: {
      id: row.userId,
      name: row.name,
      email: row.email,
      phone: row.userPhone,
      isActive: row.isActive,
      branchId: row.branchId
    },
    phone: row.phone,
    contactPhone: row.phone,
    address: row.address,
    routeId: row.routeId,
    contactName: row.contactName,
    contactPosition: row.contactPosition,
    customerType: row.customerType || 'RECURRENTE',
    creditDays: row.creditDays || 0,
    currentBalance: currentBalance,
    totalDebt,
    createdAt: row.createdAt
  };
};

/**
 * Generar email unico para cliente basado en el nombre del negocio
 * @param {Object} client - Cliente de conexion a DB
 * @param {string} name - Nombre del negocio
 * @returns {Promise<string>} Email generado unico
 */
const generateUniqueEmail = async (client, name) => {
  // Normalizar nombre: quitar acentos, espacios y caracteres especiales
  const normalizedName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9]/g, '') // Solo letras y numeros
    .substring(0, 30); // Limitar longitud

  const baseEmail = `${normalizedName}@cliente.local`;

  // Verificar si ya existe
  const checkEmail = await client.query(
    "SELECT id FROM users WHERE email = $1",
    [baseEmail]
  );

  if (checkEmail.rows.length === 0) {
    return baseEmail;
  }

  // Si existe, agregar numero secuencial
  let counter = 1;
  let uniqueEmail = `${normalizedName}${counter}@cliente.local`;

  while (true) {
    const check = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [uniqueEmail]
    );
    if (check.rows.length === 0) {
      return uniqueEmail;
    }
    counter++;
    uniqueEmail = `${normalizedName}${counter}@cliente.local`;
  }
};

/**
 * Crear nuevo cliente - API-018
 * @param {Object} customerData - Datos del cliente
 * @returns {Promise<Object>} Cliente creado
 */
const createCustomer = async ({ name, phone, address, routeId, creditDays, discountPercentage, customerType, password, contactName, contactPosition, contactPhone, userId, creatorBranchId }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que el nombre no existe (el nombre es el identificador para login)
    const checkName = await client.query(
      "SELECT id FROM users WHERE LOWER(name) = LOWER($1) AND status = 'active'",
      [name]
    );
    if (checkName.rows.length > 0) {
      throw new Error('El nombre ya esta registrado');
    }

    // Obtener rol CLIENTE
    const roleQuery = await client.query(
      "SELECT id FROM roles WHERE name = 'CLIENTE' AND status = 'active'"
    );
    if (roleQuery.rows.length === 0) {
      throw new Error('Rol CLIENTE no encontrado');
    }
    const clientRoleId = roleQuery.rows[0].id;

    // Generar email unico automatico (requerido por constraint UNIQUE en tabla users)
    const generatedEmail = await generateUniqueEmail(client, name);

    // Generar password por defecto si no se proporciona
    const bcrypt = require('bcrypt');
    const defaultPassword = password || 'cliente123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Determinar branch_id para el usuario del cliente
    let userBranchId = null;
    if (routeId) {
      const routeQuery = await client.query(
        "SELECT branch_id FROM rutas_config WHERE id = $1 AND status = 'active'",
        [routeId]
      );
      if (routeQuery.rows.length > 0) {
        userBranchId = routeQuery.rows[0].branch_id;
      }
    }
    if (userBranchId === null) {
      userBranchId = creatorBranchId || null;
    }

    // Crear usuario con branch_id asignado (email generado automaticamente)
    const insertUserQuery = `
      INSERT INTO users (name, email, password, role_id, phone, is_active, branch_id, user_id_registration)
      VALUES ($1, $2, $3, $4, $5, true, $6, $7)
      RETURNING id
    `;
    const userResult = await client.query(insertUserQuery, [
      name, generatedEmail, hashedPassword, clientRoleId, phone, userBranchId, userId
    ]);
    const newUserId = userResult.rows[0].id;

    // Determinar customer_type y credit_days
    const finalCustomerType = customerType || 'RECURRENTE';
    let finalCreditDays = creditDays !== undefined ? creditDays : null;

    // Si se proporciona customer_type, ajustar credit_days segun logica
    if (finalCustomerType === 'RECURRENTE' && finalCreditDays === null) {
      finalCreditDays = 15; // Default para RECURRENTE
    } else if (finalCustomerType === 'NO_RECURRENTE') {
      finalCreditDays = 0; // Siempre 0 para NO_RECURRENTE
    }

    // Crear customer con datos de contacto
    const insertCustomerQuery = `
      INSERT INTO customers (user_id, address, route_id, contact_name, contact_position, contact_phone, credit_days, current_balance, customer_type, user_id_registration)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9)
      RETURNING id
    `;
    const customerResult = await client.query(insertCustomerQuery, [
      newUserId,
      address,
      routeId || null,
      contactName || name, // Usar contactName si se proporciona, sino el nombre del negocio como fallback
      contactPosition || null,
      contactPhone || phone, // Usar contactPhone si se proporciona, sino el teléfono del negocio como fallback
      finalCreditDays,
      finalCustomerType,
      userId
    ]);

    await client.query('COMMIT');

    return {
      id: customerResult.rows[0].id,
      userId: newUserId,
      name
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Actualizar cliente - API-019
 * @param {number} customerId - ID del cliente
 * @param {Object} updateData - Datos a actualizar
 * @returns {Promise<Object>} Cliente actualizado
 */
const updateCustomer = async (customerId, { name, phone, contactPhone, address, routeId, creditDays, discountPercentage, customerType, contactName, contactPosition, userId }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que el cliente existe
    const checkQuery = `
      SELECT c.id, c.user_id
      FROM customers c
      WHERE c.id = $1 AND c.status = 'active'
    `;
    const checkResult = await client.query(checkQuery, [customerId]);
    if (checkResult.rows.length === 0) {
      throw new Error('Cliente no encontrado');
    }

    const customerUserId = checkResult.rows[0].user_id;

    // Actualizar usuario si se proporciona name o phone (del usuario)
    if (name) {
      await client.query(`
        UPDATE users SET name = $1, user_id_modification = $2, date_time_modification = NOW()
        WHERE id = $3
      `, [name, userId, customerUserId]);
    }

    // Construir actualizacion dinamica de customer
    const updateFields = [];
    const updateParams = [];
    let paramIndex = 1;

    // Manejar actualización de contact_phone (acepta tanto phone como contactPhone)
    const phoneValue = contactPhone !== undefined ? contactPhone : phone;
    if (phoneValue !== undefined) {
      updateFields.push(`contact_phone = $${paramIndex}`);
      updateParams.push(phoneValue);
      paramIndex++;
    }
    if (address !== undefined) {
      updateFields.push(`address = $${paramIndex}`);
      updateParams.push(address);
      paramIndex++;
    }
    if (contactName !== undefined) {
      updateFields.push(`contact_name = $${paramIndex}`);
      updateParams.push(contactName);
      paramIndex++;
    }
    if (contactPosition !== undefined) {
      updateFields.push(`contact_position = $${paramIndex}`);
      updateParams.push(contactPosition);
      paramIndex++;
    }
    if (routeId !== undefined) {
      updateFields.push(`route_id = $${paramIndex}`);
      updateParams.push(routeId);
      paramIndex++;

      // Actualizar branch_id del usuario cuando cambia la ruta
      if (routeId !== null) {
        const routeQuery = await client.query(
          "SELECT branch_id FROM rutas_config WHERE id = $1 AND status = 'active'",
          [routeId]
        );

        if (routeQuery.rows.length > 0) {
          const newBranchId = routeQuery.rows[0].branch_id;
          await client.query(`
            UPDATE users
            SET branch_id = $1, user_id_modification = $2, date_time_modification = NOW()
            WHERE id = $3
          `, [newBranchId, userId, customerUserId]);
        }
      } else {
        // Si se quita la ruta, tambien quitar la sede
        await client.query(`
          UPDATE users
          SET branch_id = NULL, user_id_modification = $1, date_time_modification = NOW()
          WHERE id = $2
        `, [userId, customerUserId]);
      }
    }
    if (creditDays !== undefined) {
      updateFields.push(`credit_days = $${paramIndex}`);
      updateParams.push(creditDays);
      paramIndex++;
    }
    if (customerType !== undefined) {
      updateFields.push(`customer_type = $${paramIndex}`);
      updateParams.push(customerType);
      paramIndex++;
    }

    if (updateFields.length > 0) {
      updateFields.push(`user_id_modification = $${paramIndex}`);
      updateParams.push(userId);
      paramIndex++;
      updateFields.push(`date_time_modification = NOW()`);

      updateParams.push(customerId);
      await client.query(`
        UPDATE customers SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
      `, updateParams);
    }

    await client.query('COMMIT');

    // Retornar cliente actualizado
    return await getCustomerDetail(customerId);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Cambiar tipo de cliente - API-020
 * Actualiza el campo customer_type en la DB y ajusta credit_days segun el tipo
 * @param {number} customerId - ID del cliente
 * @param {string} customerType - RECURRENTE | NO_RECURRENTE
 * @param {number} userId - ID del usuario que realiza el cambio
 * @returns {Promise<Object>} Cliente con tipo actualizado
 */
const changeCustomerType = async (customerId, customerType, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que el cliente existe
    const checkQuery = `
      SELECT c.id, c.customer_type AS "currentType", c.credit_days AS "currentCreditDays", u.name
      FROM customers c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = $1 AND c.status = 'active'
    `;
    const checkResult = await client.query(checkQuery, [customerId]);
    if (checkResult.rows.length === 0) {
      throw new Error('Cliente no encontrado');
    }

    const currentCustomer = checkResult.rows[0];

    // Validar tipo
    if (!['RECURRENTE', 'NO_RECURRENTE'].includes(customerType)) {
      throw new Error('Tipo de cliente invalido. Debe ser RECURRENTE o NO_RECURRENTE');
    }

    // Determinar credit_days segun el tipo
    let newCreditDays = currentCustomer.currentCreditDays;
    if (customerType === 'RECURRENTE' && newCreditDays === 0) {
      newCreditDays = 15; // Default para RECURRENTE
    } else if (customerType === 'NO_RECURRENTE') {
      newCreditDays = 0; // Siempre 0 para NO_RECURRENTE
    }

    // Actualizar customer_type y credit_days
    await client.query(`
      UPDATE customers
      SET customer_type = $1,
          credit_days = $2,
          user_id_modification = $3,
          date_time_modification = NOW()
      WHERE id = $4
    `, [customerType, newCreditDays, userId, customerId]);

    await client.query('COMMIT');

    return {
      id: customerId,
      customerType: customerType,
      creditDays: newCreditDays,
      name: currentCustomer.name
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Verificar si un cliente existe y esta activo
 * @param {number} customerId - ID del cliente
 * @returns {Promise<Object|null>} Cliente o null
 */
const getCustomerById = async (customerId) => {
  const query = `
    SELECT c.id, c.user_id, c.status, c.customer_type, c.credit_days, u.name
    FROM customers c
    JOIN users u ON c.user_id = u.id
    WHERE c.id = $1 AND c.status = 'active'
  `;
  const result = await pool.query(query, [customerId]);
  return result.rows[0] || null;
};

/**
 * Verificar si un producto existe y esta activo
 * @param {number} productId - ID del producto
 * @returns {Promise<Object|null>} Producto o null
 */
const getProductById = async (productId) => {
  const query = `
    SELECT id, codigo, nombre, precio_base, status
    FROM productos
    WHERE id = $1 AND status = 'active'
  `;
  const result = await pool.query(query, [productId]);
  return result.rows[0] || null;
};

/**
 * Actualizar precios personalizados de un cliente - API-081
 * PUT /api/v1/customers/{id}/product-prices
 *
 * Segun diseno:
 * - prices[].productId: producto debe existir
 * - prices[].customPrice: decimal positivo o null (null = eliminar)
 * - prices[].isActive: boolean
 *
 * @param {number} customerId - ID del cliente
 * @param {Array} prices - Array de {productId, customPrice, isActive}
 * @param {number} userId - ID del usuario que realiza la operacion
 * @returns {Promise<Object>} Resultado de la operacion
 */
const updateCustomerProductPrices = async (customerId, prices, userId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let updated = 0;
    let created = 0;
    let removed = 0;
    const processedPrices = [];

    for (const priceItem of prices) {
      const { productId, customPrice, isActive } = priceItem;

      // Verificar si ya existe un precio personalizado para este cliente-producto
      const existingQuery = `
        SELECT id, precio_especial, status
        FROM precios_cliente
        WHERE customer_id = $1 AND producto_id = $2
      `;
      const existingResult = await client.query(existingQuery, [customerId, productId]);
      const existing = existingResult.rows[0];

      // Obtener info del producto para respuesta
      const productQuery = `
        SELECT id, codigo, nombre, precio_base
        FROM productos
        WHERE id = $1
      `;
      const productResult = await client.query(productQuery, [productId]);
      const product = productResult.rows[0];

      if (customPrice === null || customPrice === undefined) {
        // Eliminar precio personalizado (marcar como inactive)
        if (existing) {
          const deleteQuery = `
            UPDATE precios_cliente
            SET status = 'inactive',
                user_id_modification = $1,
                date_time_modification = NOW()
            WHERE customer_id = $2 AND producto_id = $3
            RETURNING id
          `;
          await client.query(deleteQuery, [userId, customerId, productId]);
          removed++;
        }
        // No agregar al array de respuesta si fue eliminado
      } else {
        // Crear o actualizar precio personalizado
        if (existing) {
          // Actualizar existente
          const updateQuery = `
            UPDATE precios_cliente
            SET precio_especial = $1,
                status = $2,
                user_id_modification = $3,
                date_time_modification = NOW()
            WHERE customer_id = $4 AND producto_id = $5
            RETURNING id, precio_especial, status, fecha_inicio, fecha_fin
          `;
          const updateResult = await client.query(updateQuery, [
            customPrice,
            isActive === false ? 'inactive' : 'active',
            userId,
            customerId,
            productId
          ]);
          updated++;

          if (product && isActive !== false) {
            processedPrices.push({
              id: updateResult.rows[0].id,
              productId: product.id,
              productCode: product.codigo,
              productName: product.nombre,
              standardPrice: parseFloat(product.precio_base),
              customPrice: parseFloat(customPrice),
              isActive: updateResult.rows[0].status === 'active',
              validFrom: updateResult.rows[0].fecha_inicio,
              validTo: updateResult.rows[0].fecha_fin
            });
          }
        } else {
          // Crear nuevo
          const insertQuery = `
            INSERT INTO precios_cliente (
              customer_id, producto_id, precio_especial, status,
              user_id_registration, date_time_registration
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING id, precio_especial, status, fecha_inicio, fecha_fin
          `;
          const insertResult = await client.query(insertQuery, [
            customerId,
            productId,
            customPrice,
            isActive === false ? 'inactive' : 'active',
            userId
          ]);
          created++;

          if (product) {
            processedPrices.push({
              id: insertResult.rows[0].id,
              productId: product.id,
              productCode: product.codigo,
              productName: product.nombre,
              standardPrice: parseFloat(product.precio_base),
              customPrice: parseFloat(customPrice),
              isActive: insertResult.rows[0].status === 'active',
              validFrom: insertResult.rows[0].fecha_inicio,
              validTo: insertResult.rows[0].fecha_fin
            });
          }
        }
      }
    }

    await client.query('COMMIT');

    return {
      success: true,
      updated,
      created,
      removed,
      prices: processedPrices
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Obtener precios personalizados de un cliente con paginacion y filtros - API-080
 * GET /api/v1/customers/{id}/product-prices
 *
 * Segun diseno API-080:
 * - Response: CustomerProductPriceDTO[]
 * - Paginacion: page, pageSize
 * - Filtros: speciesId, search
 * - Retorna productos con precio personalizado Y productos sin precio (con standardPrice)
 *
 * @param {number} customerId - ID del cliente
 * @param {Object} options - Opciones de filtro y paginacion
 * @returns {Promise<Object>} Lista paginada de precios
 */
const getCustomerProductPrices = async (customerId, options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    speciesId,
    search
  } = options;

  // Validar pageSize maximo 100
  const validPageSize = Math.min(parseInt(pageSize) || 20, 100);
  const validPage = parseInt(page) || 1;
  const offset = (validPage - 1) * validPageSize;

  // Construir condiciones de filtro
  let whereConditions = ["p.status = 'active'"];
  const params = [customerId];
  let paramIndex = 2;

  // Filtro por especie
  if (speciesId) {
    whereConditions.push(`p.especie_id = $${paramIndex}`);
    params.push(parseInt(speciesId));
    paramIndex++;
  }

  // Filtro por busqueda (nombre producto)
  if (search) {
    whereConditions.push(`p.nombre ILIKE $${paramIndex}`);
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

  // Query para contar total de productos (con o sin precio personalizado)
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM productos p
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params.slice(1));
  const total = parseInt(countResult.rows[0].total);

  // Query principal: obtener productos con su precio personalizado (si existe)
  const dataQuery = `
    SELECT
      p.id AS "productId",
      p.nombre AS "productName",
      p.codigo AS "productCode",
      p.precio_base AS "standardPrice",
      e.nombre AS "speciesName",
      m.nombre AS "measureName",
      pr.nombre AS "presentationName",
      pc.id AS "priceId",
      pc.precio_especial AS "customPrice",
      pc.status AS "priceStatus",
      CASE
        WHEN pc.precio_especial IS NOT NULL AND pc.status = 'active'
        THEN ROUND(((p.precio_base - pc.precio_especial) / p.precio_base * 100)::numeric, 2)
        ELSE 0
      END AS "discountPercent"
    FROM productos p
    LEFT JOIN especies e ON p.especie_id = e.id
    LEFT JOIN medidas m ON p.medida_id = m.id
    LEFT JOIN presentaciones pr ON p.presentacion_id = pr.id
    LEFT JOIN precios_cliente pc ON pc.producto_id = p.id AND pc.customer_id = $1 AND pc.status = 'active'
    ${whereClause}
    ORDER BY p.nombre ASC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(validPageSize, offset);

  const dataResult = await pool.query(dataQuery, params);

  return {
    data: dataResult.rows.map(row => ({
      productId: row.productId,
      productName: row.productName,
      productCode: row.productCode,
      speciesName: row.speciesName,
      measureName: row.measureName,
      presentationName: row.presentationName,
      standardPrice: parseFloat(row.standardPrice) || 0,
      customPrice: row.customPrice !== null ? parseFloat(row.customPrice) : null,
      discountPercent: parseFloat(row.discountPercent) || 0,
      isActive: row.priceStatus === 'active'
    })),
    pagination: {
      total,
      page: validPage,
      pageSize: validPageSize,
      totalPages: Math.ceil(total / validPageSize)
    }
  };
};

/**
 * Obtener cliente por user_id - Para endpoint /customers/me
 * Permite al usuario CLIENTE obtener sus propios datos
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object|null>} Datos del cliente o null si no existe
 */
const getCustomerByUserId = async (userId) => {
  const query = `
    SELECT
      c.id,
      c.user_id AS "userId",
      u.name,
      u.email,
      u.phone,
      c.address,
      c.route_id AS "routeId",
      rc.nombre AS "routeName",
      c.credit_days AS "creditDays",
      c.current_balance AS "currentBalance",
      c.customer_type AS "customerType",
      c.contact_name AS "contactName",
      c.contact_position AS "contactPosition",
      c.contact_phone AS "contactPhone",
      c.status,
      u.branch_id AS "branchId"
    FROM customers c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN rutas_config rc ON c.route_id = rc.id
    WHERE c.user_id = $1 AND c.status = 'active' AND u.status = 'active'
  `;
  const result = await pool.query(query, [userId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const customerType = row.customerType || 'RECURRENTE';

  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    routeId: row.routeId,
    routeName: row.routeName,
    creditDays: row.creditDays || 0,
    currentBalance: parseFloat(row.currentBalance) || 0,
    contactName: row.contactName,
    contactPosition: row.contactPosition,
    contactPhone: row.contactPhone,
    branchId: row.branchId,
    customerType: customerType,
    isRecurring: customerType === 'RECURRENTE'
  };
};

/**
 * Eliminar cliente (soft delete)
 * Marca el cliente y su usuario asociado como 'deleted'
 * Los pedidos y créditos existentes NO se afectan
 * @param {number} customerId - ID del cliente
 * @param {number} userId - ID del usuario que realiza la acción
 * @returns {Promise<Object>} Resultado de la operación
 */
const deleteCustomer = async (customerId, actionUserId) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que el cliente existe y está activo
    const checkQuery = `
      SELECT c.id, c.user_id, u.name, u.email
      FROM customers c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = $1 AND c.status = 'active'
    `;
    const checkResult = await client.query(checkQuery, [customerId]);

    if (checkResult.rows.length === 0) {
      throw new Error('Cliente no encontrado o ya fue eliminado');
    }

    const customer = checkResult.rows[0];

    // Marcar cliente como 'deleted'
    const updateCustomerQuery = `
      UPDATE customers
      SET status = 'deleted',
          user_id_modification = $1,
          date_time_modification = NOW()
      WHERE id = $2
    `;
    await client.query(updateCustomerQuery, [actionUserId, customerId]);

    // Marcar usuario asociado como 'deleted' (para que no pueda iniciar sesión)
    const updateUserQuery = `
      UPDATE users
      SET status = 'deleted',
          user_id_modification = $1,
          date_time_modification = NOW()
      WHERE id = $2
    `;
    await client.query(updateUserQuery, [actionUserId, customer.user_id]);

    await client.query('COMMIT');

    return {
      success: true,
      message: 'Cliente eliminado correctamente',
      customer: {
        id: customerId,
        name: customer.name,
        email: customer.email
      }
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  // API-016 a API-020
  listCustomers,
  getCustomerDetail,
  createCustomer,
  updateCustomer,
  changeCustomerType,
  // API-081 y auxiliares
  getCustomerById,
  getProductById,
  updateCustomerProductPrices,
  getCustomerProductPrices,
  // Para /customers/me
  getCustomerByUserId,
  // Eliminar cliente
  deleteCustomer
};
