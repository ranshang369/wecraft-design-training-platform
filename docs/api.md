# API v1

Base URL: `/api/v1`. Except for login, health check and invitation acceptance, all endpoints require a server-side session cookie. Errors use a JSON envelope.

```json
{ "error": { "code": "FORBIDDEN", "message": "权限不足", "details": null } }
```

## 通用约定

- 鉴权：`dt_session` HttpOnly Cookie，会话保存在 `Session` 表；服务端每次按 `Membership` 重新读取角色。
- 多租户：所有查询同时限定 `workspaceId`；跨 Workspace 资源统一返回 404。
- Holdout：非 `OWNER/ADMIN` 无法读取 Holdout Brief、案例、反例、候选、含 Holdout 条目的数据集、关联评审任务及其文件。
- 版本化：Brief、Case、Counterexample 的修改不覆盖旧版本；评审修订生成新 Review 版本。
- 幂等与不可变：评审提交后重复提交返回 409；数据集必须经过 `validate → approve → export`。
- 时间：ISO 8601 UTC；文件通过带 Cookie 的 `/files/:id/content` 读取。

## 认证、邀请与成员

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | 无 | `{ ok, service, time }` | 公开 |
| `POST` | `/auth/login` | `{ email, password }` | `{ user, roles, workspaceId }` + Set-Cookie | 公开 |
| `POST` | `/auth/logout` | 无 | `{ ok: true }` | 登录用户 |
| `GET` | `/auth/me` | 无 | `{ userId, workspaceId, email, name, roles }` | 登录用户 |
| `GET` | `/invitations` | 无 | 待处理邀请列表 | OWNER/ADMIN |
| `POST` | `/invitations` | `{ email, roleCode }` | 邀请与一次性 token（MVP 不自动发邮件） | OWNER/ADMIN；仅 OWNER 可邀请 OWNER |
| `POST` | `/invitations/accept` | `{ token, name, password }` | 用户与成员关系 | 公开；已有账号必须使用原密码 |
| `GET` | `/members` | 无 | 成员、邮箱、角色、状态 | OWNER/ADMIN/DESIGN_LEAD/CONTENT_LEAD/AI_ENGINEER |
| `PATCH` | `/members/:id/roles` | `{ roles: string[] }` | 更新后的成员 | OWNER/ADMIN |

## Brief

| 方法 | 路径 | 输入/输出 | 权限 |
| --- | --- | --- | --- |
| `GET` | `/briefs` | 列表；非 Owner/Admin 过滤 Holdout | 登录用户 |
| `POST` | `/briefs` | `title/purpose/split/manuscriptMarkdown/images/targetAudience/designCommission/brandRequirements/prohibitedItems`；输出 Brief | OWNER/CONTENT_LEAD/EDITOR；HOLDOUT 仅 OWNER/ADMIN |
| `GET` | `/briefs/:id` | Brief + 当前版本 | 登录用户；Holdout 仅 OWNER/ADMIN |
| `PATCH` | `/briefs/:id` | 创建字段的可选子集；输出新版本 | OWNER/CONTENT_LEAD/EDITOR |
| `POST` | `/briefs/:id/approve` | 无 | Brief 进入 READY，记录审批人/时间 | OWNER/DESIGN_LEAD/CONTENT_LEAD |

## 优质案例

创建案例的核心字段：`title, archetype, briefId, applicableConditions, designMechanism, antiPatterns, mechanismTags, selfScores, sourceType, sourceNote, html, screenshotDataUrl`。截图必须是 375px 或 750px（2x）PNG/JPEG/WebP/SVG，最大 8 MB。

| 方法 | 路径 | 输入/输出 | 权限 |
| --- | --- | --- | --- |
| `GET` | `/cases` | 案例列表；非 Owner/Admin 过滤 Holdout | 登录用户；VIEWER 仅看 ELIGIBLE |
| `POST` | `/cases` | 创建案例与 v1 资产；输出 Case | OWNER/DESIGN_LEAD/ANNOTATOR |
| `GET` | `/cases/:id` | 案例、当前版本、资产、授权、可见评审 | 登录用户；Holdout 仅 OWNER/ADMIN |
| `PATCH` | `/cases/:id` | 编辑字段；生成新版本并重置为 SUBMITTED | OWNER/DESIGN_LEAD/ANNOTATOR |
| `POST` | `/cases/:id/submit` | 无；要求截图与 HTML 已存在 | OWNER/DESIGN_LEAD/ANNOTATOR |
| `POST` | `/cases/:id/assign` | `{ reviewerIds: uuid[] }`，至少 2 人 | OWNER/DESIGN_LEAD/CONTENT_LEAD |
| `PUT` | `/cases/:id/authorization` | 六项布尔授权、`evidenceStatus`、`evidenceNote`、`reason` | 仅 OWNER/DESIGN_LEAD |
| `POST` | `/cases/:id/resolve` | `{ outcome: ELIGIBLE|REJECTED|CHANGES_REQUESTED, reason }` | OWNER/DESIGN_LEAD/CONTENT_LEAD |
| `POST` | `/cases/:id/approve` | 无；要求当前版本两名评审、全部 PUBLISHABLE、授权证据 VERIFIED | OWNER/DESIGN_LEAD |

