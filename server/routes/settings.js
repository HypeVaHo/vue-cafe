import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/roles.js';

const router = Router();

// Ключи, которые можно менять через API
const ALLOWED_KEYS = [
  'site_name',
  'cafe_address',
  'work_hours',
  'phone',
  'vk_community_url',
  'vk_bot_url'
];

// Публично: настройки сайта для отображения на страницах
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT setting_key, setting_value FROM site_settings');
    const settings = {};
    for (const row of result.recordset) {
      settings[row.setting_key] = row.setting_value;
    }
    res.json(settings);
  } catch (error) {
    // Настройки не должны ронять сайт
    console.error('Get settings error:', error);
    res.json({});
  }
});

// Обновление настроек — только главный админ
router.put('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const updates = req.body || {};
    const applied = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_KEYS.includes(key)) continue;
      await query(
        `MERGE site_settings AS t
         USING (SELECT @k AS k, @v AS v) AS src
         ON t.setting_key = src.k
         WHEN MATCHED THEN UPDATE SET setting_value = src.v
         WHEN NOT MATCHED THEN INSERT (setting_key, setting_value) VALUES (src.k, src.v);`,
        { k: key, v: String(value ?? '') }
      );
      applied.push(key);
    }

    const result = await query('SELECT setting_key, setting_value FROM site_settings');
    const settings = {};
    for (const row of result.recordset) settings[row.setting_key] = row.setting_value;

    res.json({ updated: applied, settings });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Ошибка сохранения настроек' });
  }
});

export default router;