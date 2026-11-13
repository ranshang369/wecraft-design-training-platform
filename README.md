# WeCraft 设计训练协作平台

> 公开协作仓库：<https://github.com/ranshang369/wecraft-design-training-platform><br>
> 稳定公网环境：<https://wecraft-training.zer-go.cn>（邮箱密码直接登录，演示密码通过受控渠道分发）<br>
> 本仓库只包含虚构演示数据、产品文档和开发配置，不包含 WeCraft 生产源码、生产数据库、真实授权证据或真实用户内容。

WeCraft 的内部设计训练数据平台。它把 Brief、优质案例、反例、候选设计、双评、盲测裁决、实验记录、数据集导出和审计放在同一个结构化工作台中。

平台是独立内部 Web 应用：不修改 WeCraft 生产代码，不替代飞书，不运行模型训练，也不连接生产数据库。飞书负责文档、沟通和通知；平台负责结构化资产、证据、评审与可追溯导出。

## 已实现

- 邮箱登录、管理员邀请、8 类角色与服务端 RBAC。
- 版本化 Brief，DEV/HOLDOUT 隔离，仅 Owner/Admin 可见 Holdout。
- 优质案例与反例独立建模，案例卡、375px 截图、沙箱 HTML、授权台账和六维评分。
- 案例双评、分歧裁决、评审修订版本（旧版本标记 SUPERSEDED）。
- 候选设计、五项硬检查、匿名 A/B 盲测、双评裁决和实验关闭。
- 数据集的授权/双评/版本校验、冻结清单、ZIP（JSONL/CSV/原始资产）导出和下载审计。
- 仪表盘覆盖率、授权完整度、评审完成度、一致性、硬失败率和盲测胜率。
- 站内通知、成员/角色管理、审计日志和通知中心。

## 技术栈

- Next.js 15 App Router + React 19，模块化单体。
- Route Handlers 实现 `/api/v1/*`，Zod 负责输入校验。
- PostgreSQL 16 + Prisma 6；文件存储支持本地目录或 PostgreSQL `BYTEA`，无持久盘部署使用数据库存储避免临时磁盘丢文件。
- `sanitize-html` 清洗 HTML；`playwright-core` 在服务端隔离浏览器中执行 375px 布局与对比度检查。
- Playwright 用于核心流程 E2E，Vitest 用于单元测试。

## 快速启动：Docker Compose

前置要求：Docker Desktop / Docker Engine，可拉取 `postgres:16-alpine` 与 `mcr.microsoft.com/playwright:v1.56.1-noble`。

```bash
docker compose -f deploy/docker-compose.yml up --build -d
docker compose -f deploy/docker-compose.yml run --rm -e NODE_ENV=development app npx prisma db seed
```

打开 http://localhost:3000。首次启动会自动执行 `prisma migrate deploy`。种子命令显式覆盖为 `NODE_ENV=development`；`db seed` 会清空并重建演示 Workspace，禁止用于生产。

生产环境不要运行演示种子。执行 `npm run bootstrap:admin`，通过一次性环境变量创建首个 OWNER，详见[部署与运维](docs/operations/deployment.md)。

## 快速启动：本地开发

前置要求：Node.js 22、npm、PostgreSQL 15+，以及 Chrome/Chromium 或 Playwright Chromium（硬检查需要）。

