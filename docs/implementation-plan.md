# WeCraft 设计训练协作平台 MVP 实施计划

| 项目 | 内容 |
| --- | --- |
| 状态 | 待项目负责人确认后进入编码 |
| 依据 | `v1.0/PRD-v1.0.md`、`data-model.md`、`rbac.md`、`api-draft.md`、`acceptance.md` |
| 交付位置 | `design-training-platform/mvp/`，与 `WeCraft/` 完全隔离 |
| 目标 | 4 周完成可部署、可演示、可验收的 P0 闭环；6 周作为含安全/恢复演练的稳妥基线 |

## 1. 一页执行计划

### 1.1 实施结论

- 采用**单体 Next.js App Router + Route Handlers + Prisma + PostgreSQL**，业务逻辑集中在 `src/server/services`，不拆分 Fastify 服务。理由：4–20 人内部应用，单镜像部署、权限校验和演示环境更简单；REST 路径仍按 `/api/v1` 暴露，未来可平移到 Fastify，迁移成本主要在路由适配层（约 1–2 人周），不涉及数据模型。
- 文件存储采用 `StorageAdapter`：本地文件系统用于演示，S3/OSS 私有桶用于部署；对象键包含 Workspace 前缀，下载使用短期签名 URL。
- 身份采用邮箱邀请 + 密码登录作为可运行降级方案，保留 `FeishuAuthAdapter` 与飞书通知适配器；没有真实应用凭据时不伪造 OAuth，只在配置齐全时启用。
- HTML 预览使用不含 `allow-scripts` 的 sandbox iframe，并叠加 CSP、禁用表单/外链/事件属性；截图与 375px 渲染由服务端隔离 runner 执行，失败时 fail closed。
- 先做 E2E 主流程，再做视觉与效率优化；不实现模型训练、推理、自动评分、自动裁决、Elo/Bradley–Terry、移动端编辑和真实飞书审批。

### 1.2 4 周工程排期（6 周为安全基线）

| 周 | 交付 | 出口条件 |
| --- | --- | --- |
| W1 | 脚手架、Prisma schema/迁移、种子、登录/邀请/会话、Workspace/RBAC、Brief CRUD 与不可变版本 | 演示账号可登录；Brief 可创建、编辑、冻结版本；越权测试通过 |
| W2 | 案例/反例独立对象、资产上传、授权六字段、案例卡、双评任务、证据、分歧裁决、流程 A | 作者回避；双评锁定；裁决后进入 `ELIGIBLE`；审计可查 |
| W3 | 候选页面/API、5 项硬检查、沙箱预览、实验与 pair、盲测房间、流程 B | 恶意 HTML 不执行；375px 截图可查看；双评前无元数据泄漏 |
| W4 | 数据集校验/快照/导出、仪表盘、通知、审计中心、流程 C、E2E、README、Docker Compose、测试报告 | 三种角色可完成工作流；所有验收用例通过；全新环境可启动 |

**6 周基线补充**：W5 做安全评审、恢复演练、性能与可观测性；W6 做 UAT、缺陷修复和试点准备。若 W4 出口条件有任一不满足，不压缩安全与测试。

### 1.3 关键依赖与阻塞项

- 需要确认本计划第 6 节的实现假设；未确认项不写成业务事实。
- 依赖安装、Playwright Chromium 下载可能需要网络权限；若不可用，375px 渲染标记为“未完成”，候选不得进入盲测，不用静态检查冒充真实渲染。
- 本机 Docker 当前不可用，`docker compose` 只能写入交付物，无法本机验证；本地验收使用独立 PostgreSQL 数据库 `wecraft_dt`，不覆盖现有 `runtime/pgdata`。
- 若现有 5432 集群不可安全复用，改用独立端口 55432 和独立数据目录；不删除、不迁移现有数据。

### 1.4 三个最大交付风险

1. **授权与导出错误**：授权缺失仍导出，或训练/评测授权互相推导。对策：六字段默认 false、服务端重新校验、数据集锁定快照、导出前阻断并写审计。
2. **盲测泄漏**：响应、文件名、HTML、错误信息泄露模型或来源。对策：DTO 白名单、服务端随机映射、双评锁定后揭示、泄漏测试。
3. **范围拖期**：4 周内同时追求 18 条硬检查和完整产品。对策：P0 只执行 5 条指定硬检查，规则模型可扩展到 18 条；其余列 P1。

## 2. 数据模型

### 2.1 建模边界

