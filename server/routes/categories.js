import { Router } from 'express';
import { query, getPool, sql } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { isAdmin } from '../middleware/roles.js';

const router = Router();

// Get all categories (public)
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM categories ORDER BY sort_order, name');
    res.json(result.recordset);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Ошибка получения категорий' });
  }
});

// Get category by id or slug (public)
router.get('/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const isNumeric = /^\d+$/.test(identifier);

    const result = await query(
      isNumeric
        ? 'SELECT * FROM categories WHERE id = @identifier'
        : 'SELECT * FROM categories WHERE slug = @identifier',
      { identifier: isNumeric ? parseInt(identifier) : identifier }
    );

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({ error: 'Ошибка получения категории' });
  }
});

// Create category (admin only)
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { name, slug, icon, sort_order = 0 } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Название и slug обязательны' });
    }

    // Check for duplicate slug
    const existing = await query('SELECT id FROM categories WHERE slug = @slug', { slug });
    if (existing.recordset.length > 0) {
      return res.status(400).json({ error: 'Категория с таким slug уже существует' });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('slug', sql.NVarChar, slug)
      .input('icon', sql.NVarChar, icon || '🥐')
      .input('sortOrder', sql.Int, sort_order)
      .query(`
        INSERT INTO categories (name, slug, icon, sort_order) 
        OUTPUT INSERTED.*
        VALUES (@name, @slug, @icon, @sortOrder)
      `);

    res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Ошибка создания категории' });
  }
});

// Update category (admin only)
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { name, slug, icon, sort_order } = req.body;
    const id = parseInt(req.params.id);

    const existing = await query('SELECT id FROM categories WHERE id = @id', { id });
    if (existing.recordset.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    // Check for duplicate slug (excluding current category)
    if (slug) {
      const duplicateSlug = await query(
        'SELECT id FROM categories WHERE slug = @slug AND id != @id',
        { slug, id }
      );
      if (duplicateSlug.recordset.length > 0) {
        return res.status(400).json({ error: 'Категория с таким slug уже существует' });
      }
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name)
      .input('slug', sql.NVarChar, slug)
      .input('icon', sql.NVarChar, icon || '🥐')
      .input('sortOrder', sql.Int, sort_order)
      .query(`
        UPDATE categories SET name = @name, slug = @slug, icon = @icon, sort_order = @sortOrder 
        OUTPUT INSERTED.*
        WHERE id = @id
      `);

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Ошибка обновления категории' });
  }
});

// Delete category (admin only)
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const existing = await query('SELECT id FROM categories WHERE id = @id', { id });
    if (existing.recordset.length === 0) {
      return res.status(404).json({ error: 'Категория не найдена' });
    }

    // Check if category has products
    const products = await query('SELECT COUNT(*) as count FROM products WHERE category_id = @id', { id });
    if (products.recordset[0].count > 0) {
      return res.status(400).json({ 
        error: 'Нельзя удалить категорию с продуктами',
        products_count: products.recordset[0].count
      });
    }

    await query('DELETE FROM categories WHERE id = @id', { id });
    res.json({ message: 'Категория удалена' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Ошибка удаления категории' });
  }
});

export default router;
