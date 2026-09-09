import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query, getPool, sql } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { exchangeCodeForToken, getVkUserInfo } from '../services/vkid.js';

const router = Router();

// VK ID OAuth (OAuth 2.1 + PKCE, публичное Web-приложение).
// Параметры PKCE (code_verifier/code_challenge/state) генерирует ФРОНТЕНД,
// а этот эндпоинт отдаёт client_id и redirect_uri для построения authorize URL.
router.get('/vk', (req, res) => {
  if (!process.env.VK_APP_ID) {
    return res.status(500).json({ error: 'VK_APP_ID не настроен' });
  }
  // redirect_uri — на ФРОНТЕНД (GitHub Pages). Не используем FRONTEND_URL,
  // т.к. он в проде localhost. Приоритет за VK_REDIRECT_URI из .env.
  const redirectUri =
    process.env.VK_REDIRECT_URI ||
    'https://hypevaho.github.io/vue-cafe/auth/callback';

  res.json({
    client_id: process.env.VK_APP_ID,
    redirect_uri: redirectUri
  });
});

// Обмен авторизационного кода VK ID на токены + создание/обновление локального пользователя.
// POST /api/auth/vk-exchange  body: { code, code_verifier, device_id, state, redirect_uri }
router.post('/vk-exchange', async (req, res) => {
  try {
    const { code, code_verifier, device_id, state, redirect_uri } = req.body;

    if (!code || !code_verifier || !device_id || !state || !redirect_uri) {
      return res.status(400).json({ error: 'code, code_verifier, device_id, state и redirect_uri обязательны' });
    }

    const clientId = process.env.VK_APP_ID;
    if (!clientId) {
      return res.status(500).json({ error: 'VK_APP_ID не настроен' });
    }

    // 1. Обмен кода на токены (PKCE)
    const tokens = await exchangeCodeForToken({
      clientId,
      code,
      codeVerifier: code_verifier,
      deviceId: device_id,
      redirectUri: redirect_uri,
      state
    });

    // 2. Получение данных пользователя
    const vkUser = await getVkUserInfo(clientId, tokens.access_token);

    const vkId = String(vkUser.user_id ?? tokens.user_id ?? '');

    // 3. Поиск/создание пользователя в БД
    const existingResult = await query(
      'SELECT * FROM users WHERE vk_id = @vkId',
      { vkId }
    );

    let user;

    if (existingResult.recordset.length > 0) {
      await query(
        'UPDATE users SET first_name = @firstName, last_name = @lastName, photo_url = @photoUrl WHERE vk_id = @vkId',
        {
          firstName: vkUser.first_name,
          lastName: vkUser.last_name,
          photoUrl: vkUser.avatar ?? null,
          vkId
        }
      );
      user = existingResult.recordset[0];
    } else {
      const pool = await getPool();
      const insertResult = await pool.request()
        .input('vkId', sql.BigInt, vkId)
        .input('firstName', sql.NVarChar, vkUser.first_name)
        .input('lastName', sql.NVarChar, vkUser.last_name)
        .input('photoUrl', sql.NVarChar, vkUser.avatar ?? null)
        .query(`
          INSERT INTO users (vk_id, first_name, last_name, photo_url)
          OUTPUT INSERTED.id, INSERTED.vk_id, INSERTED.first_name, INSERTED.last_name, INSERTED.photo_url, INSERTED.role
          VALUES (@vkId, @firstName, @lastName, @photoUrl)
        `);

      user = insertResult.recordset[0];
    }

    // 4. JWT для нашего приложения
    const token = jwt.sign(
      { userId: user.id, vkId: user.vk_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        vk_id: user.vk_id,
        first_name: user.first_name,
        last_name: user.last_name,
        photo_url: user.photo_url,
        role: user.role
      }
    });
  } catch (error) {
    console.error('VK ID exchange error:', error.response?.data || error.message);
    const detail = error.vkDescription || error.message || 'Неизвестная ошибка';
    res.status(500).json({ error: 'Ошибка авторизации через VK ID', detail });
  }
});

