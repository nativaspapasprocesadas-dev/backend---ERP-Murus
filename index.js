/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                         BACKEND ERP PAPAS - ERIKA                            ║
 * ║                                                                              ║
 * ║  Sistema de gestión para distribución de papas                               ║
 * ║                                                                              ║
 * ║  🏠 DESARROLLO LOCAL:                                                        ║
 * ║     - Puerto: 4020                                                            ║
 * ║     - Base de datos: db_ERP_murus (PostgreSQL local)                         ║
 * ║     - Comando: npm run dev                                                    ║
 * ║                                                                              ║
 * ║  🚀 PRODUCCIÓN (Railway):                                                    ║
 * ║     - Puerto: Asignado por Railway                                            ║
 * ║     - Base de datos: PostgreSQL Railway                                       ║
 * ║     - Comando: npm run start                                                  ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
require('dotenv').config();
const pool = require('./config/db');
const socketManager = require('./socket/socketManager');

// ============================================================================
// INFORMACIÓN DE VERSIÓN
// ============================================================================
const CODE_VERSION = 'v2.3-LOCAL-RAILWAY-HYBRID';
const BUILD_DATE = '2026-01-31';

// ============================================================================
// DETECCIÓN DE ENTORNO
// ============================================================================
const isProduction = process.env.NODE_ENV === 'production';
const ENV_NAME = isProduction ? '🚀 PRODUCCIÓN (Railway)' : '🏠 DESARROLLO LOCAL';
const ENV_DB = isProduction ? 'PostgreSQL Railway' : 'db_ERP_murus (Local)';

// ============================================================================
// BANNER DE INICIO
// ============================================================================
console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║                    BACKEND ERP PAPAS                         ║');
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log(`║  Versión: ${CODE_VERSION.padEnd(48)}║`);
console.log(`║  Fecha:   ${BUILD_DATE.padEnd(48)}║`);
console.log('╠══════════════════════════════════════════════════════════════╣');
console.log(`║  Entorno: ${ENV_NAME.padEnd(48)}║`);
console.log(`║  Base de datos: ${ENV_DB.padEnd(42)}║`);
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

