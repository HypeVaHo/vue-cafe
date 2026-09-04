import { Router } from 'express';
import { query, getPool, sql } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/roles.js';

const router = Router();

// Get all users (super admin only)
router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { role, limit = 50, offset = 0 } = req.query;

    let queryStr = 'SELECT id, vk_id, first_name, last_name, photo_url, role, is_super_admin, created_at FROM users WHERE 1=1';
    const params = { limit: parseInt(limit), offset: parseInt(offset) };

    if (role) {
      queryStr += ' AND role = @role';
      params.role = role;
    }

    queryStr += ' ORDER BY created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';

    const result = await query(queryStr, params);
    res.json(result.recordset);
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
      'SELECT id, vk_id, first_name, last_name, photo_url, role, is_super_admin, created_at FROM users WHERE id = @id',
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

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Ошибка получения пользователя' });
  }
});

// Update user role (super admin only; главного админа изменить нельзя)
router.patch('/:id/role', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = parseInt(req.params.id);

    if (!['customer', 'baker', 'admin'].includes(role)) {
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

    const result = await query(
      `UPDATE users SET role = @role 
       OUTPUT INSERTED.id, INSERTED.vk_id, INSERTED.first_name, INSERTED.last_name, INSERTED.photo_url, INSERTED.role, INSERTED.created_at, INSERTED.is_super_admin
       WHERE id = @id`,
      { role, id: userId }
    );

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Ошибка обновления роли' });
  }
});

export default router;
