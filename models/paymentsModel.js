/**
 * Payments Model - API-025, API-026
 * Segun diseno en 04_apis_lista.md lineas 1665-1813
 * Tablas reales: movimientos_credito, customers, users
 * NOTA: El diseno menciona tabla payments (TBL-018) pero en schema.prisma
 * no existe. Se usa movimientos_credito con tipo_movimiento='ABONO' para pagos.
 */
const pool = require('../config/db');
const { getPendingCharges } = require('./creditsModel');

// El dinero se opera en centimos enteros para evitar errores de punto flotante
const aCentimos = (valor) => Math.round((parseFloat(valor) || 0) * 100);
const aSoles = (centimos) => centimos / 100;

/**
 * Registrar pago de cliente - API-025
 * POST /api/v1/payments
 *
 * El monto se reparte entre los cargos del cliente y cada asignacion queda registrada
 * en aplicaciones_pago:
 *  - Si se envian chargeIds, se cancelan primero esos cargos (del mas antiguo al mas
 *    reciente entre los seleccionados) y cualquier excedente pasa al resto en FIFO.
 *  - Si no se envian, todo el monto se aplica del cargo mas antiguo al mas reciente.
 *
 * @param {Object} data - Datos del pago
 * @param {number[]} [data.chargeIds] - Cargos que el usuario eligio cancelar (opcional)
 * @returns {Promise<Object>} Pago registrado con el detalle de cargos afectados
 */
const createPayment = async ({ customerId, amount, paymentMethod, reference, notes, signature, userId, chargeIds }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Serializar los pagos de un mismo cliente: evita que dos abonos simultaneos
    // se apliquen sobre la misma foto de cargos pendientes
    await client.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [customerId]);

    // Verificar que el cliente existe y calcular su saldo real
    // El saldo se deriva de los movimientos (CARGOS + SALDO_INICIAL - ABONOS),
    // misma formula que usa el modulo de creditos, para que saldo_anterior/saldo_nuevo
    // sean consistentes con lo que ve el usuario en el estado de cuenta.
    const customerQuery = `
      SELECT
        c.id,
        u.name,
        COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc
           WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0
        ) - COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc
           WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
        ) AS calculated_balance
      FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = $1 AND c.status = 'active'
    `;
    const customerResult = await client.query(customerQuery, [customerId]);

    if (customerResult.rows.length === 0) {
      throw new Error('Cliente no encontrado');
    }

    const customer = customerResult.rows[0];
    const currentBalance = parseFloat(customer.calculated_balance) || 0;
    const paymentAmount = parseFloat(amount) || 0;

    if (paymentAmount <= 0) {
      throw new Error('El monto debe ser un numero positivo');
    }

    // Cargos pendientes del cliente, del mas antiguo al mas reciente
    const cargosPendientes = await getPendingCharges(customerId, client);
    const totalPendienteCent = cargosPendientes.reduce((acc, c) => acc + aCentimos(c.montoPendiente), 0);
    let restanteCent = aCentimos(paymentAmount);

    if (restanteCent > totalPendienteCent) {
      throw new Error(
        `El monto (S/. ${paymentAmount.toFixed(2)}) supera la deuda pendiente del cliente (S/. ${aSoles(totalPendienteCent).toFixed(2)})`
      );
    }

    // Orden de aplicacion: primero los cargos elegidos por el usuario (en FIFO entre
    // ellos), luego el resto tambien en FIFO para absorber cualquier excedente
    const seleccionados = Array.isArray(chargeIds)
      ? chargeIds.map(id => parseInt(id)).filter(id => !isNaN(id))
      : [];

    if (seleccionados.length > 0) {
      const idsPendientes = new Set(cargosPendientes.map(c => c.id));
      const invalidos = seleccionados.filter(id => !idsPendientes.has(id));
      if (invalidos.length > 0) {
        throw new Error(
          'Alguno de los cargos seleccionados ya fue pagado o no pertenece al cliente. Actualiza la vista e intenta de nuevo'
        );
      }
    }

    const setSeleccionados = new Set(seleccionados);
    const ordenAplicacion = [
      ...cargosPendientes.filter(c => setSeleccionados.has(c.id)),
      ...cargosPendientes.filter(c => !setSeleccionados.has(c.id))
    ];

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

    // Registrar a que cargos se aplica este abono
    const aplicaciones = [];
    for (const cargo of ordenAplicacion) {
      if (restanteCent <= 0) break;

      const pendienteCent = aCentimos(cargo.montoPendiente);
      if (pendienteCent <= 0) continue;

      const aplicarCent = Math.min(restanteCent, pendienteCent);
      restanteCent -= aplicarCent;

      await client.query(`
        INSERT INTO aplicaciones_pago (abono_id, cargo_id, monto_aplicado, user_id_registration)
        VALUES ($1, $2, $3, $4)
      `, [movementId, cargo.id, aSoles(aplicarCent), userId]);

      aplicaciones.push({
        chargeId: cargo.id,
        reference: cargo.referencia,
        orderId: cargo.pedidoId,
        appliedAmount: aSoles(aplicarCent),
        remainingAmount: aSoles(pendienteCent - aplicarCent),
        fullyPaid: pendienteCent - aplicarCent <= 0
      });
    }

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
      createdAt: movResult.rows[0].fecha_movimiento,
      appliedCharges: aplicaciones
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
