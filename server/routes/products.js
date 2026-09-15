import { Router } from 'express';
import { query, getPool, sql } from '../config/database.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/roles.js';

const router = Router();

// Get all products (public)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, available } = req.query;

    let queryStr = `
      SELECT p.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE 1=1
    `;
    const params = {};

    if (category) {
      queryStr += ' AND c.slug = @category';
      params.category = category;
    }

    // Admin/baker sees all, customers only available
    if (available === 'true' || (!req.user || req.user.role === 'customer')) {
      queryStr += ' AND p.is_available = 1';
    }

    queryStr += ' ORDER BY c.sort_order, p.name';

    const result = await query(queryStr, params);
    res.json(result.recordset);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Ошибка получения продуктов' });
  }
});

// Get single product (public)
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = @id`,
      { id: parseInt(req.params.id) }
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Продукт не найден' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Ошибка получения продукта' });
  }
});

// Create product (admin only)
router.post('/', authenticate, requirePermission('products'), async (req, res) => {
  try {
    const { category_id, name, subtitle, description, price, icon, image_url, is_popular = false, is_available = true, quantity = 0 } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Название и цена обязательны' });
    }

    const qty = Math.max(0, parseInt(quantity) || 0);
    // Авто-скрытие: нет запаса — товара нет в меню
    const available = qty > 0 ? (is_available ? 1 : 0) : 0;

    const pool = await getPool();
    const result = await pool.request()
      .input('categoryId', sql.Int, category_id || null)
      .input('name', sql.NVarChar, name)
      .input('subtitle', sql.NVarChar, subtitle || null)
      .input('description', sql.NVarChar, description || null)
      .input('price', sql.Decimal(10, 2), price)
      .input('icon', sql.NVarChar, icon || '🥐')
      .input('imageUrl', sql.NVarChar, image_url || null)
      .input('isPopular', sql.Bit, is_popular ? 1 : 0)
      .input('isAvailable', sql.Bit, available)
      .input('quantity', sql.Int, qty)
      .query(`
        INSERT INTO products (category_id, name, subtitle, description, price, icon, image_url, is_popular, is_available, quantity)
        OUTPUT INSERTED.*
        VALUES (@categoryId, @name, @subtitle, @description, @price, @icon, @imageUrl, @isPopular, @isAvailable, @quantity)
      `);

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Ошибка создания продукта' });
  }
});

// Update product (admin only)
router.put('/:id', authenticate, requirePermission('products'), async (req, res) => {
  try {
    const { category_id, name, subtitle, description, price, icon, image_url, is_popular, is_available, quantity } = req.body;

    const existing = await query('SELECT id FROM products WHERE id = @id', { id: parseInt(req.params.id) });
    if (existing.recordset.length === 0) {
      return res.status(404).json({ error: 'Продукт не найден' });
    }

    const qty = quantity === undefined ? null : Math.max(0, parseInt(quantity) || 0);
    // Авто-скрытие: запас 0 — товара нет в меню
    const available = qty !== null && qty === 0 ? 0 : (is_available ? 1 : 0);

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, parseInt(req.params.id))
      .input('categoryId', sql.Int, category_id || null)
      .input('name', sql.NVarChar, name)
      .input('subtitle', sql.NVarChar, subtitle || null)
      .input('description', sql.NVarChar, description || null)
      .input('price', sql.Decimal(10, 2), price)
      .input('icon', sql.NVarChar, icon || '🥐')
      .input('imageUrl', sql.NVarChar, image_url || null)
      .input('isPopular', sql.Bit, is_popular ? 1 : 0)
      .input('isAvailable', sql.Bit, available)
      .input('quantity', sql.Int, qty)
      .query(`
        UPDATE products
        SET category_id = @categoryId, name = @name, subtitle = @subtitle, description = @description,
            price = @price, icon = @icon, image_url = @imageUrl, is_popular = @isPopular, is_available = @isAvailable,
            quantity = COALESCE(@quantity, quantity)
        OUTPUT INSERTED.*
        WHERE id = @id
      `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Ошибка обновления продукта' });
  }
});

// Delete product (admin only)
router.delete('/:id', authenticate, requirePermission('products'), async (req, res) => {
  try {
    const existing = await query('SELECT id FROM products WHERE id = @id', { id: parseInt(req.params.id) });
    if (existing.recordset.length === 0) {
      return res.status(404).json({ error: 'Продукт не найден' });
    }

    await query('DELETE FROM products WHERE id = @id', { id: parseInt(req.params.id) });
    res.json({ message: 'Продукт удалён' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Ошибка удаления продукта' });
  }
});

// Toggle product availability (admin only)
router.patch('/:id/availability', authenticate, requirePermission('products'), async (req, res) => {
  try {
    const { is_available } = req.body;

    const existing = await query('SELECT id FROM products WHERE id = @id', { id: parseInt(req.params.id) });
    if (existing.recordset.length === 0) {
      return res.status(404).json({ error: 'Продукт не найден' });
    }

    const result = await query(
      'UPDATE products SET is_available = @isAvailable OUTPUT INSERTED.* WHERE id = @id',
      { isAvailable: is_available ? 1 : 0, id: parseInt(req.params.id) }
    );

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Toggle availability error:', error);
    res.status(500).json({ error: 'Ошибка обновления доступности' });
  }
});

export default router;
