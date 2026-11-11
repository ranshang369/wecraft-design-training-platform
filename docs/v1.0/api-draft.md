# WeCraft 设计训练协作平台 API 草案 v1.0

> 状态：冻结候选，供开发估算与接口评审。实现可用 Next.js Route Handlers + Fastify/tRPC 等价方案；本文件以 HTTP/JSON 语义为准。

## 0. 结论

- 以 `/api/v1` REST 为基线，共约 60+ 个端点；所有写操作在服务端做角色、Workspace、对象、分配和利益冲突校验。
- 盲测使用签名 `pairSessionId` 和白名单 DTO；候选 ID、模型、来源、历史分数不得出现在响应中。
- 评审、授权、导出、法律冻结均为事务 + 审计；提交后不可原地修改，修订生成新版本。
- 外部候选写入使用最小 scope Token；Token 不能导出、批准或修改授权。

## 1. 通用约定

| 项目 | 约定 |
| --- | --- |
| Base URL | `/api/v1` |
| 认证 | 浏览器会话 Cookie（HttpOnly、Secure、SameSite=Lax）；飞书 OAuth 或邮箱登录后建立 |
| CSRF | 所有写请求要求 `X-CSRF-Token`；OAuth 回调除外 |
| 幂等 | 创建/导出/提交支持 `Idempotency-Key`；同 key 同用户 24 小时内返回同一结果 |
| 并发 | 可编辑资源 PATCH 使用 `If-Match: <row_version>`；冲突 `409 VERSION_CONFLICT` |
| 分页 | `?cursor=...&limit=50`；返回 `nextCursor`；默认 50，最大 100 |
| 响应 | 成功 `{ "data": ..., "meta": {...} }`；错误 `{ "error": { "code", "message", "details", "requestId" } }` |
| 时间 | ISO8601 UTC；展示层本地化 |
| 权限 | 每个端点先角色校验，再 Workspace/对象/分配/利益冲突校验；跨 Workspace 返回 `404` |
| 审计 | 写操作、导出、下载、授权、裁决、法律冻结、破窗均同事务写 `audit_logs` |
| 文件 | 先 `POST /files/presign` 获取短期上传 URL，再引用 `stored_file_id`；HTML 只允许上传到隔离桶 |
| 速率 | 登录 10 次/分钟/IP；导出 5 次/小时/用户；盲测提交 30 次/分钟/用户；超出 `429 RATE_LIMITED` |

### 1.1 错误码

| HTTP | Code | 场景 |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | 无会话/会话过期 |
| 403 | `FORBIDDEN` | 角色、分配、利益冲突或字段级限制 |
| 404 | `NOT_FOUND` | 不存在或跨 Workspace |
| 422 | `VALIDATION_ERROR` | 字段/评分/证据不合法 |
| 409 | `VERSION_CONFLICT` | `If-Match` 不匹配 |
| 409 | `INVALID_STATE` | 状态机不允许 |
| 409 | `AUTHORIZATION_INCOMPLETE` | 六授权/证据不足 |
| 403 | `BLIND_METADATA_FORBIDDEN` | 请求盲测禁止字段 |
| 422 | `HTML_UNSAFE` | 危险 HTML/外部请求/脚本 |
| 409 | `HARD_CHECK_BLOCKED` | 存在 BLOCK 失败 |
| 409 | `DATASET_BLOCKED` | 数据集存在阻断项 |
| 409 | `EXPORT_NOT_READY` | 未批准/未校验/文件未生成 |
| 423 | `LEGAL_HOLD_ACTIVE` | 法律冻结 |
| 429 | `RATE_LIMITED` | 限流 |