// VK OAuth callback
router.get('/vk/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=${encodeURIComponent(error_description || error)}`);
  }

  if (!code) {
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_code`);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await axios.get('https://oauth.vk.com/access_token', {
      params: {
        client_id: process.env.VK_APP_ID,
        client_secret: process.env.VK_APP_SECRET,
        redirect_uri: process.env.VK_REDIRECT_URI,
        code
      }
    });

    const { access_token, user_id } = tokenResponse.data;

    // Get user info from VK
    const userResponse = await axios.get('https://api.vk.com/method/users.get', {
      params: {
        user_ids: user_id,
        fields: 'photo_200',
        access_token,
        v: '5.131'
      }
    });

    const vkUser = userResponse.data.response[0];

    // Find or create user in database
    const existingResult = await query(
      'SELECT * FROM users WHERE vk_id = @vkId',
      { vkId: vkUser.id }
    );

    let user;

    if (existingResult.recordset.length > 0) {
      // Update existing user
      await query(
        'UPDATE users SET first_name = @firstName, last_name = @lastName, photo_url = @photoUrl WHERE vk_id = @vkId',
        { 
          firstName: vkUser.first_name, 
          lastName: vkUser.last_name, 
          photoUrl: vkUser.photo_200, 
          vkId: vkUser.id 
        }
      );
      user = existingResult.recordset[0];
    } else {
      // Create new user
      const pool = await getPool();
      const insertResult = await pool.request()
        .input('vkId', sql.BigInt, vkUser.id)
        .input('firstName', sql.NVarChar, vkUser.first_name)
        .input('lastName', sql.NVarChar, vkUser.last_name)
        .input('photoUrl', sql.NVarChar, vkUser.photo_200)
        .query(`
          INSERT INTO users (vk_id, first_name, last_name, photo_url) 
          OUTPUT INSERTED.id, INSERTED.vk_id, INSERTED.first_name, INSERTED.last_name, INSERTED.photo_url, INSERTED.role
          VALUES (@vkId, @firstName, @lastName, @photoUrl)
        `);
      
      user = insertResult.recordset[0];
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, vkId: user.vk_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);

  } catch (error) {
    console.error('VK OAuth error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// Get current user
router.get('/me', authenticate, (req, res) => {
  res.json({
    id: req.user.id,
    vk_id: req.user.vk_id,
    first_name: req.user.first_name,
    last_name: req.user.last_name,
    photo_url: req.user.photo_url,
    role: req.user.role
  });
});

// Logout
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Выход выполнен' });
});

// ============================================================
// VK Implicit Flow — не требует App Secret
// ============================================================
// Фронтенд сам авторизуется в VK (response_type=token), получает
// access_token в URL fragment и отправляет сюда. Мы проверяем токен
// через VK API и выдаём свой JWT.

// Параметры для authorize URL (фронтенд использует для построения ссылки)
router.get('/vk-implicit', (req, res) => {
  if (!process.env.VK_APP_ID) {
    return res.status(500).json({ error: 'VK_APP_ID не настроен' });
  }
  // redirect_uri берём из VK_REDIRECT_URI (он указывает на фронтенд — GitHub Pages),
  // а не из FRONTEND_URL (который в проде localhost).
  const redirectUri =
    process.env.VK_REDIRECT_URI ||
    'https://hypevaho.github.io/vue-cafe/auth/callback';
  res.json({
    client_id: process.env.VK_APP_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'email,photos',
    v: '5.131',
    authorize_url: 'https://oauth.vk.com/authorize'
  });
});

// Обмен access_token (полученного фронтендом) на наш JWT
router.post('/vk-token', async (req, res) => {
  try {
    const { access_token, user_id } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: 'access_token обязателен' });
    }

    // Проверяем токен через VK API
    const vkParams = {
      user_ids: user_id || '',
      fields: 'photo_200',
      access_token,
      v: '5.131'
    };

    const userResponse = await axios.get('https://api.vk.com/method/users.get', {
      params: vkParams
    });

    if (userResponse.data.error) {
      const err = userResponse.data.error;
      return res.status(401).json({
        error: 'Невалидный токен VK',
        detail: err.error_msg
      });
    }

    const vkUser = userResponse.data.response?.[0];
    if (!vkUser) {
      return res.status(401).json({ error: 'Не удалось получить данные пользователя VK' });
    }

    const vkId = String(vkUser.id);

    // Поиск или создание пользователя в БД
    const existingResult = await query(
      'SELECT * FROM users WHERE vk_id = @vkId',
      { vkId }
    );

    let user;

    if (existingResult.recordset.length > 0) {
      await query(
        'UPDATE users SET first_name = @firstName, last_name = @lastName, photo_url = @photoUrl WHERE vk_id = @vkId',
        {
          firstName: vkUser.first_name,
          lastName: vkUser.last_name,
          photoUrl: vkUser.photo_200 ?? null,
          vkId
        }
      );
      user = existingResult.recordset[0];
    } else {
      const pool = await getPool();
      const insertResult = await pool.request()
        .input('vkId', sql.BigInt, vkId)
        .input('firstName', sql.NVarChar, vkUser.first_name)
        .input('lastName', sql.NVarChar, vkUser.last_name)
        .input('photoUrl', sql.NVarChar, vkUser.photo_200 ?? null)
        .query(`
          INSERT INTO users (vk_id, first_name, last_name, photo_url)
          OUTPUT INSERTED.id, INSERTED.vk_id, INSERTED.first_name, INSERTED.last_name, INSERTED.photo_url, INSERTED.role, INSERTED.is_super_admin
          VALUES (@vkId, @firstName, @lastName, @photoUrl)
        `);

      user = insertResult.recordset[0];
    }

    // JWT
    const token = jwt.sign(
      {
        userId: user.id,
        vkId: user.vk_id,
        role: user.role,
        is_super_admin: !!user.is_super_admin
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        vk_id: user.vk_id,
        first_name: user.first_name,
        last_name: user.last_name,
        photo_url: user.photo_url,
        role: user.role,
        is_super_admin: !!user.is_super_admin
      }
    });
  } catch (error) {
    console.error('VK token exchange error:', error.response?.data || error.message);
    const detail = error.response?.data?.error?.error_msg || error.message || 'Неизвестная ошибка';
    res.status(500).json({ error: 'Ошибка авторизации через VK', detail });
  }
});

export default router;
