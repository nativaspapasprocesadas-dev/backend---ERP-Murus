/**
 * Dashboard Controller - API-004
 * Segun diseno en 04_apis_lista.md linea 183
 */
const { getDashboardStats } = require('../models/dashboardModel');
const jwt = require('jsonwebtoken');

/**
 * GET /api/v1/dashboard/stats
 * Obtener estadisticas del dashboard
 */
const getStats = async (req, res) => {
  try {
    // Obtener token y decodificar usuario
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Token invalido o expirado'
      });
    }

    // Obtener parametros de query
    const { branchId } = req.query;

    // Obtener estadisticas segun rol
    const stats = await getDashboardStats({
      branchId: branchId ? parseInt(branchId) : decoded.branch_id,
      userId: decoded.id,
      roleName: decoded.role_name
    });

    // Response segun diseno API-004
    res.json({
      success: true,
      totalPedidosHoy: stats.totalPedidosHoy,
      totalVentasHoy: stats.totalVentasHoy,
      pedidosPendientes: stats.pedidosPendientes,
      clientesConDeuda: stats.clientesConDeuda,
      alertasCredito: stats.alertasCredito
    });

  } catch (error) {
    console.error('Error obteniendo estadisticas dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

module.exports = {
  getStats
};
