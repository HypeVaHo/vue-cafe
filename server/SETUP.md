# Инструкция по настройке Backend для SQL Server 2022

## Требования

- **Node.js** 18+ (рекомендуется 20 LTS)
- **SQL Server 2022** (Developer, Express или Standard Edition)
- **SQL Server Management Studio (SSMS)** или Azure Data Studio
- **Git**

---

## 1. Установка SQL Server 2022

### Windows

1. Скачайте SQL Server 2022 с [официального сайта Microsoft](https://www.microsoft.com/sql-server/sql-server-downloads)
2. Выберите **Developer** (бесплатно для разработки) или **Express** (бесплатно, с ограничениями)
3. Запустите установщик и выберите **Basic Installation**
4. После установки запомните:
   - **Имя сервера** (обычно `localhost` или `.\SQLEXPRESS`)
   - **Метод аутентификации** (Windows или SQL Server Authentication)

### Настройка SQL Server Authentication (если нужно)

1. Откройте **SQL Server Management Studio**
2. Подключитесь к серверу
3. ПКМ на сервер → **Properties** → **Security**
4. Выберите **SQL Server and Windows Authentication mode**
5. Перезапустите службу SQL Server

### Создание пользователя для приложения

```sql
-- Подключитесь к master
USE master;
GO

-- Создайте логин
CREATE LOGIN spo_user WITH PASSWORD = 'YourStrongPassword123!';
GO

-- Создайте базу данных
CREATE DATABASE spo_bakery;
GO

-- Переключитесь на новую БД
USE spo_bakery;
GO

-- Создайте пользователя и дайте права
CREATE USER spo_user FOR LOGIN spo_user;
ALTER ROLE db_owner ADD MEMBER spo_user;
GO
```

---

## 2. Настройка проекта

### Клонирование репозитория

```bash
git clone https://github.com/HypeVaHo/SPO.git
cd SPO/server
```

### Установка зависимостей

```bash
npm install
```

### Настройка переменных окружения

```bash
# Скопируйте пример конфигурации
cp .env.example .env
```

Отредактируйте `.env`:

```env
# SQL Server Configuration
DB_SERVER=localhost
DB_PORT=1433
DB_NAME=spo_bakery
DB_USER=spo_user
DB_PASSWORD=YourStrongPassword123!
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true

# JWT Secret (сгенерируйте случайную строку)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server
PORT=3000
NODE_ENV=development

# Frontend URL (для CORS)
FRONTEND_URL=http://localhost:5173

# VK OAuth (получите на dev.vk.com)
VK_CLIENT_ID=your_vk_app_id
VK_CLIENT_SECRET=your_vk_client_secret
VK_REDIRECT_URI=http://localhost:5173/auth/callback

# VK API для уведомлений
VK_ACCESS_TOKEN=your_vk_group_token
VK_API_VERSION=5.199
```

---

## 3. Настройка VK приложения

1. Перейдите на [dev.vk.com](https://dev.vk.com)
2. Создайте новое приложение:
   - Тип: **Standalone-приложение**
   - Название: **СПО Пекарня** (или ваше)
3. В настройках приложения:
   - Добавьте **Redirect URI**: `http://localhost:5173/auth/callback`
   - Для продакшена добавьте ваш домен
4. Скопируйте **App ID** и **Secure key** в `.env`

### Для VK уведомлений (опционально)

1. Создайте группу ВКонтакте или используйте существующую
2. В настройках группы → **Работа с API** → **Ключи доступа**
3. Создайте ключ с правами на отправку сообщений
4. Скопируйте токен в `VK_ACCESS_TOKEN`

---

## 4. Инициализация базы данных

```bash
# Запустите миграцию (создаст таблицы и начальные данные)
npm run migrate
```

Миграция создаст:
- **Таблицы**: users, categories, products, orders, order_items
- **Категории**: Хлеб, Выпечка, Торты, Пирожные, Напитки
- **Продукты**: 10 товаров из меню пекарни
- **Триггер**: автоматическое обновление updated_at

---

## 5. Запуск сервера

### Режим разработки (с автоперезагрузкой)

```bash
npm run dev
```

### Продакшен режим

```bash
npm start
```

Сервер запустится на `http://localhost:3000`

---

## 6. Проверка работы API

### Health check

```bash
curl http://localhost:3000/api/health
```

Ответ:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-01-15T12:00:00.000Z"
}
```

### Получение продуктов

```bash
curl http://localhost:3000/api/products
```

### Получение категорий

```bash
curl http://localhost:3000/api/categories
```

---

## 7. Запуск Frontend

В отдельном терминале:

```bash
# Из корня проекта
cd ..
npm install
npm run dev
```

Frontend запустится на `http://localhost:5173`

---

## 8. API Endpoints

### Публичные (без авторизации)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/health` | Проверка состояния сервера |
| GET | `/api/products` | Список всех продуктов |
| GET | `/api/products/:id` | Один продукт |
| GET | `/api/categories` | Список категорий |
| GET | `/api/auth/vk` | Начало VK OAuth |
| GET | `/api/auth/vk/callback` | Callback VK OAuth |

### Требуют авторизации (JWT токен)

| Метод | Endpoint | Роль | Описание |
|-------|----------|------|----------|
| GET | `/api/auth/me` | Все | Текущий пользователь |
| POST | `/api/orders` | customer+ | Создать заказ |
| GET | `/api/orders/my` | customer+ | Мои заказы |
| GET | `/api/orders` | baker+ | Все заказы |
| PATCH | `/api/orders/:id/status` | baker+ | Изменить статус |
| POST | `/api/products` | admin | Создать продукт |
| PUT | `/api/products/:id` | admin | Обновить продукт |
| DELETE | `/api/products/:id` | admin | Удалить продукт |
| GET | `/api/users` | admin | Список пользователей |
| PATCH | `/api/users/:id/role` | admin | Изменить роль |
| GET | `/api/analytics/*` | admin | Аналитика |

### Заголовок авторизации

```
Authorization: Bearer <jwt_token>
```

---

## 9. Статусы заказов

| Статус | Описание | Кто меняет |
|--------|----------|------------|
| `pending` | Новый заказ | Автоматически |
| `confirmed` | Подтвержден | Пекарь |
| `preparing` | Готовится | Пекарь |
| `ready` | Готов к выдаче | Пекарь |
| `completed` | Выдан | Пекарь |
| `cancelled` | Отменен | Пекарь/Админ |

---

## 10. Роли пользователей

| Роль | Права |
|------|-------|
| `customer` | Просмотр меню, оформление заказов, история своих заказов |
| `baker` | + Просмотр всех заказов, изменение статусов |
| `admin` | + Управление меню, пользователями, аналитика |

---

## 11. Troubleshooting

### Ошибка подключения к SQL Server

1. Проверьте, что SQL Server запущен:
   ```
   services.msc → SQL Server (MSSQLSERVER) → Running
   ```

2. Проверьте TCP/IP:
   - Откройте **SQL Server Configuration Manager**
   - SQL Server Network Configuration → Protocols
   - Включите **TCP/IP**
   - В Properties → IP Addresses → IPAll → TCP Port = 1433
   - Перезапустите SQL Server

3. Проверьте firewall:
   ```
   netsh advfirewall firewall add rule name="SQL Server" dir=in action=allow protocol=TCP localport=1433
   ```

### Ошибка "Login failed for user"

1. Проверьте, что SQL Server Authentication включен
2. Проверьте правильность логина/пароля
3. Убедитесь, что пользователь имеет доступ к базе данных

### CORS ошибки

Убедитесь, что `FRONTEND_URL` в `.env` совпадает с адресом фронтенда.

---

## 12. Продакшен деплой

### Рекомендации

1. **Используйте HTTPS** - установите SSL сертификат
2. **Измените JWT_SECRET** на длинную случайную строку
3. **Включите шифрование** SQL Server: `DB_ENCRYPT=true`
4. **Настройте бэкапы** базы данных
5. **Используйте PM2** для запуска:
   ```bash
   npm install -g pm2
   pm2 start index.js --name spo-backend
   pm2 save
   pm2 startup
   ```

### Переменные для продакшена

```env
NODE_ENV=production
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
FRONTEND_URL=https://yourdomain.com
VK_REDIRECT_URI=https://yourdomain.com/auth/callback
```
