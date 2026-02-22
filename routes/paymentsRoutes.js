/**
 * Payments Routes - API-025, API-026
 * Segun diseno en 04_apis_lista.md lineas 1665-1813
 */
const express = require('express');
const router = express.Router();
const {
  create,
  list
} = require('../controllers/paymentsController');

// GET /api/v1/payments - API-026
// Listar historial de pagos
router.get('/', list);

// POST /api/v1/payments - API-025
// Registrar pago de cliente
router.post('/', create);

module.exports = router;
