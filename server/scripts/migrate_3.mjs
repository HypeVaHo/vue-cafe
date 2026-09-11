// Разовая миграция 3 (см. migrate_3_roles.sql). Запуск: node scripts/migrate_3.mjs
import { query, getPool } from '../config/database.js';

const steps = [
  `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'users') AND name = 'permissions')
   ALTER TABLE users ADD permissions NVARCHAR(MAX) NULL`,
  `UPDATE users SET role = 'admin' WHERE role = 'baker'`,
  `DELETE FROM order_items`,
  `DELETE FROM orders`,
  `DELETE FROM users WHERE vk_id IN ('900000001', '900000002')`
];

try {
  await getPool();
  for (const s of steps) {
    await query(s);
    console.log('OK');
  }
  const users = await query('SELECT id, vk_id, first_name, role, is_super_admin, permissions FROM users');
  console.table(users.recordset);
  const o = await query('SELECT COUNT(*) as n FROM orders');
  console.log('orders:', o.recordset[0].n);
  process.exit(0);
} catch (e) {
  console.error('MIGRATION FAILED:', e.message);
  process.exit(1);
}
