/**
 * Credits Controller - API-021, API-022, API-023, API-024
 * Segun diseno en 04_apis_lista.md lineas 1393-1659
 */
const {
  getClientCreditAccount,
  getDebtors,
  getCustomerCreditAccount,
  getDebtorsForExport,
  getPendingCharges,
  sendPaymentReminder
} = require('../models/creditsModel');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const { getPeruDateString } = require('../utils/dateUtils');

/**
 * Formatea una fecha de la BD a texto legible "YYYY-MM-DD HH:mm" (hora local del servidor/BD)
 */
const formatFechaExcel = (date) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const TIPO_MOVIMIENTO_LABEL = {
  CARGO: 'Cargo',
  ABONO: 'Abono',
  SALDO_INICIAL: 'Saldo Inicial'
};

/**
 * Decodificar token JWT
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
 * GET /api/v1/credits/account - API-021
 * Obtener estado de cuenta del cliente autenticado
 * Roles permitidos: CLIENTE
 */
const getAccount = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar que es rol CLIENTE (case-insensitive)
    if (decoded.role_name?.toLowerCase() !== 'cliente') {
      return res.status(403).json({ success: false, error: 'Solo clientes pueden acceder a su estado de cuenta' });
    }

    const { page, pageSize } = req.query;

    const result = await getClientCreditAccount(decoded.id, {
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20
    });

    // Response segun diseno API-021
    res.json({
      success: true,
      currentBalance: result.currentBalance,
      movements: result.movements,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error obteniendo estado de cuenta:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/credits/debtors - API-022
 * Listar clientes con deuda
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const listDebtors = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a esta informacion' });
    }

    const { page, pageSize, branchId, hasOverdue, search } = req.query;

    const result = await getDebtors({
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      branchId: branchId ? parseInt(branchId) : (decoded.role_name?.toLowerCase() !== 'superadministrador' ? decoded.branch_id : null),
      hasOverdue,
      search
    });

    // Response segun diseno API-022
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      summary: result.summary
    });

  } catch (error) {
    console.error('Error listando deudores:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/credits/customers/:customerId - API-023
 * Obtener cuenta de cliente especifico
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const getCustomerAccount = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a esta informacion' });
    }

    const { customerId } = req.params;
    const { page, pageSize } = req.query;

    if (!customerId || isNaN(parseInt(customerId))) {
      return res.status(400).json({ success: false, error: 'customerId invalido' });
    }

    const result = await getCustomerCreditAccount(parseInt(customerId), {
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20
    });

    // Response segun diseno API-023
    res.json({
      success: true,
      customer: result.customer,
      currentBalance: result.currentBalance,
      movements: result.movements,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error obteniendo cuenta de cliente:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/credits/debtors/export
 * Exportar a Excel los créditos de los clientes con deuda y su detalle de movimientos
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const exportDebtors = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para exportar esta informacion' });
    }

    const { branchId, search, customerId, dateFrom, dateTo } = req.query;
    // Superadmin puede ver todas las sedes; los demás quedan restringidos a la suya
    const resolvedBranchId = branchId
      ? parseInt(branchId)
      : (decoded.role_name?.toLowerCase() !== 'superadministrador' ? decoded.branch_id : null);

    // Validar formato de las fechas del rango (YYYY-MM-DD)
    const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (dateFrom && !isValidDate(dateFrom)) {
      return res.status(400).json({ success: false, error: 'dateFrom debe tener formato YYYY-MM-DD' });
    }
    if (dateTo && !isValidDate(dateTo)) {
      return res.status(400).json({ success: false, error: 'dateTo debe tener formato YYYY-MM-DD' });
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom no puede ser posterior a dateTo' });
    }

    if (customerId && isNaN(parseInt(customerId))) {
      return res.status(400).json({ success: false, error: 'customerId invalido' });
    }

    const { debtors, movements } = await getDebtorsForExport({
      branchId: resolvedBranchId,
      search,
      customerId: customerId ? parseInt(customerId) : null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null
    });

    // Hoja 1: Resumen de clientes con deuda
    const resumenRows = debtors.map(d => ({
      'Cliente': d.customerName,
      'Teléfono': d.phone || '',
      'Días de crédito': d.creditDays,
      'N° movimientos': d.movementCount,
      'Cargos vencidos': d.overdueCharges,
      'Último abono': formatFechaExcel(d.lastPaymentDate),
      'Saldo pendiente (S/)': d.totalDebt
    }));

    // Fila de totales al final del resumen
    const totalDeuda = debtors.reduce((acc, d) => acc + d.totalDebt, 0);
    resumenRows.push({
      'Cliente': 'TOTAL',
      'Teléfono': '',
      'Días de crédito': '',
      'N° movimientos': '',
      'Cargos vencidos': '',
      'Último abono': '',
      'Saldo pendiente (S/)': totalDeuda
    });

    // Hoja 2: Detalle de movimientos (cargos y abonos) por cliente
    const detalleRows = movements.map(m => ({
      'Cliente': m.customerName,
      'Fecha': formatFechaExcel(m.fechaMovimiento),
      'Tipo': TIPO_MOVIMIENTO_LABEL[m.tipo] || m.tipo,
      'Referencia': m.referencia,
      'Cargo (S/)': m.tipo === 'ABONO' ? '' : m.monto,
      'Abono (S/)': m.tipo === 'ABONO' ? m.monto : '',
      'Saldo (S/)': m.saldo,
      'Vencimiento': formatFechaExcel(m.fechaVencimiento),
      'Vencido': m.tipo === 'CARGO' && m.esVencido ? 'SÍ' : '',
      'Notas': m.notas || ''
    }));

    const wb = XLSX.utils.book_new();

    const wsResumen = XLSX.utils.json_to_sheet(resumenRows.length > 0 ? resumenRows : [{ 'Cliente': 'Sin clientes con deuda' }]);
    wsResumen['!cols'] = [
      { wch: 30 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 18 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const filasDetalle = detalleRows.length > 0 ? detalleRows : [{ 'Cliente': 'Sin movimientos en el periodo seleccionado' }];
    let wsDetalle;

    if (dateFrom || dateTo) {
      // Con rango de fechas: se antepone una fila con el periodo aplicado
      const periodo = dateFrom && dateTo
        ? `Movimientos del ${dateFrom} al ${dateTo}`
        : (dateFrom ? `Movimientos desde el ${dateFrom}` : `Movimientos hasta el ${dateTo}`);
      wsDetalle = XLSX.utils.aoa_to_sheet([[periodo]]);
      XLSX.utils.sheet_add_json(wsDetalle, filasDetalle, { origin: 'A3' });
    } else {
      wsDetalle = XLSX.utils.json_to_sheet(filasDetalle);
    }

    wsDetalle['!cols'] = [
      { wch: 30 }, { wch: 18 }, { wch: 13 }, { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 9 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle de Movimientos');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Nombre de archivo: identifica cliente y/o periodo exportado
    const sufijoCliente = customerId && debtors.length > 0
      ? `_${debtors[0].customerName.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 30)}`
      : '';
    const sufijoRango = dateFrom || dateTo
      ? `_${dateFrom || 'inicio'}_a_${dateTo || 'hoy'}`
      : `_${getPeruDateString()}`;
    const filename = `creditos_clientes${sufijoCliente}${sufijoRango}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);

  } catch (error) {
    console.error('Error exportando créditos:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor al exportar créditos' });
  }
};

/**
 * GET /api/v1/credits/customers/:customerId/pending-charges
 * Cargos con saldo pendiente de un cliente, del mas antiguo al mas reciente.
 * Alimenta la seleccion de cuentas a cancelar al registrar un pago.
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const listPendingCharges = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a esta informacion' });
    }

    const { customerId } = req.params;
    if (!customerId || isNaN(parseInt(customerId))) {
      return res.status(400).json({ success: false, error: 'customerId invalido' });
    }

    const charges = await getPendingCharges(parseInt(customerId));
    const totalPending = charges.reduce((acc, c) => acc + c.montoPendiente, 0);

    res.json({
      success: true,
      data: charges,
      totalPending: Math.round(totalPending * 100) / 100
    });

  } catch (error) {
    console.error('Error obteniendo cargos pendientes:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/credits/customers/:customerId/reminder - API-024
 * Enviar recordatorio de pago
 * Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const sendReminder = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para enviar recordatorios' });
    }

    const { customerId } = req.params;
    const { message } = req.body;

    if (!customerId || isNaN(parseInt(customerId))) {
      return res.status(400).json({ success: false, error: 'customerId invalido' });
    }

    const result = await sendPaymentReminder(parseInt(customerId), message, decoded.id);

    // Response segun diseno API-024
    res.json({
      success: result.success,
      announcementId: result.announcementId
    });

  } catch (error) {
    console.error('Error enviando recordatorio:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('deuda')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  getAccount,
  listDebtors,
  getCustomerAccount,
  exportDebtors,
  listPendingCharges,
  sendReminder
};
