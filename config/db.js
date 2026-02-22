/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    CONFIGURACIÓN DE BASE DE DATOS                            ║
 * ║                                                                              ║
 * ║  Este módulo maneja la conexión a PostgreSQL de forma híbrida:               ║
 * ║                                                                              ║
 * ║  🏠 DESARROLLO LOCAL:                                                        ║
 * ║     - Usa DATABASE_URL o variables individuales (DB_HOST, DB_USER, etc.)     ║
 * ║     - Base de datos: db_ERP_murus                                            ║
 * ║     - Sin SSL                                                                 ║
 * ║                                                                              ║
 * ║  🚀 PRODUCCIÓN (Railway):                                                    ║
 * ║     - Usa DATABASE_URL proporcionada por Railway                              ║
 * ║     - SSL habilitado                                                          ║
 * ║                                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

const { Pool } = require('pg');
require('dotenv').config();

// ============================================================================
// DETECCIÓN DE ENTORNO
// ============================================================================
const isProduction = process.env.NODE_ENV === 'production';
const ENV_LABEL = isProduction ? '🚀 PRODUCCIÓN (Railway)' : '🏠 DESARROLLO LOCAL';

// ============================================================================
// CONFIGURACIÓN DEL POOL DE CONEXIONES
// ============================================================================
let poolConfig;

if (process.env.DATABASE_URL) {
  // -------------------------------------------------------------------------
  // Usar DATABASE_URL (Railway o configuración unificada)
  // En producción: Railway proporciona esta URL automáticamente
  // En desarrollo: Se puede definir en .env para mayor comodidad
  // -------------------------------------------------------------------------
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    // SSL solo en producción (Railway lo requiere)
    ssl: isProduction ? { rejectUnauthorized: false } : false,
    timezone: 'America/Lima'
  };

  console.log(`[DB] ${ENV_LABEL} - Usando DATABASE_URL`);

} else {
  // -------------------------------------------------------------------------
  // Usar variables individuales (desarrollo local tradicional)
  // 🏠 Conexión a PostgreSQL LOCAL (db_ERP_murus)
  // -------------------------------------------------------------------------
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'db_ERP_murus',
    port: parseInt(process.env.DB_PORT) || 5432,
    timezone: 'America/Lima'
  };

  console.log(`[DB] ${ENV_LABEL} - Usando variables individuales`);
  console.log(`[DB] Host: ${poolConfig.host}:${poolConfig.port}`);
  console.log(`[DB] Database: ${poolConfig.database}`);
}

// ============================================================================
// CREAR POOL DE CONEXIONES
// ============================================================================
const pool = new Pool(poolConfig);

// ============================================================================
// EVENTOS DEL POOL
// ============================================================================

/**
 * Evento: Nueva conexión establecida
 * Configura la zona horaria para que NOW(), CURRENT_DATE, etc. usen hora de Perú
 */
pool.on('connect', (client) => {
  client.query("SET timezone = 'America/Lima'");
  if (!isProduction) {
    // Solo mostrar en desarrollo para no saturar logs de producción
    console.log('[DB] Nueva conexión establecida - Timezone: America/Lima');
  }
});

/**
 * Evento: Error en el pool
 * Maneja errores inesperados en las conexiones
 */
pool.on('error', (err) => {
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error('║  ❌ ERROR EN POOL DE CONEXIONES PostgreSQL                   ║');
  console.error('╚══════════════════════════════════════════════════════════════╝');
  console.error(`[DB] Error: ${err.message}`);

  if (!isProduction) {
    // En desarrollo, mostrar más detalles
    console.error('[DB] Stack:', err.stack);
  }
});

// ============================================================================
// LOG DE CONFIGURACIÓN INICIAL
// ============================================================================
console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log(`║  📦 Base de Datos PostgreSQL                                 ║`);
console.log(`║  ${ENV_LABEL.padEnd(57)}║`);
if (!isProduction) {
  console.log(`║  🏠 Base de datos local: db_ERP_murus                        ║`);
}
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

module.exports = pool;
