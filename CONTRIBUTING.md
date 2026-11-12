# 协作指南

## 分支与提交

- 从最新 `main` 创建功能分支，例如 `codex/brief-versioning`。
- 每个 PR 只处理一个可验收目标；避免混入无关重构。
- 提交信息使用 `feat:`、`fix:`、`test:`、`docs:`、`chore:` 前缀。
- 不直接推送 `main`；所有变更通过 Pull Request 合并。

## 本地验证

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run db:seed
npm run typecheck
npm test
npm run build
npm run test:e2e
```

PR 合并前必须通过 GitHub Actions 的 `CI / verify`。

## 敏感数据

- 禁止提交生产 `.env`、数据库连接串、云密钥、飞书凭据、真实授权证据和真实用户内容。
- 所有测试账号使用 `example.test` 邮箱，所有案例素材必须为虚构或已获公开授权的样例。
- 发现误提交密钥时，立即轮换密钥并通过 GitHub Security Advisory 私下联系维护者，不要只删除提交。

## 数据模型与契约

修改 `prisma/schema.prisma`、迁移、授权字段、`contracts/` 或 RBAC 时，PR 必须说明：

- 兼容性与迁移方案。
- 权限影响。
- 审计事件。
- 回滚方式。
- 对应测试。
