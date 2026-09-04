import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { isAdmin } from '../middleware/roles.js';

const router = Router();

// Sales statistics (admin only)
router.get('/sales', authenticate, isAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);

    // Total sales and orders
    const totalsResult = await query(`
      SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
        ISNULL(SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END), 0) as total_revenue,
        AVG(CASE WHEN status = 'completed' THEN total ELSE NULL END) as avg_order_value
      FROM orders
      WHERE created_at >= DATEADD(DAY, -@days, GETDATE())
    `, { days });

    // Daily sales for the period
    const dailySalesResult = await query(`
      SELECT 
        CONVERT(DATE, created_at) as date,
        COUNT(*) as orders,
        ISNULL(SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END), 0) as revenue
      FROM orders
      WHERE created_at >= DATEADD(DAY, -@days, GETDATE())
      GROUP BY CONVERT(DATE, created_at)
      ORDER BY date
    `, { days });

    // Orders by status
    const byStatusResult = await query(`
      SELECT status, COUNT(*) as count
      FROM orders
      WHERE created_at >= DATEADD(DAY, -@days, GETDATE())
      GROUP BY status
    `, { days });

    res.json({
      period_days: days,
      totals: totalsResult.recordset[0],
      daily: dailySalesResult.recordset,
      by_status: byStatusResult.recordset
    });
  } catch (error) {
    console.error('Get sales analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения аналитики продаж' });
  }
});

// Popular products (admin only)
router.get('/popular', authenticate, isAdmin, async (req, res) => {
  try {
    const { limit = 10, period = '30' } = req.query;
    const days = parseInt(period);

    const popularResult = await query(`
      SELECT TOP(@limit)
        oi.product_id,
        oi.product_name,
        p.price as current_price,
        p.is_available,
        c.name as category_name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.quantity * oi.price) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE o.status = 'completed'
        AND o.created_at >= DATEADD(DAY, -@days, GETDATE())
      GROUP BY oi.product_id, oi.product_name, p.price, p.is_available, c.name
      ORDER BY total_sold DESC
    `, { days, limit: parseInt(limit) });

    res.json({
      period_days: days,
      products: popularResult.recordset
    });
  } catch (error) {
    console.error('Get popular products error:', error);
    res.status(500).json({ error: 'Ошибка получения популярных товаров' });
  }
});

// Orders statistics (admin only)
router.get('/orders', authenticate, isAdmin, async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);

    // Orders by hour of day
    const byHourResult = await query(`
      SELECT 
        DATEPART(HOUR, created_at) as hour,
        COUNT(*) as orders
      FROM orders
      WHERE created_at >= DATEADD(DAY, -@days, GETDATE())
      GROUP BY DATEPART(HOUR, created_at)
      ORDER BY hour
    `, { days });

    // Orders by day of week
    const byDayOfWeekResult = await query(`
      SELECT 
        DATEPART(WEEKDAY, created_at) as day_of_week,
        COUNT(*) as orders
      FROM orders
      WHERE created_at >= DATEADD(DAY, -@days, GETDATE())
      GROUP BY DATEPART(WEEKDAY, created_at)
      ORDER BY day_of_week
    `, { days });

    // New customers
    const newCustomersResult = await query(`
      SELECT COUNT(*) as count
      FROM users
      WHERE role = 'customer'
        AND created_at >= DATEADD(DAY, -@days, GETDATE())
    `, { days });

    // Repeat customers
    const repeatCustomersResult = await query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM orders
      WHERE created_at >= DATEADD(DAY, -@days, GETDATE())
        AND user_id IN (
          SELECT user_id FROM orders
          WHERE created_at < DATEADD(DAY, -@days, GETDATE())
        )
    `, { days });

    res.json({
      period_days: days,
      by_hour: byHourResult.recordset,
      by_day_of_week: byDayOfWeekResult.recordset,
      new_customers: newCustomersResult.recordset[0].count,
      repeat_customers: repeatCustomersResult.recordset[0].count
    });
  } catch (error) {
    console.error('Get orders analytics error:', error);
    res.status(500).json({ error: 'Ошибка получения аналитики заказов' });
  }
});

// Dashboard summary (admin only)
router.get('/dashboard', authenticate, isAdmin, async (req, res) => {
  try {
    // Today's stats
    const todayResult = await query(`
      SELECT 
        COUNT(*) as orders_today,
        ISNULL(SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END), 0) as revenue_today,
        SUM(CASE WHEN status IN ('new', 'preparing') THEN 1 ELSE 0 END) as pending_orders
      FROM orders
      WHERE CONVERT(DATE, created_at) = CONVERT(DATE, GETDATE())
    `);

    // Active orders (need attention)
    const activeOrdersResult = await query(`
      SELECT COUNT(*) as count
      FROM orders
      WHERE status IN ('new', 'preparing', 'ready')
    `);

    // Total users
    const usersResult = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN role = 'customer' THEN 1 ELSE 0 END) as customers,
        SUM(CASE WHEN role = 'baker' THEN 1 ELSE 0 END) as bakers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins
      FROM users
    `);

    // Products stats
    const productsResult = await query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_available = 1 THEN 1 ELSE 0 END) as available
      FROM products
    `);

    res.json({
      today: todayResult.recordset[0],
      active_orders: activeOrdersResult.recordset[0].count,
      users: usersResult.recordset[0],
      products: productsResult.recordset[0]
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Ошибка получения дашборда' });
  }
});

export default router;
