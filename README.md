
# Order Execution Engine (Mock DEX Router + WebSocket Streaming)

A Solana-style **order execution engine** built with Node.js + TypeScript.  

It supports:

- **One order type**: _Market Order_ (immediate execution at best available price)
- HTTP **order submission** via `POST /api/orders/execute`
- **Live status updates** over WebSocket on the same path
- **DEX routing** between simulated Raydium and Meteora pools
- **Queue-based execution** with BullMQ + Redis + retry & backoff
- **Order history** in PostgreSQL


---

## 1. High-Level Overview

### Order Flow

1. **Client submits** a market order via:
   - `POST /api/orders/execute`
2. API:
   - Validates payload
   - Generates `orderId` (UUID)
   - Persists order to PostgreSQL
   - Enqueues job in BullMQ (`orders` queue)
   - Returns `{ orderId, message }`
3. Client opens a **WebSocket** to:
   - `ws://<host>:<port>/api/orders/execute`
   - Sends `{ "orderId": "<order-id>" }` to bind
4. **Worker** picks the job and runs through lifecycle:
   - `pending` → `routing` → `building` → `submitted` → `confirmed` (or `failed`)
   - Each step is streamed to the bound WebSocket connection

### Status Lifecycle

For each order:

- `pending` – WebSocket bound to orderId
- `routing` – fetching Raydium & Meteora quotes
- `building` – building mock transaction / route details
- `submitted` – simulated transaction submission
- `confirmed` – execution successful
  - includes `txHash` and `executedPrice`
- `failed` – after max retries or unrecoverable error
  - includes `reason`

---

## 2. Order Type Choice & Extensibility

### Implemented: **Market Order**

This engine is implemented as a **market order** engine:

> “Execute immediately at the **best available DEX price** for the given token pair.”

The mock DEX router compares Raydium vs Meteora quotes and picks the better execution venue based on price.

### Extending to Other Order Types

- **Limit Order**  
  - Add `limitPrice` to the payload.
  - In the worker, after quoting:
    - If best quote price is *worse* than `limitPrice`, do **not** execute.
    - Keep the order “open” (e.g., status `open`) and re-check periodically or when new quotes arrive.
- **Sniper Order**  
  - Add a `targetMint` / `launchCondition`.
  - Have a separate watcher process that listens for new pool creation / token migration events.
  - When the token/pool appears, enqueue an execution job into the same queue, using the existing routing + execution pipeline.

The core architecture (queue, router, WebSocket streaming) stays the same; only the **conditions that trigger execution** change.

---

## 3. Architecture Overview

### Tech Stack

- **Runtime:** Node.js + TypeScript
- **Web framework:** Fastify + `@fastify/websocket`
- **Queue:** BullMQ + Redis
- **Database:** PostgreSQL
- **Testing:** Jest + ts-jest
- **Mock DEX router:** custom `MockDexRouter` with price variance

### Components

- `src/server.ts`
  - Fastify HTTP + WebSocket server
  - Registers REST routes & WebSocket handler
  - Imports `./queue/worker` so the worker runs in the same process
- `src/routes/orders.ts`
  - `POST /api/orders/execute`
  - Validates payload
  - Inserts order into DB
  - Enqueues order onto BullMQ queue
- `src/ws/wsManager.ts`
  - WebSocket route on `GET /api/orders/execute`
  - Normalizes `orderId` (`<id>` → `id`)
  - Binds sockets to `orderId`
  - Exposes `sendWsStatus(orderId, payload)` used by the worker
- `src/services/dexRouter.ts`
  - `MockDexRouter`
  - `quoteAndRoute(tokenIn, tokenOut, amount)`:
    - Calls `getRaydiumQuote` & `getMeteoraQuote`
    - Picks the better price as `chosen`, other as `other`
  - `executeSwap(dex, order)`:
    - Simulates 2–3s latency
    - Returns `{ txHash: "MOCKTX_...", executedPrice: <number> }`
- `src/queue/index.ts`
  - Exports `orderQueue` and `enqueueOrder(order)`
- `src/queue/worker.ts`
  - BullMQ `Worker` on `orders` queue
  - Applies delays to simulate routing & execution
  - Uses `MockDexRouter` & `updateOrderStatus`
  - Streams statuses via `sendWsStatus`
  - Implements retry with exponential backoff
- `src/db/index.ts`
  - PostgreSQL `Pool`
  - `insertOrder(order)` – insert initial payload and status
  - `updateOrderStatus(id, status, reason?, txHash?)` – update status, `failure_reason`, `tx_hash`
  - `getOrder(id)` – optional retrieval helper
