# Render Free 部署说明

## 目标与边界

本方案只使用 Render 的免费资源：

- 1 个 Free Web Service，运行本仓库 Dockerfile。
- 1 个 Free PostgreSQL 16，保存业务数据和文件内容。
- 使用 `https://<service>.onrender.com` 免费域名。
- 不使用持久盘、付费实例、后台 worker、自定义域名或外部付费对象存储。

GitHub 负责源码、分支保护、CI 和部署触发；Render 负责运行 Web 与数据库。GitHub Pages 只能托管静态文件，不能运行 Next.js 服务端和 PostgreSQL，因此不能单独作为本平台的公网运行环境。

## 免费额度与硬限制

| 项目 | Free 限制 | 影响 |
| --- | --- | --- |
| Web 休眠 | 15 分钟无请求自动休眠 | 首次访问需要冷启动等待 |
| Web 文件系统 | 休眠/重启/部署后丢失 | 必须设置 `STORAGE_DRIVER=database`，不能存本地文件 |
| Web 资源 | 单实例、无 Shell、无 one-off job、无后台 worker | 迁移和空库种子放在容器启动命令中 |
| Web 小时 | 每月 750 实例小时 | 单实例通常够用，超限需等下月 |
| PostgreSQL | 1 个/Workspace、1 GB、无备份、无连接池 | 不适合真实长期数据；需要单独备份策略 |
| PostgreSQL 有效期 | 创建 30 天后过期 | 到期必须升级、迁移或重建，数据会丢失 |

该实例是免费演示/轻量验收环境，不是生产环境。不要把真实授权证据、敏感用户内容或唯一副本放入免费实例。

## 架构

```text
GitHub repository
  └─ CI: PostgreSQL + migrate + typecheck + tests + build + E2E
       └─ Render Free Web (Docker, single instance)
            └─ Render Free PostgreSQL (metadata + files)
```

文件存储使用数据库驱动：

- `StoredFile` 保存 Workspace、MIME、大小、SHA-256、用途和对象键。
- `StoredFileContent` 一对一保存二进制 `BYTEA`。
- 通用文件接口只读元数据时不会返回二进制；下载/预览通过权限校验后读取内容。
- Web 休眠或重新部署不会丢失截图、HTML 和导出 ZIP。

## 首次部署

### 1. 创建 Free PostgreSQL

区域必须与 Web Service 一致。创建后等待状态变为 `available`，取得内部连接串，并确保带 `?schema=public`。

推荐数据库参数：

```text
name: wecraft-dt-db
plan: free
version: 16
databaseName: wecraft_dt
```

### 2. 创建 Free Web Service

连接 GitHub 仓库 `ranshang369/wecraft-design-training-platform`，分支 `main`，Runtime 选择 Docker，Plan 选择 Free。若 GitHub App 未授权，先在 Render Dashboard 授权该仓库。

```text
Dockerfile: ./Dockerfile
Health Check Path: /api/v1/health
Auto Deploy: checks pass
```

不要添加 Persistent Disk。

### 3. 环境变量

```dotenv
NODE_ENV=production
DATABASE_URL=<Render internal PostgreSQL URL with schema=public>
COOKIE_SECURE=true
SESSION_SECRET=<64 hex characters>
APP_URL=https://<service>.onrender.com
STORAGE_DRIVER=database
DEMO_SEED_IF_EMPTY=1
DEMO_PASSWORD=<strong random password>
SITE_ACCESS_PASSWORD=<strong random access gate password>
NEXT_TELEMETRY_DISABLED=1
```

`DEMO_SEED_IF_EMPTY=1` 只在空库播种；检测到已有 Workspace 会跳过，不会在每次重启时清空数据。公网演示密码和站点口令不得写入 Git、Release 或公开文档。

### 4. 启动行为

容器依次执行：

1. `prisma migrate deploy`
2. 若 `DEMO_SEED_IF_EMPTY=1`，执行 seed；已有 Workspace 则跳过
3. `next start`

因此无需 Render Shell 或 one-off job。

## 验收检查

部署完成后至少验证：

1. `GET /api/v1/health` 无需站点口令即可返回 200，Render 健康检查通过。
2. 浏览器首次访问出现 Basic Auth 口令框；错误口令为 401，正确口令进入登录页。
3. 使用 Owner 演示账号登录，打开案例详情，375px 截图和沙箱 HTML 正常。
4. 手动触发一次服务重启或重新部署，确认截图和 HTML 仍可读取，证明文件不依赖临时磁盘。
5. 打开数据集 `DS-0001` 执行校验，确认含缺失训练授权的案例时导出被 `RIGHTS_MISSING` 阻断。
6. 审计日志能看到登录、授权、评审、发布和导出记录。

## 运维

- 免费 PostgreSQL 无自动备份。演示数据可随时重建；真实数据必须在导入前建立外部备份。
- 免费数据库到期前导出数据并迁移到长期数据库；迁移后更新 `DATABASE_URL` 并重新部署。
- 不要在公开演示实例中存放真实授权材料、个人信息或生产截图。
- 若需要长期免费数据库，可评估其他免费额度产品，但必须重新验证连接串、SSL、容量、休眠和备份条款；本仓库不假定其可用。

## 退出与升级

升级为付费 Render 或迁移到企业环境时：

1. 为数据库创建快照/备份。
2. 新建付费 PostgreSQL 或企业 PostgreSQL，执行 `prisma migrate deploy`。
3. 导出数据并在新库恢复，或重新播种演示数据。
4. 切换到持久盘/对象存储，把 `STORAGE_DRIVER` 从 `database` 改为目标驱动。
5. 配置企业 SSO、飞书登录和通知，替换站点级 Basic Auth。
6. 完成备份恢复、权限、恶意 HTML 和导出门禁回归。
