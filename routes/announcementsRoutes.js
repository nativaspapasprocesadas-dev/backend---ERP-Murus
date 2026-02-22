/**
 * Announcements Routes - API-005, API-027, API-028, API-029, API-030, API-031
 * Segun diseno en 04_apis_lista.md lineas 246-300, 1819-2062
 */
const express = require('express');
const router = express.Router();
const {
  getUnread,
  markAsRead,
  list,
  create,
  update,
  remove
} = require('../controllers/announcementsController');
const { uploadComunicationImage, handleMulterError } = require('../middleware/uploadMiddleware');

// GET /api/v1/announcements/unread - API-005
// (debe ir antes de /:id para evitar conflictos)
router.get('/unread', getUnread);

// GET /api/v1/announcements - API-027
router.get('/', list);

// POST /api/v1/announcements - API-028 (con soporte para imagen)
router.post('/', uploadComunicationImage, handleMulterError, create);

// PUT /api/v1/announcements/:id - API-029 (con soporte para imagen)
router.put('/:id', uploadComunicationImage, handleMulterError, update);

// DELETE /api/v1/announcements/:id - API-030
router.delete('/:id', remove);

// POST /api/v1/announcements/:id/read - API-031
router.post('/:id/read', markAsRead);

module.exports = router;