## 2. 认证、Workspace 与成员

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/auth/feishu/start` | `redirect`（白名单） | 302 到飞书授权页 | 公开 |
| GET | `/auth/feishu/callback` | `code`、`state` | 建立会话；302 到前端 | 公开 |
| POST | `/auth/email/login` | `email`、`password` | 会话；用户摘要 | 公开（仅被邀请/已创建用户） |
| POST | `/auth/logout` | — | 204 | 已登录 |
| GET | `/me` | — | 用户、Workspace、角色、权限摘要 | 已登录 |
| GET | `/workspaces` | — | 当前用户可见 Workspace | 已登录 |
| GET | `/workspaces/:wid` | — | Workspace 配置与配额 | 成员 |
| PATCH | `/workspaces/:wid` | `name`、`holdoutRatio`、配额、配置 | 更新后 Workspace | OWNER/ADMIN |
| GET | `/workspaces/:wid/members` | `status`、`role` | 成员列表（脱敏） | OWNER/ADMIN；其他角色仅见姓名/角色 |
| POST | `/workspaces/:wid/invitations` | `email`、`roleId`、`expiresInDays` | 邀请记录；一次性 token 仅返回一次 | OWNER/ADMIN |
| POST | `/invitations/:token/accept` | `password`（邮箱路径） | 成员关系；会话 | 受邀人 |
| POST | `/workspaces/:wid/members/:mid/roles` | `roleCodes[]` | 更新后的角色 | OWNER；ADMIN 不可授予/撤销 OWNER |
| DELETE | `/workspaces/:wid/members/:mid/roles/:role` | — | 204 | OWNER；ADMIN（非 OWNER 角色） |
| POST | `/workspaces/:wid/members/:mid/suspend` | `reason` | 204 | OWNER/ADMIN；最后 Owner 保护 |

行为：

- 飞书登录只请求 `open_id`、姓名、头像；邮箱可选。未配置飞书时邮箱路径必须可用。
- 邀请 token 只存 hash，7 天过期；接受时校验邮箱一致。
- 最后一个 `OWNER` 不可移除、停用或降级；返回 `INVALID_STATE`。

## 3. Brief

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/workspaces/:wid/briefs` | `status`、`purpose`、`split`、`q`、`cursor` | Brief 列表（含当前版本摘要） | 成员；VIEWER 仅已批准 |
| POST | `/workspaces/:wid/briefs` | `title`、`purpose`、`split`、正文/图片/读者/委托/品牌/禁止项 | Brief + 版本 1 | OWNER/CONTENT_LEAD/EDITOR |
| GET | `/briefs/:id` | — | Brief、当前版本、关联案例、授权摘要 | 成员；VIEWER 仅已批准 |
| PATCH | `/briefs/:id` | `title`、`purpose`、`split`、`If-Match` | 更新后的 Brief | 作者/CONTENT_LEAD/OWNER |
| POST | `/briefs/:id/versions` | 完整内容字段 | 新版本；`currentVersionId` 更新 | 作者/CONTENT_LEAD/OWNER |
| GET | `/briefs/:id/versions/:version` | — | 不可变版本内容 | 成员；VIEWER 仅已批准 |
| POST | `/briefs/:id/submit` | `versionId` | `READY` Brief | 作者/CONTENT_LEAD |
| POST | `/briefs/:id/approve` | `versionId`、`note` | 已批准 Brief | CONTENT_LEAD + DESIGN_LEAD（黄金 brief 还需 OWNER 最终签收） |
| POST | `/briefs/:id/archive` | `reason` | `ARCHIVED` | OWNER/DESIGN_LEAD |
| GET | `/workspaces/:wid/coverage` | — | 9 主型覆盖、缺口、holdout 比例 | 成员 |

校验：

- `purpose=GOLDEN_EVAL` 必须提供 `userIntent`、`hardConstraints`、`acceptableArchetypes`、`mustAvoid`、`referenceCaseIds`、`humanReference`（1–3 份）、`rubricTargets`、`acceptanceNotes`。
- `split` 变更只能由 `CONTENT_LEAD/OWNER`；holdout 目标 30%，超过容差返回 `VALIDATION_ERROR` 并显示当前比例。
- 已批准 Brief 的新版本回到 `DRAFT/READY`，需重新签收；不得静默覆盖。

## 4. 案例与反例

