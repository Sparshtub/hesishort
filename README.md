<p align="center">
  <img src="public/logo.svg" alt="HesiShort Logo" width="88" height="88" />
</p>

<h1 align="center">HesiShort</h1>
<p align="center"><strong>High-Throughput URL Shortener & Telemetry Engine</strong></p>
<p align="center"><em>Engineered with Node.js, TypeScript, Express, Redis (Upstash), MySQL (TiDB Cloud), Tailwind CSS, Next.js / Vanilla Dashboard, and Figma Design System Tokens</em></p>

<p align="center">
  <a href="https://hesishort.onrender.com/">🚀 <strong>Live Production Demo</strong></a> &bull;
  <a href="https://github.com/Sparshtub/hesishort">📦 <strong>GitHub Repo</strong></a> &bull;
  <a href="https://hesishort.onrender.com/health">🩺 <strong>Health Check</strong></a>
</p>

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
|   True Sliding-Window Limiter   |                            |       Redis Cache Check         |
|  (Redis Sorted Sets ZSET Log)   |                            |        (GET url:<code >)        |
+----------------+----------------+                            +--------+---------------+--------+
                 |                                                      | Hit           | Miss
                 v                                                      |               v
+---------------------------------+                                     |     +-------------------+
|     Insert into MySQL           |                                     |     | Query MySQL Table |
|   (ID -> Base62 Short Code)     |                                     |     +---------+---------+
+----------------+----------------+                                     |               |
                 |                                                      |               v
                 v                                                      |     +-------------------+
+---------------------------------+                                     |     | Expiry-Aware SETEX|
| Warm Cache min(24h, remaining)  |                                     |     | min(24h,remaining)|
+---------------------------------+                                     |     +---------+---------+
                                                                        |               |
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
                                                                                    Durable Worker (10s)      v
                                                                                    +---------------------------------+
                                                                                    | RPOPLPUSH to clicks_processing  |
                                                                                    | Bulk Multi-row INSERT to MySQL  |
                                                                                    | LTRIM / ACK on Transaction Commit
                                                                                    +---------------------------------+
```

---

## 🚀 Key Engineering Implementations & Trade-Offs

### 1. True Sliding-Window Rate Limiter (Redis Sorted Sets)
* **Problem with `INCR` + `EXPIRE`:** Fixed-window limiters allow "boundary burst" attacks (a client can send 20 requests at second 59 and 20 more at second 60, doubling the allowed rate).
* **Implementation:** Uses a Redis Sorted Set (`ZSET`) where each member is a unique request scored by its epoch timestamp (`now`). It prunes stale entries with `ZREMRANGEBYSCORE (0, now - 60s)`, counts current items with `ZCARD`, and enforces strict sliding bounds.
* **Header Support:** Emits standard `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and exact calculated `Retry-After` (in seconds until the oldest request leaves the sliding window).

### 2. Base62 ID Encoding & Custom Alias Collision Guard
* **Auto-Generated Keys:** Auto-incrementing database IDs are converted into Base62 (`0-9a-zA-Z`). Offset at `100,000` guarantees compact short codes (4+ chars).
* **Collision Resolution:** While auto-increment IDs are mutually unique, custom aliases share the namespace. If an auto-generated Base62 code collides with a previously registered custom alias, an active collision check triggers a deterministic fallback salt to guarantee unique key persistence.
* **Enumeration Trade-off:** Sequential IDs allow $O(1)$ zero-coordination generation, but allow sequence enumeration (`/q0U`, `/q0V`, `/q0W`). For privacy-sensitive deployments, reversible Feistel ciphers (e.g. Skip32) or cryptographically random nanoid tokens can be swapped in.

### 3. Expiry-Aware Cache-Aside TTL
* **Problem:** Setting a naive fixed 24-hour cache TTL causes Redis to serve links after their database `expires_at` has passed.
* **Implementation:** Dynamically calculates `TTL = min(24h, remaining_seconds_until_expiry)`. If a link has expired or has $\le 0$ seconds remaining, cache writes are omitted and HTTP 410 Gone is returned.

