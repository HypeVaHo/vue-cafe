// Миграция 4: количество товара (stock). Запуск: node scripts/migrate_4.mjs
import { query, getPool } from '../config/database.js';

try {
  await getPool();
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'products') AND name = 'quantity')
    ALTER TABLE products ADD quantity INT NOT NULL DEFAULT 0`);
  console.log('OK: колонка products.quantity готова');
  const r = await query('SELECT id, name, quantity, is_available FROM products');
  console.table(r.recordset);
  process.exit(0);
} catch (e) {
  console.error('MIGRATION FAILED:', e.message);
  process.exit(1);
}
