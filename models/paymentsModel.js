/**
 * Payments Model - API-025, API-026
 * Segun diseno en 04_apis_lista.md lineas 1665-1813
 * Tablas reales: movimientos_credito, customers, users
 * NOTA: El diseno menciona tabla payments (TBL-018) pero en schema.prisma
 * no existe. Se usa movimientos_credito con tipo_movimiento='ABONO' para pagos.
 */
const pool = require('../config/db');

/**
 * Registrar pago de cliente - API-025
 * POST /api/v1/payments
 * @param {Object} data - Datos del pago
 * @returns {Promise<Object>} Pago registrado
 */
const createPayment = async ({ customerId, amount, paymentMethod, reference, notes, signature, userId }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verificar que el cliente existe
    const customerQuery = `
      SELECT c.id, c.current_balance, u.name
      FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = $1 AND c.status = 'active'
    `;
    const customerResult = await client.query(customerQuery, [customerId]);

    if (customerResult.rows.length === 0) {
      throw new Error('Cliente no encontrado');
    }

    const customer = customerResult.rows[0];
    const currentBalance = parseFloat(customer.current_balance) || 0;
    const paymentAmount = parseFloat(amount) || 0;

    if (paymentAmount <= 0) {
      throw new Error('El monto debe ser un numero positivo');
    }

    // Calcular nuevo saldo
    const newBalance = currentBalance - paymentAmount;

    // Crear movimiento de credito tipo ABONO
    const insertMovimiento = `
      INSERT INTO movimientos_credito (
        customer_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo,
        descripcion, user_id_registration, firma_digital, metodo_pago, referencia_pago
      )
      VALUES ($1, 'ABONO', $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, fecha_movimiento
    `;

    const description = notes
      ? `Pago ${paymentMethod || 'EFECTIVO'}: ${notes}${reference ? ' - Ref: ' + reference : ''}`
      : `Pago ${paymentMethod || 'EFECTIVO'}${reference ? ' - Ref: ' + reference : ''}`;

    const movResult = await client.query(insertMovimiento, [
      customerId, paymentAmount, currentBalance, newBalance, description, userId,
      signature || null, paymentMethod || 'EFECTIVO', reference || null
    ]);

    const movementId = movResult.rows[0].id;

    // Actualizar saldo del cliente
    await client.query(`
      UPDATE customers SET current_balance = $1, user_id_modification = $2, date_time_modification = NOW()
      WHERE id = $3
    `, [newBalance, userId, customerId]);

    await client.query('COMMIT');

    return {
      id: movementId,
      customerId: customerId,
      amount: paymentAmount,
      creditMovementId: movementId,
      newBalance: newBalance,
      paymentMethod: paymentMethod || 'EFECTIVO',
      reference: reference || null,
      createdAt: movResult.rows[0].fecha_movimiento
    };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Listar historial de pagos - API-026
 * GET /api/v1/payments
 * @param {Object} params - Filtros y paginacion
 * @returns {Promise<Object>} Lista paginada de pagos
 */
const listPayments = async ({ page = 1, pageSize = 20, customerId, dateFrom, dateTo, branchId }) => {
  pageSize = Math.min(parseInt(pageSize) || 20, 100);
  page = parseInt(page) || 1;
  const offset = (page - 1) * pageSize;

  let whereConditions = ["mc.status = 'active'", "mc.tipo_movimiento = 'ABONO'"];
  const params = [];
  let paramIndex = 1;

  if (customerId) {
    whereConditions.push(`mc.customer_id = $${paramIndex}`);
    params.push(customerId);
    paramIndex++;
  }

  if (branchId) {
    whereConditions.push(`u.branch_id = $${paramIndex}`);
    params.push(branchId);
    paramIndex++;
  }

  if (dateFrom) {
    whereConditions.push(`DATE(mc.fecha_movimiento) >= $${paramIndex}`);
    params.push(dateFrom);
    paramIndex++;
  }

  if (dateTo) {
    whereConditions.push(`DATE(mc.fecha_movimiento) <= $${paramIndex}`);
    params.push(dateTo);
    paramIndex++;
  }

  const whereClause = 'WHERE ' + whereConditions.join(' AND ');

  // Contar total
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM movimientos_credito mc
    LEFT JOIN customers c ON mc.customer_id = c.id
    LEFT JOIN users u ON c.user_id = u.id
    ${whereClause}
  `;
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].total);

  // Obtener pagos con info del usuario que registro
  const dataQuery = `
    SELECT
      mc.id,
      mc.customer_id AS "customerId",
      u.name AS "customerName",
      mc.monto AS amount,
      mc.descripcion AS description,
      mc.fecha_movimiento AS "createdAt",
      mc.user_id_registration AS "registeredById",
      reg_user.name AS "registeredByName",
      reg_role.name AS "registeredByRole",
      mc.firma_digital AS "signature",
      mc.metodo_pago AS "paymentMethodDb",
      mc.referencia_pago AS "referenceDb"
    FROM movimientos_credito mc
    LEFT JOIN customers c ON mc.customer_id = c.id
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN users reg_user ON mc.user_id_registration = reg_user.id
    LEFT JOIN roles reg_role ON reg_user.role_id = reg_role.id
    ${whereClause}
    ORDER BY mc.fecha_movimiento DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(pageSize, offset);

  const dataResult = await pool.query(dataQuery, params);

  // Extraer metodo de pago de la descripcion (si existe)
  const extractPaymentMethod = (desc) => {
    if (!desc) return 'EFECTIVO';
    if (desc.includes('TRANSFERENCIA')) return 'TRANSFERENCIA';
    if (desc.includes('DEPOSITO')) return 'DEPOSITO';
    if (desc.includes('YAPE')) return 'YAPE';
    if (desc.includes('PLIN')) return 'PLIN';
    return 'EFECTIVO';
  };

  // Extraer referencia de la descripcion
  const extractReference = (desc) => {
    if (!desc) return null;
    const match = desc.match(/Ref:\s*([^\s]+)/);
    return match ? match[1] : null;
  };

  // Extraer notas de la descripcion (todo despues del metodo de pago)
  const extractNotes = (desc) => {
    if (!desc) return null;
    // Formato: "Pago METODO: notas - Ref: xxx" o "Pago METODO - Ref: xxx"
    const match = desc.match(/Pago [A-Z]+:\s*(.+?)(?:\s*-\s*Ref:|$)/);
    return match ? match[1].trim() : null;
  };

  return {
    data: dataResult.rows.map(row => ({
      id: row.id,
      customer: {
        id: row.customerId,
        name: row.customerName
      },
      amount: parseFloat(row.amount) || 0,
      // Usar campos de BD directamente, con fallback a extracción de descripción
      paymentMethod: row.paymentMethodDb || extractPaymentMethod(row.description),
      reference: row.referenceDb || extractReference(row.description),
      notes: extractNotes(row.description),
      createdAt: row.createdAt,
      userId: row.registeredById,
      user: {
        id: row.registeredById,
        name: row.registeredByName || 'Sistema',
        role: row.registeredByRole || ''
      },
      // Firma digital (SVG/base64)
      signature: row.signature || null
    })),
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  };
};

module.exports = {
  createPayment,
  listPayments
};
