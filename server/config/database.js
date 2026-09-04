import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load server/.env relative to THIS module (not the CWD), so the server
// works no matter where node is launched from.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const config = {
  server: process.env.MSSQL_SERVER,
  port: parseInt(process.env.MSSQL_PORT) || 1433,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  options: {
    encrypt: false, // Set to true if using Azure
    trustServerCertificate: true, // For local development
    enableArithAbort: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let pool = null;

export async function getPool() {
  if (!pool) {
    pool = await sql.connect(config);
  }
  return pool;
}

export async function testConnection() {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT 1 as test');
    console.log('SQL Server connected successfully');
    return true;
  } catch (error) {
    console.error('SQL Server connection failed:', error.message);
    return false;
  }
}

export async function query(queryString, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  
  // Add parameters
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }
  
  return request.query(queryString);
}

export { sql };
export default { getPool, testConnection, query, sql };