### 4.1 案例

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/workspaces/:wid/cases` | `status`、`archetype`、`q`、`cursor` | 案例列表；六授权摘要 | 成员；VIEWER 仅 APPROVED + 可展示 |
| POST | `/workspaces/:wid/cases` | `title`、`archetype`、`briefId?`、`summary`、`applicableConditions`、`designMechanism`、`mechanismTags`、`sourceType`、`sourceNote`、`antiPatterns`、`selfScores` | `DRAFT` 案例 + 版本 1 | OWNER/DESIGN_LEAD/ANNOTATOR |
| GET | `/cases/:id` | — | 案例、版本、资产、授权、评审摘要 | 成员（VIEWER 受限） |
| PATCH | `/cases/:id` | 元数据、`If-Match` | 更新 | 作者/DESIGN_LEAD/OWNER |
| POST | `/cases/:id/versions` | 完整内容字段 | 新版本 | 作者/DESIGN_LEAD/OWNER |
| POST | `/cases/:id/assets` | `storedFileId`、`kind`、`width`、`height`、`altText`、`isPrimary` | 资产记录 | 作者/DESIGN_LEAD |
| DELETE | `/cases/:id/assets/:assetId` | — | 204 | 作者/DESIGN_LEAD；仅 DRAFT/CHANGES_REQUESTED |
| POST | `/cases/:id/submit` | `versionId`、`idempotencyKey` | `SUBMITTED` | 作者/DESIGN_LEAD |
| POST | `/cases/:id/withdraw` | `reason` | `DRAFT` | 作者；仅未开始评审 |
| POST | `/cases/:id/approve` | `versionId`、`reason`、`If-Match` | `APPROVED` | DESIGN_LEAD/OWNER；不得自批 |
| POST | `/cases/:id/reject` | `versionId`、`reason` | `REJECTED` | DESIGN_LEAD/OWNER |
| POST | `/cases/:id/quarantine` | `reason`、`scope` | `QUARANTINED` | OWNER/DESIGN_LEAD/系统 |
| POST | `/cases/:id/restore` | `reason` | `IN_REVIEW` | OWNER/DESIGN_LEAD；需授权/法律解除 |
| POST | `/cases/:id/archive` | `reason` | `ARCHIVED` | OWNER/DESIGN_LEAD |

### 4.2 反例

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/workspaces/:wid/counterexamples` | `status`、`archetype`、`q` | 反例列表 | 成员；VIEWER 仅 APPROVED |
| POST | `/workspaces/:wid/counterexamples` | `title`、`archetype`、`briefId?`、`failureSummary`、`failureLabels`、`reproductionSteps`、`rootCause?`、`repairSuggestion`、`applicableConditions`、`sourceType`、`sourceNote` | `DRAFT` 反例 | OWNER/DESIGN_LEAD/ANNOTATOR/AI_ENGINEER |
| GET | `/counterexamples/:id` | — | 反例、版本、资产、授权、评审 | 成员（VIEWER 受限） |
| PATCH | `/counterexamples/:id` | 元数据、`If-Match` | 更新 | 作者/DESIGN_LEAD/OWNER |
| POST | `/counterexamples/:id/versions` | 完整内容字段 | 新版本 | 作者/DESIGN_LEAD/OWNER |
| POST | `/counterexamples/:id/assets` | 同案例资产 | 资产记录 | 作者/DESIGN_LEAD |
| POST | `/counterexamples/:id/submit` | `versionId` | `SUBMITTED` | 作者/DESIGN_LEAD |
| POST | `/counterexamples/:id/approve` | `versionId`、`reason` | `APPROVED` | DESIGN_LEAD/OWNER |
| POST | `/counterexamples/:id/reject` | `versionId`、`reason` | `REJECTED` | DESIGN_LEAD/OWNER |
| POST | `/counterexamples/:id/quarantine` | `reason` | `QUARANTINED` | OWNER/DESIGN_LEAD/系统 |
| POST | `/counterexamples/:id/archive` | `reason` | `ARCHIVED` | OWNER/DESIGN_LEAD |