// ============================================================================
// IMPORTAR RUTAS
// ============================================================================
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const announcementsRoutes = require('./routes/announcementsRoutes');
const ordersRoutes = require('./routes/ordersRoutes');
const customersRoutes = require('./routes/customersRoutes');
const driversRoutes = require('./routes/driversRoutes');
const branchesRoutes = require('./routes/branchesRoutes');
const profileRoutes = require('./routes/profileRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const usersRoutes = require('./routes/usersRoutes');
const measuresRoutes = require('./routes/measuresRoutes');
const presentationsRoutes = require('./routes/presentationsRoutes');
const productsRoutes = require('./routes/productsRoutes');
const routesRoutes = require('./routes/routesRoutes');
const productionRoutes = require('./routes/productionRoutes');
const speciesRoutes = require('./routes/speciesRoutes');
const creditsRoutes = require('./routes/creditsRoutes');
const paymentsRoutes = require('./routes/paymentsRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const configRoutes = require('./routes/configRoutes');
const commentsRoutes = require('./routes/commentsRoutes');
const configurationRoutes = require('./routes/configurationRoutes');

// ============================================================================
// CONFIGURAR EXPRESS
// ============================================================================
const app = express();
const PORT = process.env.PORT || 4020;

// ============================================================================
// MIDDLEWARES
// ============================================================================
// C6: CORS configurable via env var CORS_ORIGINS (default: todo permitido)
const corsOptions = process.env.CORS_ORIGINS
  ? { origin: process.env.CORS_ORIGINS.split(',').map(s => s.trim()) }
  : undefined;
app.use(cors(corsOptions));
app.use(express.json());

// Servir archivos estáticos (uploads)
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================================
// RUTAS API v1
// ============================================================================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/announcements', announcementsRoutes);
app.use('/api/v1/orders', ordersRoutes);
app.use('/api/v1/customers', customersRoutes);
app.use('/api/v1/drivers', driversRoutes);
app.use('/api/v1/branches', branchesRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/measures', measuresRoutes);
app.use('/api/v1/presentations', presentationsRoutes);
app.use('/api/v1/products', productsRoutes);
app.use('/api/v1/routes', routesRoutes);
app.use('/api/v1/production', productionRoutes);
app.use('/api/v1/species', speciesRoutes);
app.use('/api/v1/credits', creditsRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/catalog', catalogRoutes);
app.use('/api/v1/config', configRoutes);
app.use('/api/v1/comments', commentsRoutes);
app.use('/api/v1/configurations', configurationRoutes);

// ============================================================================
// RUTAS DE UTILIDAD
// ============================================================================

/**
 * GET /api/ping
 * Verifica la conexión a la base de datos
 */
app.get('/api/ping', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as time, current_database() as database');
    res.json({
      status: 'ok',
      environment: isProduction ? 'production' : 'development',
      database: result.rows[0].database,
      time: result.rows[0].time,
      message: isProduction
        ? '🚀 Conectado a Railway PostgreSQL'
        : '🏠 Conectado a PostgreSQL Local (db_ERP_murus)'
    });
  } catch (err) {
    console.error('[API] Error en ping:', err.message);
    res.status(500).json({
      status: 'error',
      environment: isProduction ? 'production' : 'development',
      error: err.message
    });
  }
});

/**
 * GET /api/health
 * Endpoint de health check para Railway
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: CODE_VERSION,
    environment: isProduction ? 'production' : 'development',
    uptime: process.uptime()
  });
});

/**
 * GET /api/diagnostic/orphan-charges
 * Detecta CARGOs activos vinculados a pedidos cancelados (datos corruptos)
 */
app.get('/api/diagnostic/orphan-charges', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        mc.id AS movimiento_id,
        mc.pedido_id,
        mc.customer_id,
        mc.monto,
        mc.status AS status_movimiento,
        mc.descripcion,
        mc.fecha_movimiento,
        p.numero_pedido,
        p.estado AS estado_pedido,
        p.total AS total_pedido,
        u.name AS cliente_nombre
      FROM movimientos_credito mc
      JOIN pedidos p ON mc.pedido_id = p.id
      LEFT JOIN customers c ON mc.customer_id = c.id
      LEFT JOIN users u ON c.user_id = u.id
      WHERE mc.tipo_movimiento = 'CARGO'
        AND mc.status = 'active'
        AND p.estado = 'cancelado'
      ORDER BY mc.customer_id, mc.id
    `);

    const totalMonto = result.rows.reduce((sum, r) => sum + parseFloat(r.monto), 0);
    const clientesAfectados = [...new Set(result.rows.map(r => r.customer_id))];

    res.json({
      encontrados: result.rows.length,
      totalMonto,
      clientesAfectados: clientesAfectados.length,
      detalle: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/diagnostic/fix-orphan-charges
 * Desactiva CARGOs huerfanos y re-sincroniza balances
 */
app.post('/api/diagnostic/fix-orphan-charges', async (req, res) => {
  const client = await pool.connect();
  try {
    // Detectar huerfanos
    const orphans = await client.query(`
      SELECT mc.id, mc.monto, mc.customer_id
      FROM movimientos_credito mc
      JOIN pedidos p ON mc.pedido_id = p.id
      WHERE mc.tipo_movimiento = 'CARGO'
        AND mc.status = 'active'
        AND p.estado = 'cancelado'
    `);

    if (orphans.rows.length === 0) {
      return res.json({ message: 'No hay cargos huerfanos. Todo limpio.', fixed: 0 });
    }

    await client.query('BEGIN');

    const movIds = orphans.rows.map(r => r.id);
    const customerIds = [...new Set(orphans.rows.map(r => r.customer_id))];

    // Desactivar cargos
    await client.query(`
      UPDATE movimientos_credito
      SET status = 'inactive',
          descripcion = descripcion || ' [CANCELADO - fix auto]',
          date_time_modification = NOW()
      WHERE id = ANY($1)
    `, [movIds]);

    // Re-sincronizar balances
    await client.query(`
      UPDATE customers c
      SET current_balance = (
        COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc
           WHERE mc.customer_id = c.id AND mc.tipo_movimiento IN ('CARGO', 'SALDO_INICIAL') AND mc.status = 'active'), 0
        ) - COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc
           WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
        )
      ),
      date_time_modification = NOW()
      WHERE c.id = ANY($1)
    `, [customerIds]);

    await client.query('COMMIT');

    res.json({
      message: 'Correccion aplicada exitosamente',
      cargosDesactivados: movIds.length,
      clientesCorregidos: customerIds.length,
      totalMontoCorregido: orphans.rows.reduce((sum, r) => sum + parseFloat(r.monto), 0)
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================================
// CREAR SERVIDOR HTTP + SOCKET.IO
// ============================================================================
const server = http.createServer(app);
socketManager.init(server);

// ============================================================================
// INICIAR SERVIDOR
// ============================================================================
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    ✅ SERVIDOR INICIADO                       ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Entorno: ${ENV_NAME.padEnd(48)}║`);
  console.log(`║  Puerto:  ${PORT.toString().padEnd(48)}║`);
  console.log(`║  API:     http://localhost:${PORT}/api/v1`.padEnd(63) + '║');
  console.log(`║  Socket:  WebSocket habilitado`.padEnd(63) + '║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  if (!isProduction) {
    console.log('║  🏠 MODO DESARROLLO - Base de datos: db_ERP_murus            ║');
    console.log('║  ⚠️  Los cambios NO afectan la versión en Railway            ║');
  } else {
    console.log('║  🚀 MODO PRODUCCIÓN - Railway                                ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});
