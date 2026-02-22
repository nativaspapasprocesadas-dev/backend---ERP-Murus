/**
 * Orders Routes - API-006 a API-013 + Vouchers
 * Segun diseno en 04_apis_lista.md
 */
const express = require('express');
const router = express.Router();
const {
  list,
  stats,
  getById,
  create,
  update,
  cancel,
  assignToRoute,
  deliver,
  uploadVoucherFile,
  approvePayment
} = require('../controllers/ordersController');
const { uploadVoucher, handleMulterError } = require('../middleware/uploadMiddleware');
const { verificarToken, checkRole } = require('../middleware/authMiddleware');

// GET /api/v1/orders/stats - API-007 (debe ir antes de :id)
router.get('/stats', stats);

// GET /api/v1/orders - API-006
router.get('/', list);

// GET /api/v1/orders/:id - API-008
router.get('/:id', getById);

// POST /api/v1/orders - API-009
router.post('/', create);

// PUT /api/v1/orders/:id - API-010
router.put('/:id', update);

// POST /api/v1/orders/:id/cancel - API-011
router.post('/:id/cancel', cancel);

// POST /api/v1/orders/:id/assign-route - API-012
router.post('/:id/assign-route', assignToRoute);

// POST /api/v1/orders/:id/deliver - API-013
router.post('/:id/deliver', deliver);

// POST /api/v1/orders/:id/voucher - Subir voucher de pago (requiere autenticacion)
router.post('/:id/voucher', verificarToken, uploadVoucher, handleMulterError, uploadVoucherFile);

// PATCH /api/v1/orders/:id/approve-payment - Aprobar/rechazar pago (solo ADMIN y SUPERADMIN)
router.patch('/:id/approve-payment', verificarToken, checkRole(['ADMINISTRADOR', 'SUPERADMINISTRADOR']), approvePayment);

module.exports = router;
