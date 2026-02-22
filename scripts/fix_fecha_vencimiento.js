/**
 * Script para actualizar fecha_vencimiento en movimientos de crédito existentes
 * Ejecutar con: node scripts/fix_fecha_vencimiento.js
 */

require('dotenv').config();
const pool = require('../config/db');

async function fixFechaVencimiento() {
  console.log('='.repeat(50));
  console.log('Actualizando fecha_vencimiento en movimientos de crédito...');
  console.log('='.repeat(50));

  try {
    // Verificar cuántos registros necesitan actualización
    const checkQuery = `
      SELECT COUNT(*) as total
      FROM movimientos_credito mc
      WHERE mc.tipo_movimiento = 'CARGO'
        AND mc.status = 'active'
        AND mc.fecha_vencimiento IS NULL
    `;
    const checkResult = await pool.query(checkQuery);
    const totalToUpdate = parseInt(checkResult.rows[0].total);

    console.log(`Registros a actualizar: ${totalToUpdate}`);

    if (totalToUpdate === 0) {
      console.log('No hay registros que actualizar.');
      process.exit(0);
    }

    // Actualizar los registros
    const updateQuery = `
      UPDATE movimientos_credito mc
      SET fecha_vencimiento = mc.fecha_movimiento + INTERVAL '1 day' * COALESCE(c.credit_days, 30)
      FROM customers c
      WHERE mc.customer_id = c.id
        AND mc.tipo_movimiento = 'CARGO'
        AND mc.status = 'active'
        AND mc.fecha_vencimiento IS NULL
      RETURNING mc.id, mc.customer_id, mc.fecha_movimiento, mc.fecha_vencimiento
    `;
    const updateResult = await pool.query(updateQuery);

    console.log(`\nRegistros actualizados: ${updateResult.rowCount}`);
    console.log('\nDetalle:');
    updateResult.rows.forEach(row => {
      console.log(`  - ID ${row.id}: Cliente ${row.customer_id} | Vence: ${row.fecha_vencimiento}`);
    });

    console.log('\n' + '='.repeat(50));
    console.log('Actualización completada exitosamente.');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('Error al actualizar:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixFechaVencimiento();