- `src/utils/retryBackoff.ts`
  - `backoffDelay(attempt: number)` – exponential delay per retry
- `tests/`
  - Jest tests for router, queue, DB, WebSocket manager & backoff

---

## 4. Local Development Setup

### Prerequisites

- **Node.js** (>= 18)
- **npm**
- **Docker Desktop** (for PostgreSQL + Redis)
- **Postman** (optional, for manual testing)

### 1. Clone & Install

```bash
git clone https://github.com/pragnitha7/Order-Execution-Engine.git
cd Order-Execution-Engine
npm install
```

### 2. Start Infrastructure (Postgres + Redis)

```bash
docker compose up -d
```

This should start:

- `postgres` on port `5432`
- `redis` on port `6379`

Run migrations:

```bash
docker compose exec postgres   psql -U postgres -d order_exec -f migrations/init.sql
```

> Adjust the command if your compose service name or DB name differs.

### 3. Run the Server (with Worker)

```bash
npm run dev
```

- Fastify HTTP & WS server on `http://localhost:3000`
- Worker is imported inside `src/server.ts`, so **no separate worker process** is needed.

### 4. Example cURL

Create an order (Git Bash):

```bash
curl -X POST http://localhost:3000/api/orders/execute   -H "Content-Type: application/json"   -d '{"tokenIn":"SOL","tokenOut":"USDC","amount":3.0,"slippageTolerance":0.02}'
```

PowerShell:

```powershell
curl.exe -X POST "http://localhost:3000/api/orders/execute" `
  -H "Content-Type: application/json" `
  -d '{"tokenIn":"SOL","tokenOut":"USDC","amount":3.0,"slippageTolerance":0.02}'
```

Then open a WebSocket client (e.g. Postman) and:

- Connect to: `ws://localhost:3000/api/orders/execute`
- Send:

  ```json
  { "orderId": "<order-id-from-post-response>" }
  ```

Watch the full status lifecycle stream in.

---

## 5. Postman Collection

A pre-configured Postman collection is included:

- Path: `postman/OrderExecEngine.postman_collection.json`

This collection contains:

- `Create Order (POST /api/orders/execute)` with correct headers & body.

> Note: Postman currently does not export WebSocket requests reliably,  
> so the WebSocket usage is documented here instead.

To use:

1. Open Postman → **Import**
2. Select `postman/OrderExecEngine.postman_collection.json`
3. Run the **Create Order** request
4. Take the `orderId` and manually bind via a WebSocket request as described above.

---

## 6. Testing

### Run Test Suite

```bash
npm test
```

The Jest suite covers:

- **Routing logic**
  - `MockDexRouter` – ensures both Raydium & Meteora are queried and that the better price is chosen as `chosen`.
- **Queue behaviour**
  - `enqueueOrder` – verifies jobs are added to the BullMQ `orders` queue with correct options.
- **Database updates**
  - `updateOrderStatus` – confirms SQL parameters for `confirmed`, `failed`, and intermediate statuses and correct handling of `tx_hash` / `failure_reason`.
- **WebSocket lifecycle**
  - Internal ws manager tests – check `orderId` normalization (`<id>` → `id`) and message sending to bound connections.
- **Retry/backoff**
  - `backoffDelay` – validates exponential backoff pattern.

Total tests: **≥ 10**, covering router, queue, DB, WebSocket and retry logic, as required.

---


## 7. API Reference

### 7.1 Create Order (HTTP)

**Endpoint**

```http
POST /api/orders/execute
Content-Type: application/json
```

**Request Body**

```json
{
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amount": 3.0,
  "slippageTolerance": 0.02
}
```

- `tokenIn` – input token symbol (mock)
- `tokenOut` – output token symbol (mock)
- `amount` – amount of `tokenIn`
- `slippageTolerance` – max acceptable slippage (e.g. `0.02` = 2%)

**Response (example)**

```json
{
  "orderId": "9df1f33a-d7f9-4e5f-a41d-9935979666aa",
  "message": "Open websocket to /api/orders/execute and send { "orderId": "<id>" } to bind for live updates"
}
```

> Note: When binding WebSocket, use the raw ID, e.g.  
> `9df1f33a-d7f9-4e5f-a41d-9935979666aa` (no `< >` around it).

---

### 7.2 WebSocket: Order Status Streaming

**WebSocket URL**

```text
ws://localhost:3000/api/orders/execute
```

**Binding to an order**

After connecting:

```json
{ "orderId": "9df1f33a-d7f9-4e5f-a41d-9935979666aa" }
```

(or include `?orderId=...` as a query parameter when connecting)

**Status Messages (examples)**

