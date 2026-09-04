import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';

// Load server/.env relative to THIS module, regardless of CWD.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  server: process.env.MSSQL_SERVER,
  port: parseInt(process.env.MSSQL_PORT) || 1433,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

const databaseName = process.env.MSSQL_DATABASE || 'spo_bakery';

async function runMigrations() {
  let pool;
  
  try {
    console.log('Connecting to SQL Server 2022...');
    pool = await sql.connect(config);
    
    // Create database if not exists
    console.log(`Creating database ${databaseName} if not exists...`);
    await pool.request().query(`
      IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '${databaseName}')
      BEGIN
        CREATE DATABASE [${databaseName}]
      END
    `);
    
    // Switch to the database
    await pool.close();
    config.database = databaseName;
    pool = await sql.connect(config);
    
    console.log('Running migrations...');
    
    // Create Users table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
      CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        vk_id BIGINT UNIQUE NOT NULL,
        first_name NVARCHAR(100),
        last_name NVARCHAR(100),
        photo_url NVARCHAR(500),
        role NVARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer', 'baker', 'admin')),
        created_at DATETIME2 DEFAULT GETDATE()
      )
    `);
    
    // Create indexes for users
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_vk_id')
        CREATE INDEX idx_users_vk_id ON users(vk_id);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_role')
        CREATE INDEX idx_users_role ON users(role);
    `);
    
    // Create Categories table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='categories' AND xtype='U')
      CREATE TABLE categories (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        slug NVARCHAR(100) UNIQUE NOT NULL,
        icon NVARCHAR(10) DEFAULT N'🥐',
        sort_order INT DEFAULT 0
      )
    `);
    
    // Create Products table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='products' AND xtype='U')
      CREATE TABLE products (
        id INT IDENTITY(1,1) PRIMARY KEY,
        category_id INT FOREIGN KEY REFERENCES categories(id) ON DELETE SET NULL,
        name NVARCHAR(200) NOT NULL,
        subtitle NVARCHAR(200),
        description NVARCHAR(MAX),
        price DECIMAL(10,2) NOT NULL,
        icon NVARCHAR(10) DEFAULT N'🥐',
        image_url NVARCHAR(500),
        is_popular BIT DEFAULT 0,
        is_available BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT GETDATE()
      )
    `);
    
    // Create indexes for products
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_products_category')
        CREATE INDEX idx_products_category ON products(category_id);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_products_available')
        CREATE INDEX idx_products_available ON products(is_available);
    `);
    
    // Create Orders table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='orders' AND xtype='U')
      CREATE TABLE orders (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL FOREIGN KEY REFERENCES users(id) ON DELETE CASCADE,
        status NVARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'preparing', 'ready', 'completed', 'cancelled')),
        total DECIMAL(10,2) NOT NULL,
        comment NVARCHAR(MAX),
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
      )
    `);
    
    // Create indexes for orders
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_orders_user')
        CREATE INDEX idx_orders_user ON orders(user_id);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_orders_status')
        CREATE INDEX idx_orders_status ON orders(status);
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_orders_created')
        CREATE INDEX idx_orders_created ON orders(created_at);
    `);
    
    // Create Order Items table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='order_items' AND xtype='U')
      CREATE TABLE order_items (
        id INT IDENTITY(1,1) PRIMARY KEY,
        order_id INT NOT NULL FOREIGN KEY REFERENCES orders(id) ON DELETE CASCADE,
        product_id INT FOREIGN KEY REFERENCES products(id) ON DELETE SET NULL,
        product_name NVARCHAR(200) NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10,2) NOT NULL
      )
    `);
    
    // Create index for order_items
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_order_items_order')
        CREATE INDEX idx_order_items_order ON order_items(order_id);
    `);
    
    // Create trigger for updating updated_at on orders
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.triggers WHERE name = 'trg_orders_update')
      BEGIN
        EXEC('
          CREATE TRIGGER trg_orders_update ON orders
          AFTER UPDATE AS
          BEGIN
            SET NOCOUNT ON;
            UPDATE orders SET updated_at = GETDATE()
            FROM orders INNER JOIN inserted ON orders.id = inserted.id
          END
        ')
      END
    `);
    
    console.log('Database tables created successfully!');
    
    // Insert seed data - Categories (with real data from bakeryStore)
    console.log('Inserting seed data...');
    
    // Check if categories already exist
    const existingCategories = await pool.request().query('SELECT COUNT(*) as count FROM categories');
    
    if (existingCategories.recordset[0].count === 0) {
      await pool.request().query(`
        SET IDENTITY_INSERT categories ON;
        INSERT INTO categories (id, name, slug, icon, sort_order) VALUES
          (1, N'Пирожки', 'pirozhki', N'🥟', 1),
          (2, N'Слойки', 'sloyki', N'🥐', 2),
          (3, N'Булочки', 'bulochki', N'🥯', 3),
          (4, N'Пирожные', 'pirozhnye', N'🍰', 4),
          (5, N'Напитки', 'napitki', N'☕', 5);
        SET IDENTITY_INSERT categories OFF;
      `);
      console.log('  - Categories inserted');
    }
    
    // Check if products already exist
    const existingProducts = await pool.request().query('SELECT COUNT(*) as count FROM products');
    
    if (existingProducts.recordset[0].count === 0) {
      await pool.request().query(`
        SET IDENTITY_INSERT products ON;
        INSERT INTO products (id, category_id, name, subtitle, description, price, icon, is_popular, is_available) VALUES
          (1, 2, N'Круассан классический', N'Воздушный и хрустящий', N'Нежный слоёный круассан с ароматом сливочного масла.', 85.00, N'🥐', 1, 1),
          (2, 1, N'Пирожок с картошкой', N'Сытный и домашний', N'Румяный пирожок с картофельной начинкой.', 65.00, N'🥟', 1, 1),
          (3, 2, N'Слойка с яблоком', N'Сладкая и сочная', N'Слойка с яблоком, корицей и карамельной ноткой.', 90.00, N'🍎', 1, 1),
          (4, 3, N'Булочка с корицей', N'Тёплая и ароматная', N'Пышная булочка с корицей и сахарной глазурью.', 75.00, N'🥯', 1, 1),
          (5, 4, N'Эклер ванильный', N'Нежный крем внутри', N'Лёгкое пирожное с ванильным кремом и глазурью.', 110.00, N'🍰', 1, 1),
          (6, 5, N'Морс клюквенный', N'Освежающий напиток', N'Домашний клюквенный морс без лишней сладости.', 60.00, N'🧃', 0, 1),
          (7, 3, N'Плюшка сахарная', N'Мягкая и воздушная', N'Пышная плюшка с сахаром и сливочным ароматом.', 70.00, N'🍞', 0, 1),
          (8, 4, N'Сочник с творогом', N'С нежной начинкой', N'Нежный сочник с творожной начинкой и рассыпчатым тестом.', 95.00, N'🥧', 1, 1),
          (9, 5, N'Чай чёрный', N'Классический горячий чай', N'Крепкий чёрный чай к любой позиции меню.', 45.00, N'☕', 1, 1),
          (10, 1, N'Пирожок с капустой', N'С хрустящей корочкой', N'Сытный пирожок с капустой и пряностями.', 65.00, N'🥟', 0, 1);
        SET IDENTITY_INSERT products OFF;
      `);
      console.log('  - Products inserted');
    }
    
    console.log('\nMigration completed successfully!');
    console.log('Database tables:');
    console.log('  - users');
    console.log('  - categories');
    console.log('  - products');
    console.log('  - orders');
    console.log('  - order_items');
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
    }
  }
}

runMigrations();
