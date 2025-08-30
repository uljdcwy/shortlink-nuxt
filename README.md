# 短链接（Short Link）服务 — Nuxt 3 + Redis

一个**高性能 / 高可用**的短链接生成服务，使用 **Nuxt 3 (Nitro)** 提供 RESTful API 与根路径重定向，使用 **Redis** 作为持久化与并发控制基础。

---

## ✨ 功能概览

- `POST /v1/links`：创建短链接  
  - 请求体：`{ "url": "https://a-very-long-url.com/with/path?and=query" }`  
  - 成功：`{ "short_code": "aK3nLp7", "short_url": "http://example.domain/aK3nLp7" }`  
  - 失败：
    - `400 Bad Request` URL 无效
    - `429 Too Many Requests` 触发 IP 级限流（默认 1 分钟 10 次）
    - `500 Internal Server Error` 服务内部错误
- `GET /:short_code`：根据短码 301/302 重定向到原始长链接（本实现使用 `302 Found`）。  
  - 无效或不存在：`404 Not Found`

---

## 🏗️ 本地环境搭建 & 启动

### 1) 克隆 & 安装
```bash
# 安装依赖
pnpm i   # 或 npm i / yarn
```

### 2) 启动 Redis（推荐用 Docker）
```bash
docker compose up -d
# Redis 监听 6379 端口，并开启 AOF 持久化
```

### 3) 环境变量
复制 `.env.example` 为 `.env` 并按需调整：
```env
REDIS_URL=redis://localhost:6379
BASE_URL=http://localhost:3000
CODE_SECRET=请改成强随机密钥
```

### 4) 启动服务
```bash
pnpm dev   # 或 npm run dev / yarn dev
```
- 开发模式默认端口：`http://localhost:3000`

### 5) 示例请求
```bash
curl -X POST http://localhost:3000/v1/links \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/hello?x=1"}'
# => {"short_code":"Ab12cD3","short_url":"http://localhost:3000/Ab12cD3"}
```

---

## 🧮 短 Code 生成算法 & 冲突处理

### 目标
- 长度 **6-8** 位（默认 7），字符集 **[0-9a-zA-Z]**。
- 非递增、不可预测（避免信息泄露 & 扫码枚举）。
- **高并发**下仍能**绝对唯一**。

### 算法
1. 使用 **HMAC-SHA256**（密钥 `CODE_SECRET`）对：`longUrl + 当前时间戳 + 重试计数` 进行摘要；
2. 将摘要字节转为 **Base62** 字符串；
3. 截断/填充到指定长度（默认 7 位，区间 6~8）；
4. 通过 **Redis Lua 脚本**执行**原子写入**：
   - `SETNX sl:{code} -> longUrl`（原子：若已存在则失败）
   - 可选建立**反向索引** `url:{hash} -> {code}`（用于**去重**：同 URL 返回同一短码）。

### 冲突/碰撞处理
- 若 `sl:{code}` 已存在，则**重试**（更换时间戳/计数）最多 N 次（默认 5~7 次）。
- **Lua 脚本**保证整个“写入短码 + 建反向索引”的**原子性**，避免并发竞态。
- 理论上 62^7 ≈ 3.5e12 个空间，碰撞概率极低；结合 HMAC 随机性与重试，碰撞可忽略。

> 代码位置：`server/utils/codegen.ts`、`server/utils/base62.ts`

---

## 🗃️ 数据存储（选择 Redis 的原因）

选择 **Redis** 的核心理由：
1. **高性能**：内存级读写，支持百万 QPS 量级。
2. **原子性**：Lua 脚本/事务可在高并发下实现强一致写入。
3. **易水平扩展**：可使用 Redis Cluster 或者主从 + 哨兵。
4. **持久化可选**：AOF/RDB 提供容灾能力（本示例用 AOF）。
5. **速率限制**、**去重**、**唯一性检查**都可在 Redis 内一站式完成。

### Key 设计（Schema）

> Redis 为 KV 存储，无传统表/索引概念。以下为约定的 Key 结构：

- `sl:{code}` → `longUrl`  
  - **作用**：短码查原始 URL（主索引）  
  - **TTL**：默认无（永久）。如需临时链接可设置 `ttlMs`。
- `url:{sha256(longUrl)}` → `{code}`  
  - **作用**：同 URL 去重（避免重复创建不同短码）  
  - **TTL**：建议与短码一致。