### 4.3 六项授权

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/:subjectType/:id/authorization` | — | 六项授权、证据状态、有效期、限制 | OWNER/DESIGN_LEAD；ADMIN 只读；其他角色仅摘要 |
| PUT | `/:subjectType/:id/authorization` | 六项 boolean、`evidenceType`、`evidenceFileId`、`rightsHolder`、`licenseName`、`validFrom/To`、`restrictionNote`、`reason`、`If-Match` | 更新后的授权 + `authorizationEvent` | OWNER/DESIGN_LEAD |
| POST | `/:subjectType/:id/authorization/verify` | `evidenceFileId`、`note` | `VERIFIED` | OWNER/DESIGN_LEAD；核验人不得等于录入人 |
| POST | `/:subjectType/:id/authorization/revoke` | `fields[]`、`reason`、`impactScope` | 字段置 false；隔离任务 | OWNER/DESIGN_LEAD |

`subjectType` 取 `cases`/`counterexamples`。新建主体时授权六项一律 false；创建请求携带 true 返回 `VALIDATION_ERROR`。训练/评测两项只有 OWNER/DESIGN_LEAD 可写，ADMIN 写返回 `FORBIDDEN`。撤回可指定一个或多个字段；只撤回训练授权不得影响展示/评测，`authorization_events.changed_fields` 记录每个字段旧值/新值。

## 5. 评审、裁决与修订

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/review-tasks` | `assignee=me`、`status`、`type`、`dueBefore`、`cursor` | 我的任务列表 | 已登录；仅本人任务 |
| POST | `/cases/:id/review-cycles` | `reviewerIds[2]`、`dueAt`、`round` | 2 个 `CASE_REVIEW` 任务 | DESIGN_LEAD/OWNER |
| POST | `/counterexamples/:id/review-cycles` | `reviewerIds[2]`、`dueAt`、`round` | 2 个 `COUNTEREXAMPLE_REVIEW` 任务 | DESIGN_LEAD/OWNER |
| POST | `/review-tasks/:id/accept` | — | `IN_PROGRESS` | 被分配人 |
| POST | `/review-tasks/:id/decline` | `reason`、`conflictOfInterest` | `DECLINED`；触发重分配 | 被分配人 |
| POST | `/review-tasks/:id/submissions` | 六维分、证据、结论、`snapshotHash` | 不可变评审记录 | 被分配评审；非作者 |
| POST | `/review-tasks/:id/arbitration` | `decision`、`rationale`、`evidence[]`、`ruleImpact?` | 裁决评审；案例状态更新 | 裁决人/OWNER（按争议类型） |
| GET | `/cases/:id/reviews` | — | 评审摘要/个人评审 | 双评锁定后 DESIGN_LEAD/OWNER；评审人仅自己 |
| POST | `/reviews/:id/revisions` | 新评分/证据/理由 | 新版本评审；旧版 `SUPERSEDED` | 原评审人；已批准后需 DESIGN_LEAD 决定重开 |

`POST /review-tasks/:id/submissions` 按任务类型校验：

- `CASE_REVIEW`：`scores` 恰好六个维度，整数 1–5；无图时仅 `IMAGE_NARRATIVE` 可 `N/A`；`recommendation` 为 `PUBLISHABLE/NOT_PUBLISHABLE/CHANGES_REQUESTED`；至少 1 条证据。
- `COUNTEREXAMPLE_REVIEW`：`failureConfirmed`、`repairAdequate`、六维分、`recommendation` 为 `ACCEPTED/CHANGES_REQUESTED/REJECTED`；至少 1 条证据。
- 证据结构：`{type:"SCREENSHOT_REGION", locator:{x,y,w,h,assetId}, excerpt?}`、`{type:"HTML_FRAGMENT", locator:{selector,htmlHash}, excerpt}` 或 `{type:"MANUSCRIPT_EXCERPT", locator:{startOffset,endOffset}, excerpt}`。
- 提交时服务端写入 `case_snapshot`/`counterexample_snapshot` 与 `content_hash`；提交后不可 UPDATE。
- 同一任务重复提交返回 `409 INVALID_STATE`；修订必须走 `/reviews/:id/revisions`。
- `BLIND_PAIRWISE` 任务不得调用通用 `submissions`；只能通过 `/blind/sessions/:sessionId/comparisons` 提交，避免绕过盲测 DTO 与展示顺序映射。

### 5.1 分歧判定

任一条件成立即 `ARBITRATION`：

1. 任一维度分差 ≥2。
2. 一人 `PUBLISHABLE`、另一人 `NOT_PUBLISHABLE`。
3. A/B 偏好相反。
4. 一人认为存在硬失败/复制/隐私问题，另一人通过。

裁决归属：设计问题 `DESIGN_LEAD`；内容事实/可发布性 `CONTENT_LEAD`；授权/隐私/法律 `OWNER + 法务`；技术事实 `AI_ENGINEER` 提供证据、`DESIGN_LEAD` 定结论。常规 1 个工作日，授权/法律 3 个工作日；超时由 OWNER 决定或标记阻塞。同一争议最多申诉一次。

## 6. 实验、候选与硬检查

