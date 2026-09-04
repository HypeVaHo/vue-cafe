import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get fresh user data from database
    const result = await query(
      'SELECT id, vk_id, first_name, last_name, photo_url, role, is_super_admin FROM users WHERE id = @userId',
      { userId: decoded.userId }
    );

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    req.user = result.recordset[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Токен истек' });
    }
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

// Optional auth - doesn't fail if no token, but attaches user if present
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await query(
      'SELECT id, vk_id, first_name, last_name, photo_url, role FROM users WHERE id = @userId',
      { userId: decoded.userId }
    );

    if (result.recordset.length > 0) {
      req.user = result.recordset[0];
    }
  } catch (error) {
    // Ignore token errors for optional auth
  }
  
  next();
}
