/**
 * server/services/vkid.js
 * Клиент для «Сервиса авторизации VK ID» (OAuth 2.1, PKCE).
 * Документация: https://id.vk.com/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description
 *
 * Публичное приложение (Web): защищённый ключ (client_secret) не требуется —
 * используется PKCE (code_verifier/code_challenge).
 */
import axios from 'axios';

const ID_BASE = 'https://id.vk.ru';

/**
 * Обмен авторизационного кода на набор токенов (публичное приложение).
 * @param {object} p
 * @param {string} p.clientId  — ID приложения VK ID
 * @param {string} p.code      — authorization_code из redirect
 * @param {string} p.codeVerifier — code_verifier, сгенерированный на фронтенде
 * @param {string} p.deviceId  — device_id из redirect
 * @param {string} p.redirectUri — доверенный redirect URL
 * @param {string} p.state     — state из redirect
 * @returns {Promise<{access_token: string, refresh_token: string, user_id: string, expires_in: number}>}
 */
export async function exchangeCodeForToken({ clientId, code, codeVerifier, deviceId, redirectUri, state }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    code,
    client_id: clientId,
    device_id: deviceId,
    state
  }).toString();

  const response = await axios.post(`${ID_BASE}/oauth2/auth`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const data = response.data;
  if (data && data.error) {
    // Пробрасываем код и описание ошибки, чтобы клиент/логи видели причину
    const err = new Error(`VK ID token error: ${data.error} ${data.error_description || ''}`.trim());
    err.vkError = data.error;
    err.vkDescription = data.error_description || '';
    throw err;
  }
  return data;
}

/**
 * Получение данных пользователя по access_token (публичное приложение).
 * @param {string} clientId
 * @param {string} accessToken
 * @returns {Promise<{user_id: string, first_name: string, last_name: string, avatar: string|null, email?: string}>}
 */
export async function getVkUserInfo(clientId, accessToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    access_token: accessToken
  }).toString();

  const response = await axios.post(`${ID_BASE}/oauth2/user_info`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  const data = response.data;
  if (data && data.error) {
    throw new Error(`VK ID user_info error: ${data.error}`);
  }
  if (!data || !data.user) {
    throw new Error('VK ID user_info: пустой ответ');
  }
  return data.user;
}

export default { exchangeCodeForToken, getVkUserInfo };