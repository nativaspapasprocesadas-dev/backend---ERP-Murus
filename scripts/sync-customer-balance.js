/**
 * Script para sincronizar current_balance con la deuda real calculada
 * Ejecutar: node scripts/sync-customer-balance.js
 */
const pool = require('../config/db');

async function syncCustomerBalances() {
  console.log('Iniciando sincronización de balances de clientes...\n');

  try {
    // Primero mostrar el estado actual
    const beforeQuery = `
      SELECT
        c.id,
        u.name as cliente,
        c.current_balance as balance_actual,
        COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'CARGO' AND mc.status = 'active'), 0
        ) - COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
        ) as deuda_real
      FROM customers c
      JOIN users u ON c.user_id = u.id
      WHERE c.status = 'active'
      ORDER BY u.name
    `;

    const beforeResult = await pool.query(beforeQuery);

    console.log('Estado ANTES de la sincronización:');
    console.log('─'.repeat(70));
    console.log('Cliente'.padEnd(30), 'Balance BD'.padStart(15), 'Deuda Real'.padStart(15));
    console.log('─'.repeat(70));

    let needsSync = 0;
    for (const row of beforeResult.rows) {
      const balanceActual = parseFloat(row.balance_actual);
      const deudaReal = parseFloat(row.deuda_real);
      const diff = balanceActual !== deudaReal ? ' ← DIFERENTE' : '';
      if (diff) needsSync++;
      console.log(
        row.cliente.substring(0, 28).padEnd(30),
        `S/. ${balanceActual.toFixed(2)}`.padStart(15),
        `S/. ${deudaReal.toFixed(2)}`.padStart(15),
        diff
      );
    }
    console.log('─'.repeat(70));
    console.log(`\nClientes a sincronizar: ${needsSync}\n`);

    if (needsSync === 0) {
      console.log('✓ Todos los balances ya están sincronizados. No se requiere acción.');
      process.exit(0);
    }

    // Ejecutar la sincronización
    const updateQuery = `
      UPDATE customers c
      SET current_balance = (
        COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'CARGO' AND mc.status = 'active'), 0
        ) - COALESCE(
          (SELECT SUM(monto) FROM movimientos_credito mc WHERE mc.customer_id = c.id AND mc.tipo_movimiento = 'ABONO' AND mc.status = 'active'), 0
        )
      )
      WHERE c.status = 'active'
    `;

    const updateResult = await pool.query(updateQuery);
    console.log(`✓ Se actualizaron ${updateResult.rowCount} registros.\n`);

    // Mostrar estado después
    const afterResult = await pool.query(beforeQuery);

    console.log('Estado DESPUÉS de la sincronización:');
    console.log('─'.repeat(70));
    console.log('Cliente'.padEnd(30), 'Balance BD'.padStart(15), 'Deuda Real'.padStart(15));
    console.log('─'.repeat(70));

    for (const row of afterResult.rows) {
      const balanceActual = parseFloat(row.balance_actual);
      const deudaReal = parseFloat(row.deuda_real);
      console.log(
        row.cliente.substring(0, 28).padEnd(30),
        `S/. ${balanceActual.toFixed(2)}`.padStart(15),
        `S/. ${deudaReal.toFixed(2)}`.padStart(15),
        balanceActual === deudaReal ? ' ✓' : ''
      );
    }
    console.log('─'.repeat(70));
    console.log('\n✓ Sincronización completada exitosamente.');

  } catch (error) {
    console.error('Error durante la sincronización:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

syncCustomerBalances();
