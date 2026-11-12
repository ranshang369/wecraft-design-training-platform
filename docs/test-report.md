# 测试报告：WeCraft 设计训练协作平台 MVP

> 验证日期：2026-11-12  
> 结论：MVP 的三条核心流程、权限边界和关键安全校验通过本地自动化验证；数据库文件存储和站点访问门禁也已单独验证，可用于内部演示与免费云部署验收。Docker Compose 镜像构建未在本次机器上执行。

## 1. 验证范围

本次验证覆盖已实现的 P0 主流程：

1. 案例创建、双人独立评审、分歧裁决、案例进入 `ELIGIBLE`。
2. 候选设计硬检查、匿名 A/B 盲测、双人评审、裁决和实验关闭。
3. 数据集授权校验、版本冻结、ZIP/JSONL/CSV 导出和审计。

同时覆盖 RBAC、跨 Workspace 隔离、Holdout 隔离、恶意 HTML、375px 预览、评审修订和审计哈希链。

## 2. 测试环境

| 项目 | 值 |
| --- | --- |
| 操作系统 | Windows，工作目录 `G:\染殇泪\公司\wecraft-design-training-platform` |
| Node.js | `v22.22.2` |
| npm | `10.9.7` |
| Next.js | `15.5.29` |
| PostgreSQL | `15.14` 便携实例，端口 `55432` |
| 浏览器 | 本机 Google Chrome，Playwright Chromium 项目 |
| 数据库 | `wecraft_dt` |
| 测试数据 | `prisma/seed.ts` 生成的演示 Workspace 和非敏感样例 |

## 3. 执行结果

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | `tsc --noEmit`，无类型错误 |
| `npm test` | 通过 | 4 个测试文件，12/12 单元测试通过，耗时约 2.3 秒 |
| `npm run build` | 通过 | Next.js 生产构建成功，29 个路由完成静态/动态产物生成 |
| `npm run db:seed` | 通过 | 重建演示 Workspace、账号、Brief、案例、反例、实验和数据集 |
| `npm run test:e2e` | 通过 | 10/10 Playwright E2E 通过，耗时约 56 秒 |
| `STORAGE_DRIVER=database` + E2E | 通过 | 10/10 E2E 通过，截图、HTML 与导出文件均从 PostgreSQL 读取 |
| Basic Auth 门禁 | 通过 | 健康检查 200；未带口令的 `/login` 为 401；带正确口令为 200 |

构建与 E2E 均在依赖升级到 Next.js `15.5.29`、Vitest `5.1.0`、`sanitize-html` `2.18.2` 之后重跑。

## 4. E2E 明细

| # | 用例 | 结果 | 关键断言 |
| --- | --- | --- | --- |
| 1 | 流程 A：案例创建、双评、分歧裁决与入库 | 通过 | 两名评审独立提交；分歧触发裁决；案例最终 `ELIGIBLE` |
| 2 | 评审修订 | 通过 | 原评审标记 `SUPERSEDED`；新版本生成；审计保留 |
| 3 | 流程 B：匿名 A/B 盲测、双评、裁决与实验关闭 | 通过 | 隐藏模型/来源；双评后裁决；实验记录关闭 |
| 4 | 流程 C：授权校验、版本冻结、ZIP 导出与审计 | 通过 | 缺训练授权时阻断；通过后生成快照；JSONL/CSV 可解压；下载写审计 |
| 5 | 恶意 HTML 与 375px 溢出 | 通过 | 脚本不执行；外链被阻断；横向溢出被硬检查拒绝 |
| 6 | Viewer 越权 | 通过 | 不能读审计、导出数据集或查看未入库案例 |
| 7 | 跨 Workspace 隔离 | 通过 | 读取其他 Workspace 的 Brief 返回 404 |
| 8 | 375px 截图与沙箱预览 | 通过 | 登录后可查看移动端截图；iframe 使用 `sandbox=""` |
| 9 | Holdout 隔离 | 通过 | 普通角色不能按 ID 读取 Holdout 数据集、Brief 或截图文件 |
| 10 | 审计链复算 | 通过 | 测试独立按数据库记录重算 `entryHash`，结果一致 |

