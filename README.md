# wecraft-design-training-platform

WeCraft 设计训练协作平台的独立私有仓库。平台用于 Brief、案例/反例、候选设计、双评、盲测、授权台账、数据集导出和审计；平台不训练模型，不替代飞书，也不修改 WeCraft 生产代码。

## 当前状态

- 产品、数据、权限、API 和验收文档已冻结为 v1.0 候选。
- 本仓库已完成独立边界和契约目录初始化。
- 应用代码尚未开始；实现前需确认 `docs/implementation-plan.md` 第 6 节的实现假设。
- 仓库创建于本地 `main` 分支；远端私有仓库、分支保护和团队权限需由组织管理员配置。

## 仓库结构

```text
docs/                 产品基线、PRD、v1.0 文档、ADR、实施计划
contracts/v1/         跨系统 JSON Schema 与 OpenAPI 契约
apps/                 应用入口（后续实现）
packages/             可复用领域与 UI 包（后续实现）
db/migrations/        数据库迁移（后续实现）
fixtures/import/      一次性迁移样例与演示数据
deploy/               Compose、环境模板、部署与备份说明
.github/CODEOWNERS    代码与契约审批边界
```

## 文档入口

- [任务基线](docs/product-brief.md)
- [PRD](docs/prd.md)
- [实施计划](docs/implementation-plan.md)
- [独立仓库 ADR](docs/adr/0001-repository-boundary.md)
- [运行时 ADR](docs/adr/0002-modular-monolith-and-runtime.md)
- [数据模型](docs/v1.0/data-model.md)
- [权限模型](docs/v1.0/rbac.md)
- [API 草案](docs/v1.0/api-draft.md)
- [验收标准](docs/v1.0/acceptance.md)

## 启动（实现阶段）

应用尚未生成，当前不能启动 Web 服务。实现完成后，README 将补充：

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

验收要求从干净克隆开始，仅依赖仓库内文档、迁移、种子和环境变量模板。

## 安全边界

- 不连接 WeCraft 生产数据库，不复用生产 `.env`、对象存储或飞书应用。
- 不提交密钥、授权证据、真实用户内容或生产截图。
- 所有演示数据必须是非敏感样例。
- 平台仓库不是生产仓库的替代或分支；跨系统集成只走版本化契约。
