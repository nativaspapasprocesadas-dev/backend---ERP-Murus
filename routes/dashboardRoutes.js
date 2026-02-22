/**
 * Dashboard Routes - API-004
 * Segun diseno en 04_apis_lista.md linea 183
 */
const express = require('express');
const router = express.Router();
const { getStats } = require('../controllers/dashboardController');

// GET /api/v1/dashboard/stats - API-004
router.get('/stats', getStats);

module.exports = router;
