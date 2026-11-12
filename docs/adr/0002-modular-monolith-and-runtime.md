# ADR 0002：MVP 模块化单体与运行时

- 状态：Proposed
- 日期：2026-11-11
- 依赖：ADR 0001、`docs/implementation-plan.md`
- 影响：应用脚手架、部署、测试和后续服务拆分

## 背景

v1.0 架构建议使用 Next.js + Fastify + PostgreSQL + Prisma + S3/OSS。平台规模为 4–20 人、单个内部团队、桌面优先，首期还需要快速形成可演示闭环。独立拆分 Web 与 API 进程会增加部署、会话、CORS、契约同步和本地验收成本，但不直接提升授权、评审或导出安全性。

## 决策

MVP 采用：

- Next.js App Router + TypeScript，承载页面与 `/api/v1` Route Handlers。
- PostgreSQL + Prisma，负责事务、版本化、授权快照和审计链。
- 业务规则集中在 `src/server/services`，路由只做鉴权、输入校验和响应映射。
- 文件通过 `StorageAdapter` 抽象：本地目录用于开发，PostgreSQL `BYTEA` 用于无持久盘的免费云部署，S3/OSS 私有桶用于规模化部署。
- HTML 预览与截图在隔离 runner 中执行；主应用不直接执行用户 HTML。
- 后续如需独立 API，将 `services` 与 DTO 平移到 Fastify；数据库和契约不变。

## 替代方案

| 方案 | 结论 | 原因 |
| --- | --- | --- |
| Next.js + 独立 Fastify | 暂不采用 | 4–20 人规模收益有限；增加双进程、CORS、鉴权和部署复杂度 |
| 纯 Vite SPA + Fastify | 暂不采用 | 首屏权限、服务端表单和内部页面开发效率较低 |
| tRPC 全量内部 API | 暂不采用 | 外部候选写入、版本化契约和审计需要稳定 REST 边界 |
| 微服务 | 不采用 | 当前团队与数据量不支持，分布式事务会放大授权与导出风险 |

## 迁移成本

- 路由适配约 1–2 人周；服务层、Prisma schema、契约与测试可复用。
- 若后续拆 Fastify，必须保留 `/api/v1` 兼容期和 OpenAPI 版本，不在同一发布中切换。
- 采用模块化单体不改变跨系统契约，也不允许直接引用 WeCraft 生产源码。

## 后果

- 单镜像/单进程更容易在全新环境启动和演示。
- 需要在应用内严格分层，防止页面直接写业务状态。
- 安全边界仍由服务端鉴权、沙箱 runner 和对象存储隔离保证，不能因为单体部署而放松。
