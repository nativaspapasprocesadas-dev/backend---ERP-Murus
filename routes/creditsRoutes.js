/**
 * Credits Routes - API-021, API-022, API-023, API-024
 * Segun diseno en 04_apis_lista.md lineas 1393-1659
 */
const express = require('express');
const router = express.Router();
const {
  getAccount,
  listDebtors,
  getCustomerAccount,
  sendReminder
} = require('../controllers/creditsController');

// GET /api/v1/credits/account - API-021
// Estado de cuenta del cliente autenticado
router.get('/account', getAccount);

// GET /api/v1/credits/debtors - API-022
// Listar clientes con deuda
router.get('/debtors', listDebtors);

// GET /api/v1/credits/customers/:customerId - API-023
// Cuenta de cliente especifico
router.get('/customers/:customerId', getCustomerAccount);

// POST /api/v1/credits/customers/:customerId/reminder - API-024
// Enviar recordatorio de pago
router.post('/customers/:customerId/reminder', sendReminder);

module.exports = router;