```json
{
  "orderId": "9df1f33a-d7f9-4e5f-a41d-9935979666aa",
  "status": "pending",
  "meta": { "bound": true },
  "ts": "2025-11-20T09:00:29.987Z"
}
```

```json
{
  "orderId": "9df1f33a-d7f9-4e5f-a41d-9935979666aa",
  "status": "routing",
  "meta": { "step": "fetching quotes" },
  "ts": "..."
}
```

```json
{
  "orderId": "9df1f33a-d7f9-4e5f-a41d-9935979666aa",
  "status": "building",
  "meta": { "route": { "chosen": { "price": 10 }, "other": { "price": 12 }, "decision": "Raydium cheaper" } },
  "ts": "..."
}
```

```json
{
  "orderId": "9df1f33a-d7f9-4e5f-a41d-9935979666aa",
  "status": "submitted",
  "meta": { "dex": "Raydium" },
  "ts": "..."
}
```

```json
{
  "orderId": "9df1f33a-d7f9-4e5f-a41d-9935979666aa",
  "status": "confirmed",
  "meta": {
    "txHash": "MOCKTX_68c27a78fbef4e6381910ffc",
    "executedPrice": 3.389882192400796
  },
  "ts": "..."
}
```

Or, in failure cases:

```json
{
  "orderId": "9df1f33a-d7f9-4e5f-a41d-9935979666aa",
  "status": "failed",
  "meta": { "reason": "error message here" },
  "ts": "..."
}
```

---

## 8. DEX Routing Logic

The routing is implemented via a `MockDexRouter`:

- `getRaydiumQuote(tokenIn, tokenOut, amount)`
  - Simulates ~200ms delay
  - Returns `{ price, fee }` with randomness in a small band
- `getMeteoraQuote(...)`
  - Same pattern, different variance
- `quoteAndRoute(...)`
  - Calls both `getRaydiumQuote` and `getMeteoraQuote`
  - Chooses the **better price** as `chosen`
    - In this implementation, “better” is the **lower** price (cheaper cost)
  - Returns:
    ```ts
    {
      chosen: { dex, price, fee, liquidity },
      other: { dex, price, fee, liquidity },
      decision: string
    }
    ```
- `executeSwap(dex, order)`
  - Simulates 2–3 seconds of execution latency
  - Returns `{ txHash: "MOCKTX_...", executedPrice }`
  - The worker uses this to set status `confirmed`

Routing decisions are logged to the console so you can see which DEX was chosen during tests / demo.

---

## 9. Queue, Concurrency & Retry

### Queue

- Uses **BullMQ** with Redis.
- Queue name: `"orders"`
- Each HTTP request enqueues a job:
  - Name: `"execute"`
  - Data: order payload `{ id, tokenIn, tokenOut, amount, slippageTolerance, ... }`
  - Options:
    - `attempts: 3`
    - `backoff: { type: 'exponential', delay: 500 }`
    - `removeOnComplete: true`
    - `removeOnFail: false`

### Worker

- `src/queue/worker.ts`:
  - `concurrency: 10`
  - Simulates initial “routing delay” to allow the client to bind WebSocket
  - Emits statuses in sequence with small delays between them
- On error:
  - If `attemptsMade < 3`:
    - Sends WebSocket status with `pending` + retry meta
    - Let BullMQ handle retry using `backoffDelay`
  - If attempts exhausted:
    - Marks order as `failed` in DB
    - Sends WebSocket `failed` with reason

---

## 10. Database Schema & Persistence

PostgreSQL is used to persist order history.

The DB connection is configured via:

```ts
connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5432/order_exec'
```

A minimal `orders` table looks like:

```sql
CREATE TABLE IF NOT EXISTS orders (
  id             UUID PRIMARY KEY,
  payload        JSONB NOT NULL,
  status         TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now(),
  last_update    TIMESTAMPTZ DEFAULT now(),
  attempts       INTEGER DEFAULT 0,
  failure_reason TEXT,
  tx_hash        TEXT
);
```

You can run the migration with something like:

```bash
docker compose exec postgres   psql -U postgres -d order_exec -f migrations/init.sql
```

(DB setup may vary slightly depending on your local Docker configuration.)

---


## 11. Summary

This project demonstrates:

- Solid **backend architecture** for an order execution engine
- **DEX routing** abstraction (Raydium vs Meteora)
- **Queue-based concurrency** with retries & backoff
- **Real-time WebSocket streaming** of order lifecycle
- **Persistent state** in PostgreSQL
- **Automated tests** covering core behaviours

Ready to be extended to real Solana devnet execution, multiple order types, and more advanced routing strategies.
