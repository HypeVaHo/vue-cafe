# Инструкция по деплою

## Архитектура

- **Фронтенд** → GitHub Pages (статический сайт, бесплатно)
- **Бэкенд** → ваш ноутбук (Node.js + SQL Server)
- **Связь** → Cloudflare Tunnel (бесплатный туннель без домена)

## Шаг 1: Фронтенд на GitHub Pages

### 1.1 Создайте репозиторий на GitHub

1. Зайдите на https://github.com и создайте новый репозиторий (например `vue-cafe`)
2. **Не** добавляйте README, .gitignore — у вас уже есть проект

### 1.2 Загрузите код

```bash
cd C:\Users\Admin\Desktop\SPO\vue-cafe
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/vue-cafe.git
git push -u origin main
```

### 1.3 Включите GitHub Pages

1. В репозитории: **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/docs**
4. Save

### 1.4 Настройте сборку для GitHub Pages

Создайте файл `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Install dependencies
        run: npm ci
        
      - name: Build
        run: npm run build
        
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

После этого сайт будет доступен по адресу:
`https://ВАШ_ЛОГИН.github.io/vue-cafe`

## Шаг 2: Настройка API URL для фронтенда

В файле `public/app-config.js` замените:

```javascript
window.APP_CONFIG = {
  apiUrl: 'https://ВАШ_ТУННЕЛЬ.trycloudflare.com/api'
};
```

Адрес туннеля вы получите после запуска cloudflared (см. Шаг 4).

## Шаг 3: Бэкенд на ноутбуке

### 3.1 Установите зависимости сервера

```bash
cd C:\Users\Admin\Desktop\SPO\vue-cafe\server
npm install
```

### 3.2 Настройте .env

Файл `server/.env` уже настроен. Убедитесь что указаны:
- `MSSQL_SERVER=localhost`
- `MSSQL_PORT=1433`
- `MSSQL_USER=spo_user`
- `MSSQL_PASSWORD=Spo_bakery2024!`
- `MSSQL_DATABASE=spo_bakery`

### 3.3 Запустите бэкенд

```bash
node server/index.js
```

Сервер будет доступен на `http://localhost:3000`

## Шаг 4: Cloudflare Tunnel (бесплатно, без домена)

### 4.1 Скачайте cloudflared

1. Зайдите на https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Скачайте `cloudflared.exe` для Windows
3. Положите в папку проекта или в удобное место

### 4.2 Запустите туннель

```bash
cloudflared.exe tunnel --url http://localhost:3000
```

Вы увидите адрес вида:
```
https://xxxx-xxxx-xxxx.trycloudflare.com
```

### 4.3 Обновите app-config.js

```javascript
window.APP_CONFIG = {
  apiUrl: 'https://xxxx-xxxx-xxxx.trycloudflare.com/api'
};
```

### 4.4 Перезадеплойте фронтенд

```bash
git add .
git commit -m "Update API URL"
git push
```

## Шаг 5: Запуск всего вместе

На ноутбуке запустите в двух окнах терминала:

**Окно 1 — Бэкенд:**
```bash
cd C:\Users\Admin\Desktop\SPO\vue-cafe
node server/index.js
```

**Окно 2 — Туннель:**
```bash
cloudflared.exe tunnel --url http://localhost:3000
```

Теперь:
- Сайт: `https://ВАШ_ЛОГИН.github.io/vue-cafe`
- API: `https://ВАШ_ТУННЕЛЬ.trycloudflare.com/api`

## Важные замечания

1. **Туннель меняется** — при каждом запуске cloudflared даёт новый адрес. Для постоянного адреса нужно зарегистрироваться в Cloudflare и привязать свой домен (бесплатно).

2. **Ноутбук должен быть включен** — бэкенд и туннель работают только когда запущены.

3. **VK OAuth** — для работы входа через VK на публичном сайте, укажите в настройках приложения VK ID:
   - Redirect URI: `https://ВАШ_ЛОГИН.github.io/vue-cafe/auth/callback`

4. **VK Bot** — уведомления работают через сообщество ВК, настройки в `server/.env`:
   - `VK_COMMUNITY_TOKEN=ваш_токен`

## Автозапуск (опционально)

Чтобы сервер запускался при включении ноутбука, создайте задачу в Планировщике заданий Windows или используйте `pm2`:

```bash
npm install -g pm2
pm2 start server/index.js --name vue-cafe-api
pm2 save
pm2 startup
```

## Проверка работы

1. Откройте `https://ВАШ_ЛОГИН.github.io/vue-cafe`
2. Нажмите «Войти через ВКонтакте»
3. Добавьте товар в корзину
4. Оформите заказ
5. Проверьте панель пекаря (`/baker`)
6. Проверьте админку (`/admin`)

Все данные хранятся в SQL Server на вашем ноутбуке.