- `Brief`、`Case`、`Counterexample`、`Candidate` 是四类独立聚合根；优质案例、反例、候选不得共用一张表靠 `kind` 区分。
- 所有内容对象采用“聚合根 + 不可变版本 + 资产引用”结构；版本内容不可 UPDATE。
- 评审采用追加版本；提交后旧记录保留，修订生成 `version + 1` 并标记旧版 `SUPERSEDED`。
- 数据集条目保存 brief/case/candidate 的版本 ID、授权快照、资格快照和内容 hash；批准后不可原地增删。

### 2.2 核心实体

| 实体 | 关键字段 | 关键约束 |
| --- | --- | --- |
| `Workspace` | id、name、slug、status | 所有业务查询必须带 workspace_id |
| `User` / `Membership` / `Role` | 用户、成员、角色 | 用户可跨 Workspace；角色按 Workspace 授予；最后 Owner 保护 |
| `Invitation` / `Session` | token hash、过期、状态 | 邀请一次性；会话 HttpOnly、服务端可撤销 |
| `Brief` / `BriefVersion` | briefNo、purpose、split、manuscript、image、audience、commission、brand、prohibited | `DEV/HOLDOUT`；版本不可变；Holdout 普通角色不可见 |
| `Case` / `CaseVersion` | caseNo、archetype、status、mechanismTags、selfScores、antiPatterns | 优质案例；必须有 375px 截图和 HTML；版本不可变 |
| `Counterexample` / `CounterexampleVersion` | failureSummary、labels、reproduction、repair | 独立表；不能由低分案例直接转换；必须有修复建议 |
| `AuthorizationGrant` / `AuthorizationEvent` | 六项 boolean、证据状态、操作人、理由 | 默认 false；训练/评测授权仅 Owner/Design Lead 可改 |
| `CaseAsset` / `CounterexampleAsset` | kind、storedFileId、width、height、alt | 资产属于版本；不直接存二进制 |
| `ReviewTask` | type、subjectType、assignee、reviewRole、status、round | 作者/提交人回避；`SUBMITTED` 终态 |
| `CaseReview` / `CounterexampleReview` | reviewer、version、recommendation、snapshot、contentHash | 提交不可 UPDATE；修订新版本 |
| `ReviewScore` / `ReviewEvidence` | 六维 1–5、N/A、证据类型/定位/摘录 | 每条评审至少 1 条证据；图像叙事仅无图时可 N/A |
| `Candidate` / `CandidateVersion` | modelProvider、modelName、modelVersion、experimentId、HTML、截图 | 版本不可覆盖；元数据仅在授权披露阶段可见 |
| `HardCheckRun` / `HardCheck` | ruleId、ruleVersion、severity、status、message、evidence | append-only；重跑创建新 run；BLOCK 阻止盲测 |
| `Experiment` / `ExperimentPair` | brief 范围、protocol、随机种子 hash、pair 冻结 | pair 冻结候选版本和 hash；关闭后展示聚合 |
| `PairwiseComparison` / `PairwiseScore` | presentedLeft/Right、preference、rationale、confidence | 每名评审独立随机；TIE 保留但不进 DPO |
| `Dataset` / `DatasetItem` / `DatasetExport` | type、filter、rightsSnapshot、manifestHash、版本快照 | 授权缺失阻断；批准后冻结；导出记录人和时间 |
| `AuditLog` | action、resource、before/after、reason、requestId、hash 链 | 只追加；关键写操作与业务事务同事务 |
| `Notification` | recipient、type、resourceId、deepLink、dedupeKey | 不保存正文/截图/HTML；站内 + 飞书适配 |

### 2.3 六维评分与准入

固定维度：`CONTENT_FIT` 内容适配、`VISUAL_MECHANISM` 视觉机制、`TYPE_HIERARCHY` 字形层级、`IMAGE_NARRATIVE` 图像叙事、`RHYTHM` 节奏变化、`COMPLETION` 整体完成度。

- 分值为 1–5 整数；2/4 为插值；所有维度等权仅用于仪表盘诊断。
- 无图片时仅图像叙事为 N/A，不计入均值并重新归一化。
- 案例准入：内容适配、视觉机制、整体完成度 ≥4，其余 ≥3；两名评审通过；授权完整；375px 可渲染。
- 分歧触发：任一维差 ≥2、发布结论相反、A/B 偏好相反、硬检查结论冲突，或授权/隐私/安全疑义。

### 2.4 关键状态机

