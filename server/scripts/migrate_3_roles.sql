-- Миграция 3: новая модель ролей + очистка тестовых данных
-- Роли: customer -> admin (с правами) -> super admin (главный админ)
-- Пекарь становится обычным админом, права которого настраивает ГА.

-- 1. Колонка permissions (JSON-массив разделов; NULL = все права)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'users') AND name = 'permissions')
BEGIN
    ALTER TABLE users ADD permissions NVARCHAR(MAX) NULL;
END
GO

-- 2. Пекарь -> админ (baker больше не используется)
UPDATE users SET role = 'admin' WHERE role = 'baker';
GO

-- 3. Очистка истории заказов
DELETE FROM order_items;
DELETE FROM orders;
GO

-- 4. Удаление тестовых пользователей (vk_id 900000001, 900000002)
DELETE FROM users WHERE vk_id IN ('900000001', '900000002');
GO