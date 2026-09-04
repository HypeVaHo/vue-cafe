-- Миграция №2: главный админ + настройки сайта
IF COL_LENGTH('users','is_super_admin') IS NULL
BEGIN
  ALTER TABLE users ADD is_super_admin BIT NOT NULL DEFAULT 0;
END
GO

UPDATE users SET is_super_admin = 1 WHERE vk_id = 471331064;
GO

IF OBJECT_ID('site_settings','U') IS NULL
BEGIN
  CREATE TABLE site_settings (
    setting_key NVARCHAR(100) NOT NULL PRIMARY KEY,
    setting_value NVARCHAR(MAX) NOT NULL
  );
END
GO

INSERT INTO site_settings (setting_key, setting_value)
SELECT x.k, x.v
FROM (VALUES
  (N'site_name',       N'Студенческое кафе «СтудFood»'),
  (N'cafe_address',    N'Корпус №1, 1 этаж'),
  (N'work_hours',      N'Пн–Пт 8:00–17:00'),
  (N'phone',           N'+7 (900) 123-45-67'),
  (N'vk_community_url',N'https://vk.com/club239108717'),
  (N'vk_bot_url',      N'https://vk.me/club239108717')
) x(k, v)
WHERE NOT EXISTS (SELECT 1 FROM site_settings s WHERE s.setting_key = x.k);
GO

SELECT id, vk_id, first_name, role, is_super_admin FROM users ORDER BY id;
SELECT setting_key, setting_value FROM site_settings;
GO