```bash
npm ci
copy .env.example .env
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

macOS/Linux 使用 `cp .env.example .env`。先在 PostgreSQL 创建 `wecraft_dt`，并把 `.env` 的 `DATABASE_URL` 改为本机连接串。

硬检查渲染器二选一：

```bash
npx playwright install chromium
```

或在 `.env` 指定现有 Chrome：

```dotenv
PLAYWRIGHT_CHROMIUM_EXECUTABLE="C:/Program Files/Google/Chrome/Application/chrome.exe"
```

渲染器不可用时，HC-04/HC-05 会按 fail-closed 返回 ERROR，候选不会进入盲测。

## 演示账号

本地种子密码统一为 `Demo1234!`，Workspace ID 为 `00000000-0000-4000-8000-000000000001`。稳定公网环境使用部署时单独生成、通过受控渠道分发的强密码，不在仓库或公开文档中公开。

| 邮箱 | 角色 |
| --- | --- |
| `owner@example.test` | OWNER 项目负责人 |
| `admin@example.test` | ADMIN 平台管理员 |
| `lead@example.test` | DESIGN_LEAD 设计负责人 |
| `content@example.test` | CONTENT_LEAD 内容负责人 |
| `editor@example.test` | EDITOR 内容/编辑 |
| `annotator@example.test` | ANNOTATOR 标注/QA |
| `engineer@example.test` | AI_ENGINEER AI 工程 |
| `viewer@example.test` | VIEWER 只读观察者 |

## 演示数据

- 3 个 Brief：`BR-0001`–`BR-0003`。
- 5 个优质案例 `CA-0001`–`CA-0005`，2 个反例 `CE-0001`–`CE-0002`。
- 实验 `EX-0001`，候选 `CD-0001`–`CD-0002`，含一个待双评盲测 pair。
- 数据集 `DS-0001`，包含 `CA-0001` 与缺少训练授权的 `CA-0005`，用于验证 `RIGHTS_MISSING` 导出门禁。
- `CA-0003` 为 IN_REVIEW，适合演示案例评审与修订；`CA-0004` 为 DRAFT。

全部素材是非敏感内部演示样例。

## 验证命令

```bash
npm run typecheck
npm test
npm run build

npm run db:seed
npm run test:e2e
```

E2E 依赖干净种子数据。重新跑之前先执行 `npm run db:seed`。当前覆盖 10 条验收：案例入库、评审修订、盲测裁决、数据导出、恶意 HTML、375px 溢出、RBAC、跨 Workspace 隔离、Holdout 文件隔离和审计链复算。

本地已验证 Node.js 22、PostgreSQL、Chrome 路径下的 typecheck、单测、构建和 E2E。稳定公网环境已在 Ubuntu 22.04、Docker Compose 与 Caddy 上完成容器部署、HTTPS、Chromium 硬检查、文件读取和数据持久化冒烟测试。

## 公网环境

当前稳定环境使用独立 Docker Compose Stack、PostgreSQL 16 和 Caddy HTTPS，部署在现有 Ubuntu 22.04 ECS 上；文件通过 `STORAGE_DRIVER=database` 写入 PostgreSQL。它不依赖 Render Free 的休眠实例、30 天数据库或临时隧道。访问方式、隔离边界、验收与回滚见[稳定公网部署](docs/operations/stable-public.md)。

Render Free 保留为备用演示方案：免费 Web 服务 15 分钟无请求会休眠，免费 PostgreSQL 仅 1 GB、无备份、可能重启，并在创建 30 天后过期。完整限制与部署步骤见[Render Free 部署说明](docs/operations/render-free.md)。

## 文档

- [产品 PRD](docs/prd.md)
- [v1.0 产品冻结包](docs/v1.0/README.md)
- [实际 API 文档](docs/api.md)
- [部署与运维](docs/operations/deployment.md)
- [稳定公网部署](docs/operations/stable-public.md)
- [Render Free 部署](docs/operations/render-free.md)
- [安全、审计与备份](docs/operations/security-backup.md)
- [测试报告](docs/test-report.md)
- [已知限制与后续计划](docs/known-limitations.md)
- [仓库边界 ADR](docs/adr/0001-repository-boundary.md)
- [协作指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)

## 安全边界

- 所有权限在服务端校验，前端角色字段只用于展示。
- HTML 只在 `sandbox=""` iframe 中预览；文件响应包含禁止脚本、表单和外部网络的 CSP。
- 训练/评测导出只允许 Owner、Admin、Design Lead；导出锁定案例、Brief、候选和授权快照并写审计。
- 数据集导出会再次检查版本漂移与授权漂移；发现缺失或变化即阻断。
- 不在仓库提交 `.env`、密钥、真实用户内容或生产截图。

