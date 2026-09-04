/**
 * server/tunnel.js
 * Публичный HTTPS-туннель к локальному бэкенду через cloudflared (TryCloudflare).
 * Не требует регистрации и не блокирует IP (в отличие от ngrok free).
 *
 * Использование:
 *   node server/tunnel.js
 *   npm run tunnel
 *
 * Требования:
 *   - cloudflared.exe рядом с корнем проекта (уже скачан)
 *   - бэкенд запущен на localhost:3000
 */
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'cloudflared.exe');
const ADDR = process.env.TUNNEL_ADDR || 'http://localhost:3000';

if (!fs.existsSync(BIN)) {
  console.error('Файл cloudflared.exe не найден в корне проекта.');
  console.error('Скачайте: https://github.com/cloudflare/cloudflared/releases');
  process.exit(1);
}

console.log(`>> cloudflared: tunnel ${ADDR} ...`);

const child = spawn(BIN, ['tunnel', '--url', ADDR, '--no-autoupdate'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe']
});

let urlPrinted = false;
const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function onData(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);
  const m = text.match(urlRegex);
  if (!urlPrinted && m) {
    urlPrinted = true;
    const url = m[0];
    console.log('');
    console.log('====================================================');
    console.log('  Публичный адрес (для VK redirect URI):');
    console.log(`   ${url}`);
    console.log('');
    console.log('  В redirect URI приложения VK укажите:');
    console.log(`   ${url}/api/auth/vk/callback`);
    console.log('');
    console.log('  А в server/.env:');
    console.log(`   VK_REDIRECT_URI=${url}/api/auth/vk/callback`);
    console.log('====================================================');
    console.log('  Нажмите Ctrl+C для остановки туннеля.');
  }
}

child.stdout.on('data', onData);
child.stderr.on('data', onData);

const stop = () => { try { child.kill(); } catch {} process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

child.on('error', (e) => {
  console.error('cloudflared error:', e.message);
  process.exit(1);
});