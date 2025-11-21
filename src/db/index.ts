import { Pool } from 'pg';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/order_exec'
});

export async function insertOrder(order: any) {
  await pool.query(
    `INSERT INTO orders (id, payload, status, created_at, attempts)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      order.id,
      order,
      order.status || 'pending',
      order.createdAt,
      order.attempts || 0
    ]
  );
}

export async function updateOrderStatus(
  id: string,
  status: string,
  reason?: string | null,
  txHash?: string | null
) {
  await pool.query(
    `UPDATE orders
       SET status        = $2,
           last_update   = now(),
           failure_reason = $3::text,
           tx_hash        = $4::text
     WHERE id = $1`,
    [id, status, reason ?? null, txHash ?? null]
  );
}

export async function getOrder(id: string) {
  const r = await pool.query(
    `SELECT payload FROM orders WHERE id = $1`,
    [id]
  );
  return r.rows[0]?.payload;
}