### 6.1 实验与 pair

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/workspaces/:wid/experiments` | `status`、`cursor` | 实验列表 | 成员；VIEWER 仅聚合 |
| POST | `/workspaces/:wid/experiments` | `name`、`rubricVersionId`、`protocol` | `DRAFT` 实验 | OWNER/DESIGN_LEAD/AI_ENGINEER |
| GET | `/experiments/:id` | — | 实验、Brief、候选数、进度 | 成员（盲测字段脱敏） |
| PATCH | `/experiments/:id` | `name`、`protocol`、`If-Match` | 更新 | 创建人/DESIGN_LEAD/OWNER；`FROZEN` 后仅关闭 |
| POST | `/experiments/:id/briefs` | `briefVersionIds[]` | 关联 Brief | AI_ENGINEER/DESIGN_LEAD |
| POST | `/experiments/:id/freeze` | `candidateIds[]`、`pairs[]`、`randomizationSeed` | `FROZEN`；pair 快照 | AI_ENGINEER/DESIGN_LEAD |
| POST | `/experiments/:id/start` | `reviewerPool[]`、`adjudicatorIds[]`、`dueAt` | `RUNNING`；盲测任务 | OWNER/DESIGN_LEAD/AI_ENGINEER |
| POST | `/experiments/:id/close` | `reason`（强制关闭时） | `CLOSED`；聚合 | OWNER/DESIGN_LEAD |
| GET | `/experiments/:id/results` | — | 聚合胜率、TIE 率、n、Wilson 区间 | 成员；仅 `CLOSED` 后 |
| POST | `/experiments/:id/pairs` | `briefId`、`leftCandidateId`、`rightCandidateId`、`isHighValue` | pair | AI_ENGINEER |
| GET | `/experiments/:id/pairs` | `status` | pair 列表（脱敏） | 成员 |
| POST | `/experiments/:id/pairs/:pairId/cancel` | `reason` | `CANCELLED` | AI_ENGINEER/DESIGN_LEAD/OWNER |

`protocol` 默认：`reviewersPerPair=2`、`highValueReviewers=3`、`adjudicatorsPerPair=1`、`tieAllowed=true`、`revealAfterBatchClose=true`。`randomizationSeed` 只返回 hash；服务端保存原值用于复现。

来源 Brief 为 `GOLDEN_EVAL` 的 pair 自动按高价值处理（3 评取多数），客户端传入 `isHighValue=false` 不生效。

### 6.2 候选

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/candidates/:id` | — | 候选、版本、模型元数据、硬检查摘要 | 提交人/AI_ENGINEER/DESIGN_LEAD/OWNER |
| POST | `/experiments/:id/candidates` | `briefId`、`title`、`htmlFileId`、`screenshot375FileId`、`screenshotDesktopFileId`、`model*`、`generationParams`、`sourceCaseIds` | `DRAFT` 候选 + 版本 1 | AI_ENGINEER；不得引用无授权案例 |
| POST | `/workspaces/:wid/candidates/ingest` | Token + JSON：`briefId`、`html`或`htmlFileId`、截图、模型元数据 | 候选 + 版本 | `candidate:write` Token |
| POST | `/candidates/:id/versions` | 新 HTML/截图/模型元数据 | 新版本 | 提交人/AI_ENGINEER |
| POST | `/candidates/:id/submit` | `versionId` | `SUBMITTED` | 提交人/AI_ENGINEER |
| POST | `/candidates/:id/withdraw` | `reason` | `WITHDRAWN` | 提交人/AI_ENGINEER/OWNER |
| POST | `/candidates/:id/hard-checks` | `versionId`、`rulesetVersion?` | `HARD_CHECKING` + run | AI_ENGINEER/系统 |
| GET | `/candidates/:id/hard-checks` | `runId?` | 最新/指定运行与 18 条规则状态 | 提交人/AI_ENGINEER/DESIGN_LEAD/OWNER |
| GET | `/hard-check-runs/:runId` | — | run、技术结果、治理规则快照 | 同上 |
| POST | `/hard-checks/:checkId/exceptions` | `reason`、`expiresAt`、`evidence` | 有期限例外 | DESIGN_LEAD + AI_ENGINEER 双人；OWNER 可查 |
| POST | `/hard-checks/:checkId/appeals` | `reason`、`evidence` | `OPEN` 申诉 | 提交人/AI_ENGINEER；结果完成后 1 个工作日内 |
| POST | `/hard-check-appeals/:appealId/decision` | `decision`（`UPHELD/OVERTURNED`）、`note` | 裁决结果 + 审计 | DESIGN_LEAD + AI_ENGINEER；2 个工作日内；不可重复申诉 |

硬检查响应示例：

