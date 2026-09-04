import { Router } from 'express';
import { query, getPool, sql } from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { isBaker, isAdmin } from '../middleware/roles.js';
import { sendOrderNotification, notifyBakersAboutNewOrder } from '../services/vkNotifications.js';

const router = Router();

// Status flow: new -> preparing -> ready -> completed
const STATUS_FLOW = {
  new: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

const STATUS_LABELS = {
  new: 'Новый',
  preparing: 'Готовится',
  ready: 'Готов',
  completed: 'Выдан',
  cancelled: 'Отменён'
};

// Get orders
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let queryStr = '';
    const params = {
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    if (req.user.role === 'customer') {
      // Customers see only their orders
      queryStr = `
        SELECT o.*, u.first_name, u.last_name
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE o.user_id = @userId
      `;
      params.userId = req.user.id;
    } else {
      // Bakers and admins see all orders
      queryStr = `
        SELECT o.*, u.first_name, u.last_name, u.vk_id
        FROM orders o
        JOIN users u ON o.user_id = u.id
        WHERE 1=1
      `;
    }

    if (status) {
      queryStr += ' AND o.status = @status';
      params.status = status;
    }

    queryStr += ' ORDER BY o.created_at DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';

    const result = await query(queryStr, params);
    const orders = result.recordset;

    // Get items for each order
    for (const order of orders) {
      const itemsResult = await query(
        'SELECT * FROM order_items WHERE order_id = @orderId',
        { orderId: order.id }
      );
      order.items = itemsResult.recordset;
    }

    res.json(orders);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Ошибка получения заказов' });
  }
});

// Get single order
router.get('/:id', authenticate, async (req, res) => {
  try {
    let queryStr = `
      SELECT o.*, u.first_name, u.last_name, u.vk_id
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = @id
    `;
    const params = { id: parseInt(req.params.id) };

    // Customers can only see their own orders
    if (req.user.role === 'customer') {
      queryStr += ' AND o.user_id = @userId';
      params.userId = req.user.id;
    }

    const result = await query(queryStr, params);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const order = result.recordset[0];

    // Get order items
    const itemsResult = await query(
      'SELECT * FROM order_items WHERE order_id = @orderId',
      { orderId: order.id }
    );
    order.items = itemsResult.recordset;

    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Ошибка получения заказа' });
  }
});

// Create order
router.post('/', authenticate, async (req, res) => {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();

    const { items, comment } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Заказ должен содержать хотя бы один товар' });
    }

    // Get product details
    const productIds = items.map(item => item.product_id);
    const placeholders = productIds.map((_, i) => `@p${i}`).join(',');
    
    const productsRequest = new sql.Request(transaction);
    productIds.forEach((id, i) => productsRequest.input(`p${i}`, sql.Int, id));
    const productsResult = await productsRequest.query(
      `SELECT id, name, price, is_available FROM products WHERE id IN (${placeholders})`
    );

    const productMap = new Map(productsResult.recordset.map(p => [p.id, p]));

    // Validate all products exist and are available
    let total = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = productMap.get(item.product_id);
      
      if (!product) {
        await transaction.rollback();
        return res.status(400).json({ error: `Продукт с ID ${item.product_id} не найден` });
      }

      if (!product.is_available) {
        await transaction.rollback();
        return res.status(400).json({ error: `Продукт "${product.name}" недоступен` });
      }

      const quantity = parseInt(item.quantity) || 1;
      if (quantity < 1) {
        await transaction.rollback();
        return res.status(400).json({ error: 'Количество должно быть больше 0' });
      }

      const itemTotal = parseFloat(product.price) * quantity;
      total += itemTotal;

      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        price: product.price
      });
    }

    // Create order
    const orderRequest = new sql.Request(transaction);
    const orderResult = await orderRequest
      .input('userId', sql.Int, req.user.id)
      .input('total', sql.Decimal(10, 2), total)
      .input('comment', sql.NVarChar, comment || null)
      .query(`
        INSERT INTO orders (user_id, total, comment)
        OUTPUT INSERTED.id
        VALUES (@userId, @total, @comment)
      `);

    const orderId = orderResult.recordset[0].id;

    // Create order items
    for (const item of validatedItems) {
      const itemRequest = new sql.Request(transaction);
      await itemRequest
        .input('orderId', sql.Int, orderId)
        .input('productId', sql.Int, item.product_id)
        .input('productName', sql.NVarChar, item.product_name)
        .input('quantity', sql.Int, item.quantity)
        .input('price', sql.Decimal(10, 2), item.price)
        .query(`
          INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
          VALUES (@orderId, @productId, @productName, @quantity, @price)
        `);
    }

    await transaction.commit();

    // Fetch created order
    const newOrderResult = await query('SELECT * FROM orders WHERE id = @id', { id: orderId });
    const order = newOrderResult.recordset[0];
    order.items = validatedItems;

    res.status(201).json(order);

    // Уведомляем пекарей о новом заказе (фон, не блокирует ответ клиенту)
    notifyBakersAboutNewOrder(order.id, order.total, order.items?.length || 0)
      .catch((e) => console.error('Baker notify error:', e.message));
  } catch (error) {
    await transaction.rollback();
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Ошибка создания заказа' });
  }
});

// Update order status (baker/admin only)
router.patch('/:id/status', authenticate, isBaker, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !STATUS_LABELS[status]) {
      return res.status(400).json({ error: 'Неверный статус' });
    }

    // Get current order
    const orderResult = await query(
      `SELECT o.*, u.vk_id, u.first_name
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = @id`,
      { id: parseInt(req.params.id) }
    );

    if (orderResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }

    const order = orderResult.recordset[0];
    const allowedStatuses = STATUS_FLOW[order.status];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Нельзя изменить статус с "${STATUS_LABELS[order.status]}" на "${STATUS_LABELS[status]}"`,
        allowed: allowedStatuses.map(s => ({ value: s, label: STATUS_LABELS[s] }))
      });
    }

    // Update status
    await query(
      'UPDATE orders SET status = @status, updated_at = GETDATE() WHERE id = @id',
      { status, id: parseInt(req.params.id) }
    );

    // Send VK notification
    try {
      await sendOrderNotification(order.vk_id, order.id, status, STATUS_LABELS[status]);
    } catch (notifError) {
      console.error('VK notification error:', notifError);
    }

    const updatedResult = await query('SELECT * FROM orders WHERE id = @id', { id: parseInt(req.params.id) });
    const updated = updatedResult.recordset[0];
    updated.status_label = STATUS_LABELS[status];

    res.json(updated);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

// Delete order (admin only) — полное управление заказами
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await query('SELECT id, status FROM orders WHERE id = @id', { id });
    if (existing.recordset.length === 0) {
      return res.status(404).json({ error: 'Заказ не найден' });
    }
    // Новые заказы нельзя удалять молча — сначала отмените
    if (existing.recordset[0].status === 'new') {
      return res.status(400).json({ error: 'Нельзя удалить новый заказ — сначала отмените его' });
    }

    await query('DELETE FROM order_items WHERE order_id = @id', { id });
    await query('DELETE FROM orders WHERE id = @id', { id });

    res.json({ message: 'Заказ удалён' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ error: 'Ошибка удаления заказа' });
  }
});

// Get order statuses reference
router.get('/meta/statuses', (req, res) => {
  res.json({
    statuses: STATUS_LABELS,
    flow: STATUS_FLOW
  });
});

export default router;
