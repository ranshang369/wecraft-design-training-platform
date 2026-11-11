# 仓库治理与远端初始化

## 目标

- 私有仓库：`wecraft-design-training-platform`
- 默认分支：`main`
- 外部伙伴只获得本仓库权限，不获得 WeCraft 生产仓库权限。
- 伙伴可写平台代码；WeCraft 负责人审批数据模型、授权字段、契约和部署秘密。

## 远端创建（组织管理员执行）

当前机器没有 `gh` 或远端地址，以下命令需在具备 GitHub 组织权限的环境执行：

```bash
gh repo create <org>/wecraft-design-training-platform \
  --private \
  --source . \
  --remote origin \
  --push
```

若使用 GitLab 或自建 Git：

```bash
git remote add origin <private-repository-url>
git push -u origin main
```

## 分支保护

在远端启用：

- 禁止直接向 `main` 推送；所有变更走 Pull Request。
- 至少 1 名平台维护者批准；涉及 `docs/v1.0/data-model.md`、`docs/v1.0/rbac.md`、`contracts/`、`db/` 时需 WeCraft 负责人批准。
- 保护 `main` 的强制推送和删除。
- 合并前要求 CI 通过。
- 外部伙伴不具备管理员、密钥读取、生产环境访问权限。

## CODEOWNERS

`.github/CODEOWNERS` 当前使用 `@YOUR_ORG` 占位符。启用分支保护前必须替换为真实组织团队：

- `design-platform-maintainers`：平台代码、文档和测试。
- `wecraft-owners`：数据模型、授权字段、契约、数据库迁移。

## 仓库禁止项

- 生产数据库连接串、生产 `.env`、对象存储密钥、飞书凭据。
- 真实案例授权证据原件、真实用户内容、生产截图。
- WeCraft 生产源码复制或 Git submodule。
- 与 WeCraft 生产数据库的双向同步。

## 验收

- 从干净克隆执行 README 中的安装、迁移、种子和启动步骤。
- 演示账号和演示数据可独立运行。
- CI 在缺少外部凭据时仍可执行单元、集成和契约测试。