```json
{
  "data": {
    "runId": "uuid",
    "candidateVersion": 3,
    "rulesetVersion": "RULESET-TEST-1",
    "status": "FAIL",
    "summary": { "block": 1, "warn": 2, "pass": 10 },
    "checks": [
      { "ruleNo": "HC-03", "status": "FAIL", "severity": "BLOCK", "message": "375px 下横向溢出 42px", "evidence": { "scrollWidth": 417 } },
      { "ruleNo": "HC-10", "status": "FAIL", "severity": "WARN", "message": "结构相似度 0.96，需要人工复核" }
    ],
    "governance": [
      { "ruleNo": "HC-14", "status": "PASS", "rulesetVersion": "RULESET-TEST-1" },
      { "ruleNo": "HC-18", "status": "PASS", "message": "本次无静默豁免" }
    ]
  }
}
```

`BLOCK` 未消除且无有效例外时，候选不得进入 `READY_FOR_BLIND`。例外不修改原始结果；到期自动失效。

## 7. 盲测房间

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/blind/sessions/next` | `experimentId?` | 下一对盲测 session 或 204 | 被分配评审/裁决人 |
| GET | `/blind/sessions/:sessionId` | — | 盲测 DTO（见下） | session 所属评审 |
| POST | `/blind/sessions/:sessionId/comparisons` | `preference`、`scores`、`rationale`、`confidence`、`clientVersion` | 不可变比较记录 | session 所属评审 |
| POST | `/blind/comparisons/:id/revisions` | 新偏好/评分/理由 | 新版本；旧版 `SUPERSEDED` | 原评审；实验关闭前 |
| POST | `/blind/pairs/:pairId/reveal` | `reason` | 模型、来源、双方身份 | 裁决人；双评锁定后 |
| GET | `/experiments/:id/results` | — | 聚合与匿名来源 | 成员；整批关闭后 |

盲测 DTO 必须是白名单字段：

```json
{
  "pairSessionId": "signed-opaque-token",
  "expiresAt": "2026-11-12T10:00:00Z",
  "brief": {
    "title": "…",
    "manuscriptMarkdown": "…",
    "images": [{ "url": "/blind-assets/…", "alt": "…" }],
    "targetAudience": "…",
    "designCommission": "…",
    "brandRequirements": "…",
    "prohibitedItems": "…"
  },
  "sides": {
    "A": { "previewUrl": "/sandbox/…", "screenshot375Url": "/blind-assets/…", "summary": "…" },
    "B": { "previewUrl": "/sandbox/…", "screenshot375Url": "/blind-assets/…", "summary": "…" }
  },
  "rubric": {
    "dimensions": [
      { "code": "CONTENT_FIT", "name": "内容适配", "anchors": { "1": "…", "3": "…", "5": "…" } }
    ],
    "allowNa": ["IMAGE_NARRATIVE"]
  }
}
```

禁止下发/可推断：候选 ID、编号、标题、模型名/版本、来源案例、作者、生成参数、历史分数、其他评审分数、规范左/右、文件名中的模型信息。`pairSessionId` 为签名 token，绑定评审、pair、展示顺序与过期时间；刷新同一 session 顺序不变。

提交示例：

```json
{
  "preference": "A",
  "scores": {
    "A": { "CONTENT_FIT": 5, "VISUAL_MECHANISM": 4, "TYPOGRAPHY_HIERARCHY": 4, "IMAGE_NARRATIVE": "N/A", "RHYTHM": 4, "COMPLETENESS": 5 },
    "B": { "CONTENT_FIT": 4, "VISUAL_MECHANISM": 3, "TYPOGRAPHY_HIERARCHY": 4, "IMAGE_NARRATIVE": "N/A", "RHYTHM": 3, "COMPLETENESS": 4 }
  },
  "rationale": "A 的信息层级更清楚，但图像叙事两者均无图，记 N/A。",
  "confidence": 4
}
```

`TIE` 必须填写理由；服务端保存为“无偏好”，不计入 DPO/偏好训练数据。偏好为 `A/B` 时服务端映射到规范候选；展示侧不落库为用户可控字段。

## 8. 数据集与导出

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/workspaces/:wid/datasets` | `type`、`status`、`cursor` | 数据集列表 | 成员；VIEWER 仅已批准元数据 |
| POST | `/workspaces/:wid/datasets` | `name`、`type`、`format`、`rubricVersionId`、`filter` | `DRAFT` 数据集 | OWNER/DESIGN_LEAD/AI_ENGINEER |
| GET | `/datasets/:id` | — | 数据集、条目、排除项、授权摘要 | 成员（VIEWER 仅元数据） |
| PATCH | `/datasets/:id` | `name`、`filter`、`If-Match` | 更新 | 创建人/DESIGN_LEAD/OWNER；`APPROVED` 后拒绝 |
| POST | `/datasets/:id/items` | `items[]`（五种引用） | 条目；校验互斥 | 创建人/DESIGN_LEAD/OWNER |
| DELETE | `/datasets/:id/items/:itemId` | — | 204 | 创建人/DESIGN_LEAD；仅 `DRAFT/BLOCKED` |
| POST | `/datasets/:id/validate` | `expectedItemCount?` | `VALIDATING` 或同步校验结果 | 创建人/DESIGN_LEAD/OWNER |
| GET | `/datasets/:id/blockers` | — | 阻断项、原因、责任角色 | 创建人/DESIGN_LEAD/OWNER |
| POST | `/datasets/:id/approve` | `note`、`If-Match` | `APPROVED`；冻结 hash | OWNER/DESIGN_LEAD |
| POST | `/datasets/:id/exports` | `format`、`Idempotency-Key` | 导出任务 | OWNER/ADMIN/DESIGN_LEAD |
| GET | `/dataset-exports/:exportId` | — | 状态、hash、条目数、创建/完成时间 | OWNER/ADMIN/DESIGN_LEAD |
| GET | `/dataset-exports/:exportId/download` | — | 302 短期签名 URL | OWNER/ADMIN/DESIGN_LEAD |
| POST | `/dataset-exports/:exportId/revoke` | `reason` | `REVOKED`；链接失效 | OWNER/ADMIN/DESIGN_LEAD |
| POST | `/datasets/:id/revoke` | `reason` | `REVOKED`；隔离条目 | OWNER/ADMIN/DESIGN_LEAD |
| POST | `/datasets/:id/clone` | `newName?` | 新版本草稿 | 创建人/DESIGN_LEAD/OWNER |
| GET | `/datasets/:id/manifest` | — | manifest 预览（含 hash） | OWNER/ADMIN/DESIGN_LEAD |

