// Role-based access control middleware

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
