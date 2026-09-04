/**
 * server/ngrok.js
 * Публичный HTTPS-туннель к локальному бэкенду через @ngrok/ngrok.
 *
 * Использование:
 *   node server/ngrok.js
 *   npm run ngrok
 *
 * Настройки (server/.env):
 *   NGROK_AUTHTOKEN=...               — обязателен (берётся из dashboard.ngrok.com)
 *   NGROK_DOMAIN=oxidize-balmy-bagging.ngrok-free.dev  — опциональный статический домен
 *   NGROK_ADDR=localhost:3000         — куда вести туннель (у нас бэкенд)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import ngrok from '@ngrok/ngrok';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const ADDR = process.env.NGROK_ADDR || 'localhost:3000';
const DOMAIN = process.env.NGROK_DOMAIN || '';
const AUTHTOKEN = process.env.NGROK_AUTHTOKEN || '';

async function forwardToApp() {
  if (!AUTHTOKEN) {
    console.error('NGROK_AUTHTOKEN не указан.');
    console.error('Получите токен на https://dashboard.ngrok.com/get-started/setup/windows и добавьте его в server/.env');
    process.exit(1);
  }

  const options = {
    addr: ADDR,
    authtoken: AUTHTOKEN
  };
  if (DOMAIN) options.domain = DOMAIN;

  console.log(`>> ngrok: forward ${ADDR}${DOMAIN ? ' -> домен ' + DOMAIN : ' (случайный URL)'} ...`);
  const forwarder = await ngrok.forward(options);
  const url = forwarder.url();
  console.log('====================================================');
  console.log('  Публичный адрес (для VK redirect URI):');
  console.log(`  ${url}`);
  console.log('====================================================');
  console.log('  В redirect URI приложения VK нужно указать:');
  console.log(`  ${url}/api/auth/vk/callback`);
  console.log('====================================================');
  console.log('  Нажмите Ctrl+C, чтобы остановить туннель.');
  console.log('');

  const stopHandler = async () => {
    try { await forwarder.close(); } catch {}
    console.log('>> ngrok tunnel closed.');
    process.exit(0);
  };
  process.on('SIGINT', stopHandler);
  process.on('SIGTERM', stopHandler);
}

forwardToApp().catch(err => {
  console.error('ngrok error:', err.message || err);
  process.exit(1);
});