- `rl:{ip}:{windowStart}` → 计数  
  - **作用**：限流计数，按窗口粒度（如 60s）自动过期

> **索引**：Redis 的“索引”即 Key 本身。短码与 URL 的查找都是 `O(1)`。

---

## 🚦 速率限制（IP 级）

- **策略**：固定窗口计数（Fixed Window Counter）
  - 同一 IP，`1 分钟` 内最多 `10` 次。
  - 实现：`INCR rl:{ip}:{minute}`，初次设置 `EXPIRE 60`。
- **返回**：超限返回 `429 Too Many Requests`。
- 可替换为 **滑动窗口/漏桶/令牌桶**以获得更平滑的限流。

> 代码位置：`server/utils/rate-limit.ts`

---

## 🔌 API 设计

### `POST /v1/links`
- **请求体**：
  ```json
  { "url": "https://a-very-long-url.com/with/path?and=query" }
  ```
- **成功 (200 OK / 201 Created)**：
  ```json
  { "short_code": "aK3nLp7", "short_url": "http://example.domain/aK3nLp7" }
  ```
- **失败**：
  - `400 Bad Request`：URL 格式错误/缺字段
  - `429 Too Many Requests`：超出速率限制
  - `500 Internal Server Error`：服务异常

> 路由实现：`server/routes/v1/links.post.ts`（Nitro 路由不带 `/api` 前缀，即实际路径就是 `/v1/links`）

### `GET /:short_code`
- 短码校验：`^[0-9A-Za-z]{6,8}$`
- 查找 `sl:{code}`，存在则 `302 Found` 跳转；否则 `404`。
- 如需 **301 永久跳转**，将 `setResponseStatus` 改为 `301` 即可。

> 路由实现：`server/routes/[short_code].get.ts`

---

## 🔐 安全性考量

- **URL 校验**：仅允许 `http/https`，禁止 `localhost` 等内部地址，减轻 SSRF 风险。
- **不可预测短码**：HMAC 加随机熵，避免被顺序枚举。
- **速率限制**：防滥用/撞库。
- **机密管理**：`CODE_SECRET` 必须在生产中妥善保管。

---

## ⚙️ 关键配置位点

- 短码长度与重试：`server/utils/codegen.ts`
- 限流窗口与阈值：`server/utils/rate-limit.ts` / `v1/links.post.ts`
- 永久/临时短链 TTL：传入 `ttlMs` 即可开启临时短链。

---

## 📈 横向扩展建议

- **多实例**应用：Redis 作为集中式协调器，实例无状态水平扩展。
- **Redis Cluster**：分片扩容；或主从 + 哨兵提升可用性。
- **热点保护**：为爆款短码添加本地 LRU 缓存（例如 node-cache）减少回源。

---

## 🧪 健康检查 & 监控

- 增加 `GET /healthz`（此处略）检查 Redis 连接与脚本加载。
- 监控：请求量、4xx/5xx、Redis QPS、内存与 AOF 大小。

---

## 🧱 (可选) SQL 版本参考 DDL

如果选用 MariaDB/MySQL，可用如下 DDL（仅作参考）：
```sql
CREATE TABLE short_links (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  short_code CHAR(8) NOT NULL UNIQUE,
  long_url TEXT NOT NULL,
  url_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 索引
CREATE UNIQUE INDEX idx_short_code ON short_links(short_code);
CREATE UNIQUE INDEX idx_url_hash ON short_links(url_hash);
```

---

## 📂 目录结构

```
shortlink-nuxt/
├─ app.vue
├─ docker-compose.yml
├─ nuxt.config.ts
├─ package.json
├─ .env.example
├─ server/
│  ├─ routes/
│  │  ├─ v1/
│  │  │  └─ links.post.ts         # POST /v1/links
│  │  └─ [short_code].get.ts      # GET /:short_code
│  └─ utils/
│     ├─ base62.ts
│     ├─ codegen.ts
│     ├─ rate-limit.ts
│     ├─ redis.ts
│     └─ validate.ts
└─ README.md
```

---

## ✅ 运行要点回顾

- 使用 `docker compose up -d` 启动 Redis（AOF 持久化）。
- 设置 `.env` 中的 `BASE_URL` 与 `CODE_SECRET`。
- 运行 `pnpm dev` 启动 Nuxt。

祝你机试顺利！
