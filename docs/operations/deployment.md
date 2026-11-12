# 部署与运维

## 运行拓扑

MVP 采用模块化单体：

1. Next.js Web/API 进程（Node.js 22）。
2. PostgreSQL 16，保存结构化数据、评审、候选元数据、数据集快照和审计。
3. 文件存储：本地部署使用持久卷；无持久盘的免费云环境使用 PostgreSQL `StoredFileContent` 保存截图、HTML、导出 ZIP。
4. 同一容器内的隔离 Chromium 渲染器，只执行硬检查；不执行用户脚本，不访问外网。

平台不连接 WeCraft 生产数据库，不导入生产源码，不共享生产对象存储或飞书应用。

## Docker Compose

```bash
docker compose -f deploy/docker-compose.yml up --build -d
docker compose -f deploy/docker-compose.yml run --rm -e NODE_ENV=development app npx prisma db seed
docker compose -f deploy/docker-compose.yml logs -f app
```

Compose 会启动 PostgreSQL 与应用，并自动执行 `prisma migrate deploy`。种子命令必须显式设置 `NODE_ENV=development`，否则种子脚本会按生产保护策略拒绝执行。`db seed` 只用于演示环境，会清空当前数据库的全部业务表。

停止但保留数据：

```bash
docker compose -f deploy/docker-compose.yml down
```

删除本地数据库与存储卷会不可逆丢数据，除非已确认是演示环境，否则不要使用 `down -v`。

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | PostgreSQL 连接串；生产使用 TLS、最小权限账号。 |
| `SESSION_SECRET` | 否 | 预留配置；当前会话使用随机 opaque token 并只存 SHA-256 哈希。 |
| `APP_URL` | 是 | 对外 HTTPS 地址，用于 Cookie 与后续飞书回调。 |
| `COOKIE_SECURE` | 建议 | HTTPS 环境必须为 `true`。 |
| `STORAGE_DRIVER` | 是 | `local` 或 `database`；无持久盘的免费云环境必须使用 `database`。 |
| `STORAGE_ROOT` | 仅 local | 本地文件持久卷挂载点，例如 `/app/storage`。 |
| `SITE_ACCESS_PASSWORD` | 公网建议 | 可选站点级 Basic Auth 口令；`/api/v1/health` 始终放行。 |
| `DEMO_SEED_IF_EMPTY` | 演示可选 | 设为 `1` 时，空库自动播种；已有 Workspace 时跳过，不删除数据。 |
| `DEMO_PASSWORD` | 演示可选 | 公网演示账号密码；必须使用强随机值，不得提交到 Git。 |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE` | 否 | 系统 Chrome/Chromium 路径；为空时使用 Playwright 默认浏览器。 |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_REDIRECT_URI` | 否 | 预留适配层；MVP 未启用 OAuth 与真实消息发送。 |
| `PORT` | 否 | 默认 3000。 |

密钥不得提交到 Git。生产环境使用云密钥管理或 Docker/Kubernetes Secret 注入。

## 迁移与演示数据

生产发布顺序：

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run build
npm run start
```

- `db:deploy` 只执行已提交迁移，不生成新迁移。
- `db:migrate` 仅用于开发环境创建迁移。
- `db:seed` 包含业务表清空，严禁指向生产库；脚本会拒绝未显式启用 `DEMO_SEED_IF_EMPTY=1` 的生产种子，并拒绝非 `wecraft_dt` 数据库。
- 容器以 `DEMO_SEED_IF_EMPTY=1` 启动时，先检查 Workspace；已有数据则跳过，只有空库才执行演示种子。

## 首次生产初始化

生产环境不使用演示种子。执行迁移后，用一次性环境变量创建 Workspace 和首个 OWNER：

```bash
BOOTSTRAP_ADMIN_EMAIL='owner@your-domain.example' \
BOOTSTRAP_ADMIN_PASSWORD='<至少 12 位的随机密码>' \
BOOTSTRAP_ADMIN_NAME='项目负责人' \
BOOTSTRAP_WORKSPACE_NAME='WeCraft 设计训练工作组' \
BOOTSTRAP_WORKSPACE_SLUG='wecraft-design' \
npm run bootstrap:admin
```

脚本幂等，可重复执行；已存在的邮箱不会被重置密码，只会确保账号处于 ACTIVE、加入目标 Workspace 并获得 OWNER 角色。首次初始化会写 `BOOTSTRAP_ADMIN` 审计事件。执行后立即从部署平台删除一次性密码变量。

## 反向代理与 TLS

- 在 Nginx/Ingress/ALB 终止 TLS，转发到 `app:3000`。
- 设置 `APP_URL=https://...` 与 `COOKIE_SECURE=true`。
- 只允许组织内网或 SSO 网关访问；MVP 未内置公网防滥用策略。
- 保留 `X-Forwarded-For` 与 `X-Request-Id`，审计会记录请求元数据。

## 渲染器

硬检查必须能启动 Chromium。推荐使用 `mcr.microsoft.com/playwright:v1.56.1-noble` 镜像；本地也可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向系统 Chrome。

渲染器不可用时，HC-04 与 HC-05 返回 ERROR，候选进入 `HARD_CHECK_FAILED`，不会误放行。

## 存储

支持两种驱动：

- `local`：写入 `STORAGE_ROOT`，必须使用持久卷。
- `database`：文件内容写入 PostgreSQL `StoredFileContent.data`，适用于 Render Free 等无持久盘环境；元数据仍存 `StoredFile`，通用 API 不会序列化二进制内容。

生产规模建议迁移到 S3/OSS：

- 开启服务端加密、版本控制、对象锁（如合规要求）和访问日志。
- 生命周期：截图/HTML 与案例同寿命；临时导出 ZIP 15 分钟下载有效，7 天后可清理。
- 对象键继续按 Workspace 隔离；读取时仍校验数据库中的 `workspaceId`。

## Render Free

完全免费的部署步骤、限制、环境变量和验收检查见[Render Free 部署说明](render-free.md)。免费 PostgreSQL 创建 30 天后过期；若需要长期运行，必须改用其他免费数据库额度或升级，并先完成备份/迁移演练。

## 发布与回滚

1. 先备份数据库，再执行向后兼容迁移。
2. 构建新镜像并跑迁移；应用保持旧镜像直到迁移完成。
3. 执行健康检查 `/api/v1/health` 与一轮冒烟测试。
4. 回滚应用镜像前确认数据库迁移没有不可逆删除。

## 监控

至少监控：

- `/api/v1/health` 存活、5xx 率、P95 延迟。
- 硬检查 ERROR 率和渲染器启动失败。
- 数据集 `BLOCKED` 数量、导出失败、审计写入失败。
- PostgreSQL 连接数、磁盘、慢查询；对象存储容量与错误率。

