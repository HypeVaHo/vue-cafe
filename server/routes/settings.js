import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/roles.js';
import { readFileSync, writeFileSync } from 'node:fs';

// Настройки хранятся в двух местах:
// 1) БД (site_settings) — основной источник;
// 2) server/site-settings.json — страховка «в коде»: переживает сброс БД
//    и коммитится в git вместе с проектом.
const SETTINGS_FILE = new URL('../site-settings.json', import.meta.url);

function readSettingsFile() {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeSettingsFile(settings) {
  try {
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.error('Write settings file error:', e.message);
  }
}

const router = Router();

// Ключи, которые можно менять через API
const ALLOWED_KEYS = [
  'site_name',
  'site_tagline',
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
    // Если в БД пусто — восстанавливаем из файла
    const file = readSettingsFile();
    for (const [k, v] of Object.entries(file)) {
      if (settings[k] === undefined) settings[k] = v;
    }
    res.json(settings);
  } catch (error) {
    // Настройки не должны ронять сайт — отдаём из файла
    console.error('Get settings error:', error);
    res.json(readSettingsFile());
  }
});

// Обновление настроек — только главный админ
router.put('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const updates = req.body || {};
    const applied = [];

    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_KEYS.includes(key)) continue;
      const val = String(value ?? '');
      await query('UPDATE site_settings SET setting_value = @v WHERE setting_key = @k', { k: key, v: val });
      const existing = await query('SELECT 1 FROM site_settings WHERE setting_key = @k', { k: key });
      if (existing.recordset.length === 0) {
        await query('INSERT INTO site_settings (setting_key, setting_value) VALUES (@k, @v)', { k: key, v: val });
      }
      applied.push(key);
    }

    const result = await query('SELECT setting_key, setting_value FROM site_settings');
    const settings = {};
    for (const row of result.recordset) settings[row.setting_key] = row.setting_value;

    // Дублируем в файл — настройки «в коде», переживают что угодно
    writeSettingsFile(settings);

    res.json({ updated: applied, settings });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Ошибка сохранения настроек' });
  }
});

export default router;