数据集校验规则：

- `TRAIN`：不得含 `split=HOLDOUT` 的 Brief；只收 `canUseForTraining=true` 且授权证据有效的主体；反例必须 `APPROVED` 且有修复建议。
- `EVAL`：只收黄金 Brief、人工参考结果、评测目标和评分口径；只收 `canUseForEvaluation=true` 的主体；必须保留 30% holdout。
- 偏好条目只收 `preference != TIE` 的比较；评审双方均锁定、实验已关闭。
- 每条条目必须有 `snapshot`、`content_hash`、`rights_snapshot`；缺一不可进入 `READY_FOR_APPROVAL`。

导出包固定结构：

```text
manifest.json
briefs.jsonl
cases.jsonl
candidates.jsonl
preferences.jsonl
assets/
```

导出行为：

1. 创建任务时重新校验授权、法律冻结、评审状态、条目 hash；失败返回 `DATASET_BLOCKED`。
2. 生成 `manifest.json`，写入 `rights_snapshot`、`item_count`、`content_hash`、`created_by/at`、`legal_hold=false`。
3. 打包完成后计算压缩包 hash；下载链接 15 分钟有效，绑定会话，限次。
4. 下载写 `EXPORT_DOWNLOADED` 审计，记录导出人、时间、IP/UA、数据集版本。
5. 授权撤回/法律冻结：立即 `REVOKED`，撤链接，隔离条目；已导出文件记录影响范围并通知接收人。

