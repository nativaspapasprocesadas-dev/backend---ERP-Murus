/**
 * Reports Routes - API-061 a API-066
 * Segun diseno en 04_apis_lista.md
 */
const express = require('express');
const router = express.Router();
const {
  getSummary,
  getDailySales,
  getRoutes,
  getKilosBySpecies,
  getCustomers,
  exportCustomers
} = require('../controllers/reportsController');

// GET /api/v1/reports/summary - API-061
router.get('/summary', getSummary);

// GET /api/v1/reports/daily-sales - API-062
router.get('/daily-sales', getDailySales);

// GET /api/v1/reports/routes - API-063
router.get('/routes', getRoutes);

// GET /api/v1/reports/kilos-by-species - API-064
router.get('/kilos-by-species', getKilosBySpecies);

// GET /api/v1/reports/customers/export - API-066 (debe ir antes de /customers para evitar conflicto con :id)
router.get('/customers/export', exportCustomers);

// GET /api/v1/reports/customers - API-065
router.get('/customers', getCustomers);

module.exports = router;