授权字段默认全部为 `false`：`canUseForGeneration`、`canUseForDisplay`、`canUseForTraining`、`canUseForEvaluation`、`canDeriveMechanism`、`canShowPublicly`。授权变更写入 `AuthorizationEvent` 与 `AuditLog`。

## 反例

反例与优质案例是独立对象，不共用案例表。

| 方法 | 路径 | 输入/输出 | 权限 |
| --- | --- | --- | --- |
| `GET` | `/counterexamples` | 列表；Holdout 过滤 | 登录用户 |
| `POST` | `/counterexamples` | `title/archetype/briefId/failureSummary/failureLabels/reproductionSteps/rootCause/repairSuggestion/applicableConditions/sourceType/sourceNote/html/screenshotDataUrl` | OWNER/DESIGN_LEAD/ANNOTATOR/AI_ENGINEER |
| `GET` | `/counterexamples/:id` | 反例、版本、资产、评审、授权 | 登录用户；Holdout 仅 OWNER/ADMIN |
| `POST` | `/counterexamples/:id/submit` | 无 | 编辑权限角色 |
| `POST` | `/counterexamples/:id/assign` | `{ reviewerIds }` | OWNER/DESIGN_LEAD/CONTENT_LEAD |
| `POST` | `/counterexamples/:id/approve` | 无 | OWNER/DESIGN_LEAD |
| `PUT` | `/counterexamples/:id/authorization` | 同案例授权 | 仅 OWNER/DESIGN_LEAD |

## 评审任务

| 方法 | 路径 | 输入/输出 | 权限 |
| --- | --- | --- | --- |
| `GET` | `/review-tasks` | 当前用户 PENDING/ASSIGNED/IN_PROGRESS 任务；过滤 Holdout | 登录用户 |
| `GET` | `/review-tasks/:id` | 任务与案例、反例、盲测或裁决上下文；双评未齐隐藏他人分数 | 任务受派人或管理/裁决角色 |
| `POST` | `/review-tasks/:id/claim` | 无 | 任务受派人 |
| `POST` | `/review-tasks/:id/submit` | 案例/反例六维评分、推荐、理由、证据 | 任务受派人；作者不能评审自己的案例/反例 |
| `POST` | `/review-tasks/:id/revise` | 同提交字段 + `reason`；输出新版本 | 任务受派人；仅 SUBMITTED 任务 |
| `POST` | `/review-tasks/:id/arbitrate` | `{ preference: LEFT|RIGHT|TIE, reason }` | 裁决任务受派人或 OWNER/DESIGN_LEAD/CONTENT_LEAD；要求两名盲测评审已提交 |

评分维度固定为：`CONTENT_FIT`、`VISUAL_MECHANISM`、`TYPE_HIERARCHY`、`IMAGE_NARRATIVE`、`RHYTHM`、`COMPLETION`。整数 1–5；只有案例的 `IMAGE_NARRATIVE` 允许 N/A。

## 候选设计与硬检查

| 方法 | 路径 | 输入/输出 | 权限 |
| --- | --- | --- | --- |
| `GET` | `/candidates` | 候选、当前版本、最新硬检查；非管理角色隐藏模型字段；非 Owner/Admin 过滤 Holdout 候选 | 登录用户 |
| `POST` | `/candidates` | `{ title, briefId, experimentId?, modelProvider, modelName, modelVersion, html, screenshotDataUrl }` | AI_ENGINEER |
| `GET` | `/candidates/:id` | 候选、资产、版本、最新硬检查 | 登录用户；Holdout 候选仅 OWNER/ADMIN；VIEWER 仅已进入或完成盲测的候选 |
| `POST` | `/candidates/:id/hard-check` | 无；执行 HC-01…HC-05；输出 `{ ok, run, checks }` | AI_ENGINEER |
| `POST` | `/candidates/:id/submit` | 无；执行硬检查并按结果更新状态 | AI_ENGINEER |

硬检查：HC-01 正文完整性（BLOCK）、HC-02 图片位置/固定定位（WARN）、HC-03 安全 HTML（BLOCK）、HC-04 375px 横向溢出（BLOCK）、HC-05 正文对比度（BLOCK）。渲染器不可用时 HC-04/05 返回 ERROR，候选按 fail-closed 处理。

## 实验与盲测

