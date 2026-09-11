import { Router } from 'express';
import { query, getPool, sql } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/roles.js';

const router = Router();

// Get all users (super admin only)
router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { role, limit = 50, offset = 0 } = req.query;

    let queryStr = 'SELECT id, vk_id, first_name, last_name, photo_url, role, is_super_admin, permissions, created_at FROM users WHERE 1=1';
    const params = { limit: parseInt(limit), offset: parseInt(offset) };

    if (role) {
      queryStr += ' AND role = @role';
      params.role = role;
    }

    queryStr += ' ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';

    const result = await query(queryStr, params);
    // permissions хранится как JSON-строка — отдаём как массив
    const users = result.recordset.map(u => {
      if (u.permissions) {
        try { u.permissions = JSON.parse(u.permissions); } catch { u.permissions = null; }
      }
      return u;
    });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
  }
});

// Get user profile
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Users can only see their own profile, admins can see anyone
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    const result = await query(
      'SELECT id, vk_id, first_name, last_name, photo_url, role, is_super_admin, permissions, created_at FROM users WHERE id = @id',
      { id: userId }
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = result.recordset[0];

    // Get order stats for the user
    const statsResult = await query(`
      SELECT 
        COUNT(*) as total_orders,
        ISNULL(SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END), 0) as total_spent,
        SUM(CASE WHEN status IN ('new', 'preparing', 'ready') THEN 1 ELSE 0 END) as active_orders
      FROM orders WHERE user_id = @userId
    `, { userId });

    user.stats = statsResult.recordset[0];

    // permissions хранится как JSON-строка — отдаём как массив
    if (user.permissions) {
      try { user.permissions = JSON.parse(user.permissions); } catch { user.permissions = null; }
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Ошибка получения пользователя' });
  }
});

// Update user role (super admin only; главного админа изменить нельзя).
// Роли: customer | admin. Так ГА выдаёт админку пользователю, который
// авторизовался через VK (пользователи появляются в списке после первого входа).
router.patch('/:id/role', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { role, permissions } = req.body;
    const userId = parseInt(req.params.id);

    if (!['customer', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Неверная роль' });
    }

    // Can't change own role
    if (req.user.id === userId) {
      return res.status(400).json({ error: 'Нельзя изменить свою роль' });
    }

    const existing = await query('SELECT id, is_super_admin FROM users WHERE id = @id', { id: userId });
    if (existing.recordset.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    if (existing.recordset[0].is_super_admin) {
      return res.status(403).json({ error: 'Нельзя менять роль главного админа' });
    }

    // При выдаче админки можно сразу задать права (JSON-массив; null = все разделы)
    let permissionsJson = null;
    if (role === 'admin' && Array.isArray(permissions)) {
      permissionsJson = JSON.stringify(permissions);
    }

    const result = await query(
      `UPDATE users SET role = @role, permissions = @permissions
       OUTPUT INSERTED.id, INSERTED.vk_id, INSERTED.first_name, INSERTED.last_name, INSERTED.photo_url, INSERTED.role, INSERTED.created_at, INSERTED.is_super_admin, INSERTED.permissions
       WHERE id = @id`,
      { role, permissions: permissionsJson, id: userId }
    );

    const updated = result.recordset[0];
    if (updated.permissions) {
      try { updated.permissions = JSON.parse(updated.permissions); } catch { updated.permissions = null; }
    }

    res.json(updated);
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Ошибка обновления роли' });
  }
});

// Настройка прав обычного админа (super admin only).
// body: { permissions: ["products","orders",...] | null } — null = все разделы.
router.patch('/:id/permissions', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { permissions } = req.body;

    if (permissions !== null && !Array.isArray(permissions)) {
      return res.status(400).json({ error: 'permissions должен быть массивом или null' });
    }

    const existing = await query('SELECT id, is_super_admin, role FROM users WHERE id = @id', { id: userId });
    if (existing.recordset.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    if (existing.recordset[0].is_super_admin) {
      return res.status(403).json({ error: 'Права главного админа не настраиваются — у него полный доступ' });
    }
    if (existing.recordset[0].role !== 'admin') {
      return res.status(400).json({ error: 'Права настраиваются только для админов' });
    }

    const permissionsJson = permissions === null ? null : JSON.stringify(permissions);

    const result = await query(
      `UPDATE users SET permissions = @permissions
       OUTPUT INSERTED.id, INSERTED.vk_id, INSERTED.first_name, INSERTED.last_name, INSERTED.photo_url, INSERTED.role, INSERTED.created_at, INSERTED.is_super_admin, INSERTED.permissions
       WHERE id = @id`,
      { permissions: permissionsJson, id: userId }
    );

    const updated = result.recordset[0];
    if (updated.permissions) {
      try { updated.permissions = JSON.parse(updated.permissions); } catch { updated.permissions = null; }
    }

    res.json(updated);
  } catch (error) {
    console.error('Update user permissions error:', error);
    res.status(500).json({ error: 'Ошибка обновления прав' });
  }
});

export default router;
