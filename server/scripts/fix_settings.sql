UPDATE site_settings SET setting_value = N'Студенческое кафе «СтудFood»' WHERE setting_key = N'site_name' AND setting_value NOT LIKE N'%СтудFood%';
SELECT setting_key, setting_value FROM site_settings;