| 方法 | 路径 | 输入/输出 | 权限 |
| --- | --- | --- | --- |
| `GET` | `/experiments` | 实验列表 | 登录用户 |
| `POST` | `/experiments` | `{ name, briefId, candidateIds[>=2], reviewerIds[>=2], adjudicatorId }` | OWNER/DESIGN_LEAD/AI_ENGINEER |
| `GET` | `/experiments/:id` | 实验、pair、候选；非管理角色返回匿名摘要 | 登录用户 |
| `POST` | `/experiments/:id/close` | 无；所有 pair COMPLETED/CANCELLED 后才可关闭 | OWNER/DESIGN_LEAD/AI_ENGINEER |
| `GET` | `/experiments/:id/results` | 完整比较结果 | 仅实验管理角色；实验必须 CLOSED |
| `GET` | `/experiments/:id/blind` | 当前用户被分配的 pair 列表 | 被分配评审或管理角色 |
| `GET` | `/experiments/:id/pairs/:pairId/blind` | A/B 匿名资产、Brief、双方硬检查、本人已提交内容 | 仅该 pair 被分配评审 |
| `POST` | `/experiments/:id/pairs/:pairId/blind` | `{ scores:{left,right}, preference, rationale, confidence, durationMs, hardCheckAcknowledged, hardCheckNotes }` | 仅该 pair 被分配评审 |

盲测 GET 不返回模型名、模型版本、候选来源、上一轮分数或其他评审分数；实验 CLOSED 后才返回 `reveal` 候选 ID。提交必须显式 `hardCheckAcknowledged=true`，且双方最新硬检查无 BLOCK FAIL/ERROR。

## 数据集

| 方法 | 路径 | 输入/输出 | 权限 |
| --- | --- | --- | --- |
| `GET` | `/datasets` | 数据集列表与条目/导出计数；过滤含 Holdout 条目的数据集 | 登录用户 |
| `POST` | `/datasets` | `{ name, type: TRAIN|EVAL, caseIds, briefIds, counterexampleIds, candidateIds }` | OWNER/DESIGN_LEAD/AI_ENGINEER |
| `GET` | `/datasets/:id` | 数据集、条目、导出记录 | 登录用户；含 Holdout 条目的数据集仅 OWNER/ADMIN |
| `POST` | `/datasets/:id/validate` | 无；检查授权、双评、ELIGIBLE/APPROVED、Holdout、法律冻结 | OWNER/DESIGN_LEAD/AI_ENGINEER |
| `POST` | `/datasets/:id/approve` | 无；只允许 READY_FOR_APPROVAL | OWNER/DESIGN_LEAD |
| `POST` | `/datasets/:id/export` | 无；生成 ZIP + manifest.json + DatasetExport | OWNER/ADMIN/DESIGN_LEAD |
| `GET` | `/datasets/:id/exports/:exportId/download` | ZIP 二进制，15 分钟有效 | OWNER/ADMIN/DESIGN_LEAD |

校验会保存每个条目的版本 ID、内容哈希和授权快照。导出前再次检查案例/反例/Brief/候选版本漂移、授权漂移和条目集合漂移，任何变化都会阻断。ZIP 至少包含：`briefs.jsonl`、`cases.jsonl`、`counterexamples.jsonl`、`candidates.jsonl`、对应 CSV、`manifest.json`、`summary.csv` 和原始 HTML/截图资产。

## 仪表盘、通知、审计与文件

| 方法 | 路径 | 输入/输出 | 权限 |
| --- | --- | --- | --- |
| `GET` | `/dashboard` | 覆盖率、授权完整度、评审完成度、一致性、硬失败率、盲测胜率、准备度 | 登录用户 |
| `GET` | `/notifications` | 当前用户通知 | 登录用户 |
| `POST` | `/notifications/read-all` | 无 | 登录用户 |
| `PATCH` | `/notifications/:id/read` | 无 | 当前用户 |
| `GET` | `/audit-logs` | 最近 200 条审计 | OWNER/ADMIN/DESIGN_LEAD/CONTENT_LEAD |
| `GET` | `/files/:id/content` | 文件内容；HTML 先清洗并返回 CSP | 登录用户；必须能访问关联案例/反例/候选；Holdout 仅 OWNER/ADMIN；数据集 ZIP 只能走带审计的下载接口 |

文件响应包含 CSP：`default-src none; img-src data:; style-src unsafe-inline; connect-src none; script-src none; form-action none`。HTML 预览组件使用 `sandbox=""`，不授予 `allow-scripts` 或 `allow-same-origin`。

审计日志按 Workspace 串行追加 `prevHash → entryHash` 哈希链。`occurredAt` 与库内记录一致，可按 `id ASC` 独立复算，E2E 测试会校验每条记录的前序哈希和自身哈希。

## 关键错误码

- `409 INVALID_STATE`：状态不允许当前操作，例如重复提交评审或提前关闭实验。
- `422 DATASET_BLOCKED`：数据集存在授权、双评、版本或法律冻结阻断。
- `400 HARD_CHECK_REQUIRED`：盲测未确认硬检查。
- `409 HARD_CHECK_FAILED`：候选存在 BLOCK 硬检查失败。
- `403 FORBIDDEN`：服务端能力校验失败。
- `404 NOT_FOUND`：资源不存在或跨 Workspace/无权查看。

