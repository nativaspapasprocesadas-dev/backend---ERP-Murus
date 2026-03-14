/**
 * Reports Controller - API-061 a API-066
 * Segun diseno en 04_apis_lista.md
 */
const {
  getReportsSummary,
  getDailySalesReport,
  getRoutesReport,
  getKilosBySpeciesReport,
  getCustomersReport,
  getCustomersExportData
} = require('../models/reportsModel');
const jwt = require('jsonwebtoken');
const { getPeruDateString } = require('../utils/dateUtils');

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
 * Validar roles permitidos (case-insensitive)
 */
const checkRoles = (decoded, allowedRoles) => {
  if (!decoded || !decoded.role_name) return false;
  const userRole = decoded.role_name.toLowerCase();
  const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());
  return normalizedAllowedRoles.includes(userRole);
};

/**
 * GET /api/v1/reports/summary - API-061
 * Obtener resumen de reportes
 */
const getSummary = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { dateFrom, dateTo, branchId } = req.query;

    const result = await getReportsSummary({
      dateFrom,
      dateTo,
      branchId: branchId ? parseInt(branchId) : (decoded.role_name?.toLowerCase() !== 'superadministrador' ? decoded.branch_id : null)
    });

    // Response segun diseno API-061
    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error obteniendo resumen de reportes:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/reports/daily-sales - API-062
 * Reporte de ventas diarias
 */
const getDailySales = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { dateFrom, dateTo, branchId } = req.query;

    // Validaciones segun diseno API-062 - fechas obligatorias
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom y dateTo son obligatorios' });
    }

    // Validar que dateFrom <= dateTo
    if (new Date(dateFrom) > new Date(dateTo)) {
      return res.status(400).json({ success: false, error: 'dateFrom debe ser menor o igual a dateTo' });
    }

    // Validar rango maximo de 90 dias
    const diffTime = Math.abs(new Date(dateTo) - new Date(dateFrom));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays > 90) {
      return res.status(400).json({ success: false, error: 'El rango maximo es de 90 dias' });
    }

    const result = await getDailySalesReport({
      dateFrom,
      dateTo,
      branchId: branchId ? parseInt(branchId) : (decoded.role_name?.toLowerCase() !== 'superadministrador' ? decoded.branch_id : null)
    });

    // Response segun diseno API-062
    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error obteniendo reporte de ventas diarias:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/reports/routes - API-063
 * Reporte de rutas (acepta rango de fechas)
 * Query params: dateFrom, dateTo, branchId
 */
const getRoutes = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { dateFrom, dateTo, branchId } = req.query;

    // Validar rango de fechas si ambas fueron proporcionadas
    if (dateFrom && dateTo) {
      if (new Date(dateFrom) > new Date(dateTo)) {
        return res.status(400).json({ success: false, error: 'dateFrom debe ser menor o igual a dateTo' });
      }
      const diffTime = Math.abs(new Date(dateTo) - new Date(dateFrom));
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 365) {
        return res.status(400).json({ success: false, error: 'El rango maximo es de 365 dias' });
      }
    }

    const result = await getRoutesReport({
      dateFrom,
      dateTo,
      branchId: branchId ? parseInt(branchId) : (decoded.role_name?.toLowerCase() !== 'superadministrador' ? decoded.branch_id : null)
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error obteniendo reporte de rutas:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/reports/kilos-by-species - API-064
 * Reporte de kilos por especie
 */
const getKilosBySpecies = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { dateFrom, dateTo, speciesId, branchId, groupByDate } = req.query;

    // Validaciones segun diseno API-064 - fechas obligatorias
    if (!dateFrom || !dateTo) {
      return res.status(400).json({ success: false, error: 'dateFrom y dateTo son obligatorios' });
    }

    // Validar que dateFrom <= dateTo
    if (new Date(dateFrom) > new Date(dateTo)) {
      return res.status(400).json({ success: false, error: 'dateFrom debe ser menor o igual a dateTo' });
    }

    const result = await getKilosBySpeciesReport({
      dateFrom,
      dateTo,
      speciesId: speciesId ? parseInt(speciesId) : null,
      branchId: branchId ? parseInt(branchId) : (decoded.role_name?.toLowerCase() !== 'superadministrador' ? decoded.branch_id : null),
      groupByDate: groupByDate === 'true' || groupByDate === true
    });

    // Response segun diseno API-064
    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error obteniendo reporte de kilos por especie:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/reports/customers - API-065
 * Reporte de clientes
 */
const getCustomers = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { branchId, hasDebt, customerType, page, pageSize } = req.query;

    const result = await getCustomersReport({
      branchId: branchId ? parseInt(branchId) : (decoded.role_name?.toLowerCase() !== 'superadministrador' ? decoded.branch_id : null),
      hasDebt,
      customerType,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20
    });

    // Response segun diseno API-065
    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error obteniendo reporte de clientes:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * GET /api/v1/reports/customers/export - API-066
 * Exportar reporte de clientes
 */
const exportCustomers = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Roles permitidos: SUPERADMINISTRADOR, ADMINISTRADOR
    if (!checkRoles(decoded, ['SUPERADMINISTRADOR', 'ADMINISTRADOR'])) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para acceder a este recurso' });
    }

    const { format = 'xlsx', branchId } = req.query;

    const data = await getCustomersExportData({
      branchId: branchId ? parseInt(branchId) : (decoded.role_name?.toLowerCase() !== 'superadministrador' ? decoded.branch_id : null),
      format
    });

    if (format === 'csv') {
      // Generar CSV
      const headers = ['ID', 'Nombre', 'Email', 'Direccion', 'Telefono', 'Saldo Actual', 'Dias Credito', 'Pedidos Completados', 'Total Compras'];
      const csvContent = [
        headers.join(','),
        ...data.map(row => [
          row.id,
          `"${(row.nombre || '').replace(/"/g, '""')}"`,
          `"${(row.email || '').replace(/"/g, '""')}"`,
          `"${(row.direccion || '').replace(/"/g, '""')}"`,
          `"${(row.telefono || '').replace(/"/g, '""')}"`,
          row.saldo_actual,
          row.dias_credito,
          row.pedidos_completados,
          row.total_compras
        ].join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=reporte_clientes.csv');
      return res.send('\uFEFF' + csvContent); // BOM para Excel
    }

    // Para xlsx, devolvemos JSON con los datos (el frontend puede usar xlsx library)
    // En produccion se usaria una libreria como exceljs
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte_clientes.json');
    res.json({
      success: true,
      format: 'json', // Nota: xlsx requiere libreria adicional
      data,
      headers: ['id', 'nombre', 'email', 'direccion', 'telefono', 'saldo_actual', 'dias_credito', 'pedidos_completados', 'total_compras']
    });

  } catch (error) {
    console.error('Error exportando reporte de clientes:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  getSummary,
  getDailySales,
  getRoutes,
  getKilosBySpecies,
  getCustomers,
  exportCustomers
};