**案例**：`DRAFT → SUBMITTED → IN_REVIEW → ARBITRATION / CHANGES_REQUESTED → ELIGIBLE / REJECTED`；`ELIGIBLE` 对应发布批准，可进入数据集候选。撤回展示授权或法律冻结可进入 `QUARANTINED`。

**评审任务**：`PENDING → ASSIGNED → IN_PROGRESS → SUBMITTED`；另有 `DECLINED / EXPIRED / CANCELLED`。`SUBMITTED` 后不可回退或覆盖。

**候选**：`DRAFT → SUBMITTED → HARD_CHECKING → HARD_CHECK_FAILED / READY_FOR_BLIND → IN_BLIND → COMPLETED`；另有 `WITHDRAWN / DISQUALIFIED / QUARANTINED`。

**数据集**：`DRAFT → VALIDATING → BLOCKED / READY_FOR_APPROVAL → APPROVED → EXPORTING → READY / FAILED`；授权撤回或冻结进入 `REVOKED`。

## 3. 权限矩阵

| 能力 | OWNER | ADMIN | DESIGN_LEAD | CONTENT_LEAD | EDITOR | ANNOTATOR | AI_ENGINEER | VIEWER |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 成员邀请/停用 | W | W（不可授 OWNER） | R | R | — | — | — | — |
| 角色分配 | W | W（不可改 OWNER） | — | — | — | — | — | — |
| Brief 创建/编辑 | W | — | R | W | W | R | R | R（已发布） |
| Brief 审批 | A | — | A | A | — | — | — | — |
| 案例/反例录入 | W | — | W | R | R | W | W（反例） | R（已发布） |
| 案例/反例批准 | A | — | A | — | — | — | — | — |
| 六项授权读取 | R | R | R | 摘要 | — | — | 候选相关 | — |
| 六项授权写入 | W | — | W | — | — | — | — | — |
| 训练/评测授权写入 | W | — | W | — | — | — | — | — |
| 评审任务分配 | W | — | W | W（内容） | — | — | — | — |
| 案例/反例评审提交 | C | — | C | C | — | C | C | — |
| 裁决 | A | — | A（设计） | A（内容事实） | — | — | C（技术事实） | — |
| 候选提交 | — | — | — | — | — | — | W | — |
| 硬检查触发/重跑 | R | — | R | — | — | — | W | — |
| 实验/盲测管理 | W | — | W | — | — | — | W | R（聚合） |
| 盲测评审 | C | — | C | C | — | C | C | — |
| 数据集创建/编辑 | W | — | W | — | — | — | W | — |
| 数据集批准 | A | — | A | — | — | — | — | — |
| 数据集导出/下载 | E | E | E | — | — | — | — | — |
| 审计读取 | 全量 | 全量 | 本 Workspace | 内容范围 | 自己 | 自己 | 自己 | — |

补充规则：作者/候选提交人不得评审自己的对象；Holdout Brief 只有 `OWNER/ADMIN` 可见；跨 Workspace 统一 `404`；`ADMIN` 可导出已批准数据但不能修改训练/评测授权；所有校验在服务端执行。

## 4. API 与端到端流程

### 4.1 API 分组

| 分组 | 代表路径 | 方法 | 权限 |
| --- | --- | --- | --- |
| 认证 | `/api/v1/auth/login`、`/api/v1/auth/feishu/start`、`/api/v1/invitations/:token/accept` | POST | 公开/受邀者 |
| 成员 | `/api/v1/members`、`/api/v1/members/:id/roles` | GET/POST/PATCH | OWNER/ADMIN |
| Brief | `/api/v1/briefs`、`/api/v1/briefs/:id`、`/briefs/:id/versions` | GET/POST/PATCH | 按角色；Holdout 仅 OWNER/ADMIN |
| 案例 | `/api/v1/cases`、`/api/v1/cases/:id/submit`、`/api/v1/counterexamples` | GET/POST/PATCH/POST | ANNOTATOR/DESIGN_LEAD 等 |
| 授权 | `/api/v1/cases/:id/authorization`、`/api/v1/authorization-events` | GET/PATCH | 写：OWNER/DESIGN_LEAD |
| 评审 | `/api/v1/review-tasks`、`/api/v1/review-tasks/:id/claim`、`/submit` | GET/POST | 被分配人 |
| 裁决 | `/api/v1/arbitrations/:id/resolve` | POST | DESIGN_LEAD/CONTENT_LEAD/OWNER |
| 候选 | `/api/v1/candidates`、`/api/v1/candidates/:id/versions`、`/check` | GET/POST | AI_ENGINEER |
| 盲测 | `/api/v1/experiments/:id/pairs/:pairId/session`、`/comparisons` | GET/POST | 被分配评审；提交前 DTO 白名单 |
| 数据集 | `/api/v1/datasets`、`/validate`、`/approve`、`/export`、`/exports/:id/download` | GET/POST | 创建：OWNER/DESIGN_LEAD/AI_ENGINEER；导出：OWNER/ADMIN/DESIGN_LEAD |
| 审计 | `/api/v1/audit-logs` | GET | 按 RBAC 范围 |
| 通知 | `/api/v1/notifications`、`/read` | GET/PATCH | 当前用户 |

