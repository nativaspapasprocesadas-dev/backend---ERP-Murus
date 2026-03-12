/**
 * Script para desactivar cargos huerfanos de pedidos cancelados
 * y re-sincronizar current_balance de clientes afectados.
 *
 * Problema: al cancelar un pedido, el CARGO en movimientos_credito
 * quedaba activo, inflando la deuda reportada del cliente.
 *
 * Ejecutar: node scripts/fix-cancelled-order-charges.js
 */
const pool = require('../config/db');

async function fixCancelledOrderCharges() {
  console.log('=== FIX: Cargos huerfanos de pedidos cancelados ===\n');

  const client = await pool.connect();

  try {
    // 1. Detectar cargos activos vinculados a pedidos cancelados
    const orphanQuery = `
      SELECT
        mc.id AS movimiento_id,
        mc.pedido_id,
        mc.customer_id,
        mc.monto,
        p.numero_pedido,
        p.estado AS estado_pedido,
        u.name AS cliente
      FROM movimientos_credito mc
      JOIN pedidos p ON mc.pedido_id = p.id
      JOIN customers c ON mc.customer_id = c.id
      JOIN users u ON c.user_id = u.id
      WHERE mc.tipo_movimiento = 'CARGO'
        AND mc.status = 'active'
        AND p.estado = 'cancelado'
      ORDER BY mc.customer_id, mc.id
    `;

    const orphans = await client.query(orphanQuery);

    if (orphans.rows.length === 0) {
      console.log('No se encontraron cargos huerfanos. Todo limpio.\n');
      process.exit(0);
    }

    console.log(`Encontrados ${orphans.rows.length} cargos huerfanos:\n`);
    console.log('─'.repeat(90));
    console.log(
      'Mov ID'.padEnd(10),
      'Pedido'.padEnd(20),
      'Cliente'.padEnd(25),
      'Monto'.padStart(15),
      'Estado Pedido'.padStart(16)
    );
    console.log('─'.repeat(90));

    let totalMonto = 0;
    const clientesAfectados = new Set();

    for (const row of orphans.rows) {
      const monto = parseFloat(row.monto);
      totalMonto += monto;
      clientesAfectados.add(row.customer_id);
      console.log(
        String(row.movimiento_id).padEnd(10),
        (row.numero_pedido || `#${row.pedido_id}`).padEnd(20),
        row.cliente.substring(0, 23).padEnd(25),
        `S/. ${monto.toFixed(2)}`.padStart(15),
        row.estado_pedido.padStart(16)
      );
    }

    console.log('─'.repeat(90));
    console.log(`\nTotal a corregir: S/. ${totalMonto.toFixed(2)}`);
    console.log(`Clientes afectados: ${clientesAfectados.size}\n`);

    // 2. Aplicar correccion dentro de transaccion
    await client.query('BEGIN');

    const movimientoIds = orphans.rows.map(r => r.movimiento_id);

    // Desactivar los cargos huerfanos
    const deactivateResult = await client.query(`
      UPDATE movimientos_credito
      SET status = 'inactive',
          descripcion = descripcion || ' [CANCELADO - fix migracion]',
          date_time_modification = NOW()
      WHERE id = ANY($1)
    `, [movimientoIds]);

    console.log(`Cargos desactivados: ${deactivateResult.rowCount}`);

    // 3. Re-sincronizar balances de clientes afectados
    const customerIds = Array.from(clientesAfectados);

    const syncResult = await client.query(`
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

    console.log(`Balances re-sincronizados: ${syncResult.rowCount}`);

    await client.query('COMMIT');

    // 4. Mostrar estado final de clientes corregidos
    const afterQuery = `
      SELECT
        c.id,
        u.name AS cliente,
        c.current_balance AS balance
      FROM customers c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ANY($1)
      ORDER BY u.name
    `;
    const afterResult = await client.query(afterQuery, [customerIds]);

    console.log('\nBalances corregidos:');
    console.log('─'.repeat(50));
    for (const row of afterResult.rows) {
      console.log(
        row.cliente.substring(0, 28).padEnd(30),
        `S/. ${parseFloat(row.balance).toFixed(2)}`.padStart(15)
      );
    }
    console.log('─'.repeat(50));
    console.log('\nCorreccion completada exitosamente.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error durante la correccion:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

fixCancelledOrderCharges();
