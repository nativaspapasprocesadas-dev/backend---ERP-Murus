const express = require('express');
const router = express.Router();
const {
  login,
  logout,
  verifySession,
  refreshToken
} = require('../controllers/authController');

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/logout
router.post('/logout', logout);

// GET /api/v1/auth/verify (legacy)
router.get('/verify', verifySession);

// GET /api/v1/auth/me - API-003 segun diseno
router.get('/me', verifySession);

// POST /api/auth/refresh
router.post('/refresh', refreshToken);

module.exports = router;