统一错误：`400 VALIDATION_ERROR`、`401 UNAUTHENTICATED`、`403 FORBIDDEN`、`404 NOT_FOUND`、`409 INVALID_STATE`、`422 DATASET_BLOCKED`。写接口必须返回 `requestId` 并写审计。

### 4.2 三条必须打通的 E2E

**流程 A：案例入库**
创建 Brief → 创建 Case → 上传 375px 截图与 HTML → 案例卡（授权、机制、六维自评）→ 提交 → 分配两名独立评审 → 两评提交并锁定 → 分歧自动进入裁决 → 裁决通过 → 状态 `ELIGIBLE` → 审计记录完整。

**流程 B：候选与盲测**
创建实验 → 创建候选并写入模型/版本/HTML/截图 → 服务端 5 项硬检查 → 无 BLOCK 才进入 pair → 每名评审获得独立随机 A/B → 先硬检查后六维评分与偏好/理由 → 双评前互不可见 → 双评锁定后裁决人可见 → 实验关闭生成聚合与实验记录。

**流程 C：数据集导出**
筛选案例/反例/brief → 创建数据集 → 服务端校验 `canUseForTraining`/`canUseForEvaluation`、版本、评审状态、Holdout 与法律冻结 → 缺失即 `BLOCKED` 且阻止导出 → 通过后生成 version/rights/manifest hash 快照 → 导出 JSONL + manifest + assets（CSV 仅汇总）→ 下载审计记录导出人、时间、版本、hash。

## 5. 测试与验收

### 5.1 自动化覆盖

- 集成测试：登录/邀请、角色越权、Brief 版本、案例版本、评审不可覆盖、Holdout 隔离。
- E2E：流程 A、B、C 各至少 1 条；375px 预览；恶意 HTML 不执行脚本、不请求外网。
- 安全测试：跨 Workspace 404、盲测 DTO 泄漏、作者回避、ADMIN 改授权 403、授权缺失导出阻断。
- 数据测试：六维 N/A 重归一化、分歧阈值、数据集 manifest/hash 可复现、审计链连续。

### 5.2 验收门槛

- `OWNER`、`DESIGN_LEAD`、`ANNOTATOR` 可各自完成职责；`VIEWER`/`ADMIN` 完成权限回归。
- 案例双评与盲测双评均可完整走通，提交后无原地修改入口。
- 授权不完整的案例不能进入训练/评测导出；数据集导出有版本和授权快照。
- 375px 截图可查看；恶意 HTML 不执行脚本或外部请求。
- 仪表盘指标与种子数据可核对；关键写操作均有审计。
- 全新环境按 README 启动，迁移与种子可重复执行，演示账号可登录。

## 6. 需确认的实现假设

1. **反例独立建表**：保留 `Counterexample` 与独立版本/资产/评审表，页面仍统一放在“案例库”下；这与“不得混表”原则一致。
2. **P0 硬检查为 5 项**：正文完整性、图片位置、安全 HTML、375px 溢出、对比度；规则 ID/版本/严重级别框架预留 18 条扩展。
3. **Holdout 可见性**：`OWNER` 与 `ADMIN` 视为管理员；Design Lead 不在普通列表看到正文，只能通过获准的聚合/导出流程接触。
4. **角色映射**：P0 由 `ANNOTATOR` 录入案例、`DESIGN_LEAD` 审批；不新增 Designer 角色，后续可扩展映射而不改主数据模型。
5. **飞书降级**：MVP 先交付邮箱邀请 + 站内通知 + Feishu adapter；真实 OAuth/机器人以环境变量启用。
6. **存储降级**：本地演示用文件系统；部署用 S3/OSS 适配器，不在代码中硬编码云厂商。
7. **服务形态**：MVP 使用 Next.js Route Handlers 承载 REST，而非独立 Fastify 进程；业务服务层保持可抽取。

这些假设若不成立，需在编码前调整范围或数据模型；确认后按第 1 节排期实施。