## 9. 通知、飞书与文件

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/notifications` | `unreadOnly`、`cursor` | 通知列表 | 本人 |
| POST | `/notifications/:id/read` | — | 204 | 本人 |
| POST | `/notifications/read-all` | — | 更新数量 | 本人 |
| GET | `/workspaces/:wid/integrations/feishu/status` | — | 已配置/scope 状态/最近错误 | OWNER/ADMIN |
| POST | `/workspaces/:wid/integrations/feishu/test` | `recipientUserId` | 发送结果 | OWNER/ADMIN |
| POST | `/files/presign` | `purpose`、`filename`、`mimeType`、`sizeBytes`、`sha256` | 上传 URL、`storedFileId` | 对应资源写权限 |
| POST | `/files/:id/complete` | `sha256` | `CLEAN/PENDING/INFECTED` | 上传者 |

飞书/邮件通知载荷只包含任务 ID 和平台深链；通知类型仅用于适配器选择模板，不携带业务内容。不包含 Brief 正文、截图、HTML、评分或模型信息。飞书发送失败自动降级站内通知，不阻塞业务事务。通知类型：`TASK_ASSIGNED`、`TASK_DUE`、`ARBITRATION_PENDING`、`EXPORT_COMPLETED`。

## 10. 审计、法律冻结与恢复

| 方法 | 路径 | 输入 | 输出 | 权限 |
| --- | --- | --- | --- | --- |
| GET | `/workspaces/:wid/audit-logs` | `actorId`、`action`、`resourceType`、`from`、`to`、`cursor` | 审计列表（脱敏） | OWNER/ADMIN 全量；其他按矩阵 |
| GET | `/audit-logs/:id` | — | 单条审计与前后快照 | 同上 |
| GET | `/workspaces/:wid/audit-logs/export` | `from`、`to` | 审计导出任务 | OWNER/ADMIN；写审计 |
| GET | `/workspaces/:wid/legal-holds` | `status` | 冻结列表 | OWNER/ADMIN/DESIGN_LEAD |
| POST | `/workspaces/:wid/legal-holds` | `scopeType`、`scopeId`、`reason`、`legalReference?` | `ACTIVE` 冻结 | ADMIN/DESIGN_LEAD 申请；OWNER 批准 |
| POST | `/legal-holds/:id/release` | `reason` | `RELEASED` | OWNER |
| DELETE | `/:resourceType/:id` | `reason` | 软删除 | OWNER/ADMIN；法律冻结时 `423` |
| POST | `/:resourceType/:id/undelete` | `reason` | 恢复 | OWNER/ADMIN |
| POST | `/workspaces/:wid/backups` | `scope`、`note` | 备份任务 | OWNER/ADMIN |
| GET | `/backups/:id` | — | 备份状态、校验和 | OWNER/ADMIN |
| POST | `/restore-jobs` | `backupId`、`target`、`confirmToken` | 恢复任务 | OWNER/ADMIN；双人确认 |
| GET | `/restore-jobs/:id` | — | 恢复状态、校验结果、耗时 | OWNER/ADMIN |

软删除 30 天后物理清理；法律冻结、审计、授权事件、已提交评审、已批准数据集快照不参与普通清理。恢复不自动恢复导出权限，需重新校验。

## 11. 核心调用序列

### 11.1 案例入库

1. `POST /cases` 创建草稿；`POST /cases/:id/assets` 上传 375 截图/HTML。
2. `PUT /cases/:id/authorization` 六项默认 false；证据核验后逐项置 true。
3. `POST /cases/:id/submit`；`POST /cases/:id/review-cycles` 分配两名评审。
4. 评审 `POST /review-tasks/:id/submissions`；系统比对分歧。
5. 无分歧且通过：`POST /cases/:id/approve`；有分歧：创建裁决任务，`POST /review-tasks/:id/arbitration`。
6. 批准后 `GET /workspaces/:wid/coverage` 更新覆盖；进入数据集候选。

### 11.2 盲测

1. AI 工程 `POST /experiments/:id/candidates`，`POST /candidates/:id/submit`，`POST /candidates/:id/hard-checks`。
2. `POST /experiments/:id/pairs`，`POST /experiments/:id/freeze`，`POST /experiments/:id/start`。
3. 评审 `GET /blind/sessions/next` 获取白名单 DTO，提交 `POST /blind/sessions/:sessionId/comparisons`。
4. 双评锁定后，裁决人可 `POST /blind/pairs/:pairId/reveal`。
5. `POST /experiments/:id/close` 后 `GET /experiments/:id/results`；TIE 只进统计。

### 11.3 数据集导出

1. `POST /datasets` 选择 `TRAIN/EVAL`，`POST /datasets/:id/items` 添加条目。
2. `POST /datasets/:id/validate`；失败读 `/blockers` 修复。
3. `POST /datasets/:id/approve` 冻结；`POST /datasets/:id/exports`。
4. `GET /dataset-exports/:id` 轮询；成功后 `GET /dataset-exports/:id/download`。
5. 授权撤回：系统自动 `REVOKED`；下载链接失效，审计记录影响范围。
