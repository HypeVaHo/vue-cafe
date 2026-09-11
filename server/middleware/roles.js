// Role-based access control middleware.
//
// Модель доступа:
//   customer      — покупатель (без админ-доступа)
//   admin         — админ; права настраиваются главным админом (permissions JSON)
//   is_super_admin — главный админ (полный доступ всегда)
//
// permissions — NVARCHAR(MAX) в таблице users: JSON-массив разделов,
//   например ["products","orders"]. NULL = полный доступ (все разделы).

export const PERMISSIONS = ['products', 'categories', 'orders', 'users', 'analytics'];

// Есть ли у пользователя доступ к разделу (учитывая super admin и NULL = все права)
export function hasPermission(user, perm) {
  if (!user) return false;
  if (user.is_super_admin) return true;
  if (user.role !== 'admin') return false;
  // permissions не задан (NULL) — полный доступ
  if (user.permissions == null) return true;
  let list = user.permissions;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(list)) return false;
  return list.includes(perm);
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    next();
  };
}

// Доступ к разделу админ-панели (права настраивает главный админ)
export function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    if (!hasPermission(req.user, perm)) {
      return res.status(403).json({ error: 'Недостаточно прав (раздел не разрешён главным админом)' });
    }
    next();
  };
}

// Только главный админ (is_super_admin = 1)
export function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  if (!req.user.is_super_admin) {
    return res.status(403).json({ error: 'Доступно только главному админу' });
  }
  next();
}

// Shorthand middleware for common role checks
export const isAdmin = requireRole('admin');
export const isBaker = requireRole('baker', 'admin');
export const isCustomer = requireRole('customer', 'baker', 'admin');