## 5. 单元测试明细

- 硬检查：恶意 HTML 必定在安全项失败，整体不可通过。
- 375px 截图：接受 375px SVG 与 750px 2x PNG；拒绝宽图和非法 data URL。
- RBAC：授权修改、数据集导出、候选提交和 Viewer 只读边界正确。
- HTML 安全：移除脚本、事件属性、表单、外链和外部 CSS；CSP 禁止脚本、连接、表单和嵌入。

## 6. 验收对照

| 验收项 | 状态 | 证据 |
| --- | --- | --- |
| 三种以上角色可完成各自工作流 | 通过 | 登录、案例评审、AI 工程候选、Owner 导出 E2E |
| 案例标注和盲测流程可走通 | 通过 | E2E 1、3、4 |
| 授权不完整无法训练导出 | 通过 | E2E 4；`RIGHTS_MISSING` |
| 评审提交后不可覆盖 | 通过 | E2E 2；修订生成新版本 |
| 375px 截图可正常查看 | 通过 | E2E 8 |
| 恶意 HTML 不执行脚本或请求外网 | 通过 | E2E 5；CSP 单元测试 |
| 仪表盘反映完成率和硬失败率 | 通过（实现并接入主流程） | 仪表盘查询服务与 E2E 主流程数据 |
| 关键写操作有审计 | 通过 | E2E 4、10 |
| 关键流程有自动化测试 | 通过 | 12 个单测 + 10 个 E2E |
| 全新环境可按 README 启动 | 本地通过 | 本地依赖、迁移、种子、构建和启动路径已验证；Docker 路径未实测 |

## 7. 安全与数据治理验证

- 所有 API 在服务端校验会话、Workspace 和角色；前端角色字段不参与鉴权。
- 跨 Workspace 资源统一返回 404，避免枚举和存在性泄漏。
- Holdout 在 Brief、Case、Counterexample、Candidate、Dataset、ReviewTask 和文件读取层均做过滤。
- HTML 预览使用 `sandbox=""` iframe；响应携带 CSP，禁止脚本、表单、外链、嵌入和网络请求。
- 清洗器删除脚本、事件属性、表单和外部 URL；内联样式仅用于还原设计视觉。
- 评审提交使用不可原地修改的版本模型；修订创建新记录并标记旧记录 `SUPERSEDED`。
- 数据集导出再次检查授权和版本漂移，冻结案例版本、授权快照和 manifest hash。
- 审计日志使用哈希链；测试可从数据库记录独立复算每条 `entryHash`。
- 免费云部署使用 `STORAGE_DRIVER=database`；E2E 已覆盖数据库文件读取，页面与数据集导出不依赖本地磁盘。
- 可选 `SITE_ACCESS_PASSWORD` 在所有页面启用 Basic Auth，但始终放行 Render 健康检查 `/api/v1/health`。

## 8. 已知测试缺口

- Dockerfile 和 Docker Compose 未在本机实测；当前机器没有 Docker。Render Free 的远程 Docker 构建结果以部署日志和公网验收为准。
- 未执行压力测试、并发基准、可访问性扫描和真实飞书 OAuth/消息集成测试。
- 未执行真实数据库/对象存储备份恢复演练；仓库只包含运维方案。
- 当前 `npm audit` 报告 13 个漏洞：6 moderate、7 high、0 critical。主要修复需要 Next.js、Prisma、Zod、Archiver 大版本升级，未在 MVP 收口阶段强行升级。
- `sanitize-html` 对允许 `style` 标签给出安全警告；平台通过 CSP、URL 清洗和 iframe 隔离降低风险，但样式层仍需在独立渲染域中长期加固。
- Chromium 硬检查使用 `--no-sandbox` 参数，隔离边界依赖容器/虚拟机；生产化应迁移到独立 runner 并加强进程隔离。

## 9. 复现方式

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

E2E 会写入额外测试数据。演示前重新执行 `npm run db:seed`，即可恢复一致的演示基线。