### 4. Durable Telemetry Ingestion (At-Least-Once Delivery)
* **Problem:** Popping directly via `RPOP` drops in-flight events if the Node process crashes or restarts before database insertion.
* **Implementation:** Employs the Redis Reliable Queue pattern:
  1. Atomic transfer from `clicks_queue` to `clicks_processing` using `RPOPLPUSH`.
  2. Multi-row bulk `INSERT INTO click_events` in MySQL.
  3. Acknowledged via `LTRIM` only after MySQL commit succeeds.
  4. On process startup, the worker inspects `clicks_processing` and flushes any stranded in-flight records from previous ungraceful restarts.

### 5. URL Validation & Self-Redirect Loop Prevention
* Enforces strict `http:` and `https:` protocols.
* Inspects destination hostnames against the local host, loopback IPs, and `hesishort.onrender.com` to prevent circular redirect loops.
* Configures Express `trust proxy` to reliably extract client IPs behind Cloudflare and Render reverse proxies.

---

## 🧪 Verified Load Test Benchmarks

Real-world load testing was conducted against the cached redirect route using **Autocannon v7.15.0**:

```bash
# 50 concurrent connections, 10-second duration against live Redis cache
npx autocannon -c 50 -d 10 http://localhost:4000/q0U
```

### Measured Production Results:
* **Throughput:** **875.4 requests/second** (8,754 requests completed in 10.13s)
* **Average Latency:** **56.79 ms**
* **p97.5 Latency:** **75.00 ms**
* **p99 Latency:** **84.00 ms**
* **Read I/O:** **100% of read redirects** served directly from Redis cache memory without MySQL query overhead.
* **Environment:** Benchmark executed from local client hitting cloud services (Upstash Serverless Redis & TiDB Cloud Serverless MySQL located in AWS `ap-southeast-1` Singapore).

---

## 🛠️ Quick Start (Local Setup)

### 1. Prerequisites
- Node.js v20+ & npm
- Cloud databases (Upstash Redis & TiDB Cloud) **or** local Docker

### 2. Configure Environment
```bash
cp .env.example .env
# Fill in your REDIS_URL and MYSQL credentials
```

### 3. Install & Start
```bash
npm install
npm run build
npm start
```
The application will launch on **`http://localhost:4000`**.

---

## 📡 API Reference

### 1. Shorten URL
```http
POST /api/shorten
Content-Type: application/json

{
  "url": "https://en.wikipedia.org/wiki/Distributed_computing",
  "customAlias": "dist-comp",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```
**Response (201 Created):**
```json
{
  "shortUrl": "https://hesishort.onrender.com/dist-comp",
  "shortCode": "dist-comp",
  "originalUrl": "https://en.wikipedia.org/wiki/Distributed_computing",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

### 2. Fast Redirect
```http
GET /:code
```
**Response:** `HTTP 302 Found` with `Location: <original_url>` and `X-Cache: HIT | MISS`.

### 3. Telemetry Analytics
```http
GET /api/analytics/:code
```
**Response (200 OK):**
```json
{
  "url": {
    "shortCode": "dist-comp",
    "originalUrl": "https://en.wikipedia.org/wiki/Distributed_computing",
    "createdAt": "2026-11-15T21:49:42.000Z",
    "expiresAt": null
  },
  "totalClicks": 1,
  "clicksPerDay": [{ "date": "2026-11-15", "clicks": 1 }],
  "browserBreakdown": [{ "browser": "Chrome", "count": 1 }],
  "topReferrers": [{ "referrer": "Direct", "count": 1 }]
}
```

---

## 🌐 Cloud Deployment (Render)

1. **Database:** Create a free MySQL database on [TiDB Serverless](https://tidb.cloud/) (AWS Singapore). Run `sql/schema.sql`.
2. **Cache:** Create a free Redis instance on [Upstash](https://upstash.com/) and copy the `rediss://...` connection string.
3. **Backend:** Deploy `hesishort` onto [Render](https://render.com/) as a Node Web Service, adding the environment variables from `.env`.
