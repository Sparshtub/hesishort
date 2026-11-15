# SnapLink — High-Throughput URL Shortener & Analytics Engine

> A high-performance RESTful link shortening and telemetry ingestion microservice built with **Node.js, TypeScript, Express, MySQL, Redis, and Next.js**.

---

## ⚡ System Architecture

```text
                                    +-----------------------+
                                    |   Client / Browser    |
                                    +-----------+-----------+
                                                |
                 +------------------------------+-------------------------------+
                 | POST /api/shorten                                            | GET /:code
                 v                                                              v
+---------------------------------+                            +---------------------------------+
|     Express Rate Limiter        |                            |       Redis Cache Check         |
|   (Sliding Window INCR+EXPIRE)  |                            |        (GET url:<code >)        |
+----------------+----------------+                            +--------+---------------+--------+
                 |                                                      | Hit           | Miss
                 v                                                      |               v
+---------------------------------+                                     |     +-------------------+
|     Insert into MySQL           |                                     |     | Query MySQL Table |
|   (ID -> Base62 Short Code)     |                                     |     +---------+---------+
+----------------+----------------+                                     |               |
                 |                                                      |               v
                 v                                                      |     +-------------------+
+---------------------------------+                                     |     | SETEX into Redis  |
| Warm Redis Cache (SETEX 24h)    |                                     |     +---------+---------+
+---------------------------------+                                     |               |
                                                                        +-------+-------+
                                                                                |
                                                  +-----------------------------+-----------------------------+
                                                  | 302 Redirect                                              | Async Telemetry
                                                  v                                                           v
                                         +------------------+                                        +-----------------+
                                         | Target Long URL  |                                        | LPUSH to Redis  |
                                         +------------------+                                        |  clicks_queue   |
                                                                                                     +--------+--------+
                                                                                                              |
                                                                                            Worker (10s)      v
                                                                                            +---------------------------------+
                                                                                            |  Batch Pop (RPOP 100 items)     |
                                                                                            |  Bulk INSERT into MySQL         |
                                                                                            +---------------------------------+
```

---

## 🚀 Key Features

1. **Collision-Free Base62 Encoding:**
   - Auto-incrementing MySQL IDs are converted to Base62 (`0-9a-zA-Z`).
   - Offset starting at `100,000` guarantees compact short codes (4+ chars) without hash collisions.
2. **Sub-10ms Redirects with Cache-Aside:**
   - Redirect lookups (`GET /:code`) hit Redis in-memory key-value cache first.
   - On cache miss, loads from MySQL and populates Redis with a 24-hour TTL (`SETEX`).
3. **Asynchronous Batch Telemetry Ingestion:**
   - `GET /:code` writes click metadata directly to an in-memory Redis list (`LPUSH clicks_queue`).
   - Decoupled background worker pops up to 100 events every 10 seconds and executes a single multi-row `INSERT` into MySQL.
4. **Sliding-Window Redis Rate Limiter:**
   - Prevents link generation abuse by enforcing a 20 requests/min throttle per client IP using `INCR` + `EXPIRE`.
   - Sends standard HTTP 429 headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`).
5. **Next.js & Recharts Dashboard:**
   - Visualizes click trends over time, browser distributions, and top referrers.

---

## 🛠️ Quick Start (Local Setup)

### 1. Prerequisites
- Docker & Docker Compose **or** local MySQL & Redis.
- Node.js v18+ & npm.

### 2. Start MySQL and Redis containers
```bash
docker compose up -d
```

### 3. Install Dependencies & Start Server
```bash
npm install
cp .env.example .env
npm run dev
```

The API will start on **`http://localhost:4000`**.

---

## 📡 API Reference

### 1. Shorten URL
```http
POST /api/shorten
Content-Type: application/json

{
  "url": "https://google.com/search?q=system+design",
  "customAlias": "sys-design",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```
**Response (201 Created):**
```json
{
  "shortUrl": "http://localhost:4000/sys-design",
  "shortCode": "sys-design",
  "originalUrl": "https://google.com/search?q=system+design",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

### 2. Redirect to Original URL
```http
GET /:code
```
**Response:** `HTTP 302 Found` with `Location: <original_url>` and `X-Cache: HIT | MISS`.

### 3. Get Telemetry Analytics
```http
GET /api/analytics/:code
```
**Response (200 OK):**
```json
{
  "url": {
    "shortCode": "sys-design",
    "originalUrl": "https://google.com/search?q=system+design",
    "createdAt": "2026-11-15T10:00:00.000Z",
    "expiresAt": null
  },
  "totalClicks": 1420,
  "clicksPerDay": [
    { "date": "2026-11-15", "clicks": 1420 }
  ],
  "browserBreakdown": [
    { "browser": "Chrome", "count": 920 },
    { "browser": "Safari", "count": 350 },
    { "browser": "Firefox", "count": 150 }
  ]
}
```

---

## 🧪 Load Testing (Benchmarking for CV)

Run Autocannon against a cached redirect route to record actual latency and throughput:

```bash
# Test with 50 concurrent connections for 10 seconds
npx autocannon -c 50 -d 10 http://localhost:4000/sys-design
```

### Expected CV Numbers:
- **Throughput:** `500 - 1,200 req/sec` (depending on machine)
- **Latency:** `2 - 8 ms` (p95)
- **Zero Database I/O** during redirect queries due to Redis cache-aside hit rate.

---

## 🌐 Free Cloud Deployment

1. **Database:** Create a free MySQL database on [Aiven](https://aiven.io/) or [TiDB Serverless](https://tidb.cloud/). Run `sql/schema.sql`.
2. **Cache:** Create a free Redis instance on [Upstash](https://upstash.com/) and copy the `rediss://...` connection string.
3. **Backend:** Deploy `snaplink` onto [Render](https://render.com/) as a Node Web Service, adding the environment variables from `.env`.
