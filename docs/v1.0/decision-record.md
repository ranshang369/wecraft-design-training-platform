# WeCraft 设计训练协作平台 v1.0 决策记录

> 状态：冻结候选版，等待项目组确认后进入开发。本文是 v1.0 文档集的决策索引；若与其他文档冲突，以本文和 `risks-and-assumptions.md` 中的 TBD 处理规则为准。

## 1. 目标与边界理解（不超过 300 字）

我的理解：本平台是独立内部 Web 应用，服务 4–20 人的设计训练数据协作；飞书负责登录、文档和通知，平台负责 Brief、案例/反例、评审、盲测、实验和数据导出；平台不训练模型，不修改 WeCraft 生产代码。v1.0 以已给定决策为准，内部冲突只列不改；所有 P0 必须有可验收完成定义，TBD 明确 owner、影响和默认假设。

## 2. 已冻结决策

| ID | 决策 | 冻结内容 | 影响文档 |
| --- | --- | --- | --- |
| F-01 | 产品边界 | 独立内部 Web 应用；飞书负责登录、文档、通知；平台负责结构化数据、评审、导出；不运行模型训练 | PRD、acceptance |
| F-02 | 六维评分 | 固定为内容适配、视觉机制、字形层级、图像叙事、节奏变化、整体完成度 | PRD、data-model |
| F-03 | 评分值 | 1–5 整数，不允许小数；2/4 分为相邻分数插值 | data-model、api |
| F-04 | 汇总权重 | v1 等权 1/6，仅用于仪表盘汇总和诊断；准入看硬失败与单维最低分 | PRD、acceptance |
| F-05 | 图像叙事 | 无图片时记 N/A，不计入平均，剩余维度重新归一化 | data-model、acceptance |
| F-06 | 案例准入 | 内容适配 ≥4、视觉机制 ≥4、整体完成度 ≥4，其余 ≥3；两名评审通过；授权完整；375px 可渲染 | PRD、acceptance |
| F-07 | 分歧裁决 | 任一维度差 ≥2；可发布/不可发布相反；A/B 偏好相反；硬检查结论冲突；授权/复制/隐私/安全疑义，任一触发 | PRD、data-model |
| F-08 | 评审证据 | 每条评审必须附截图区域、HTML 片段或正文证据；禁止只给分数 | data-model、api、acceptance |
| F-09 | 授权模型 | 四项核心授权（`canDeriveMechanism`、`canUseForGeneration`、`canUseForDisplay`、`canUseForTraining`）+ 两项扩展授权（`canUseForEvaluation`、`canShowPublicly`）；六项均独立存储、默认 false，不能互相推导 | rbac、data-model、acceptance |
| F-10 | 授权独立性 | 六个 boolean 默认 false，互不推导；`canUseForTraining` 不覆盖 `canUseForEvaluation` | rbac、data-model |
| F-11 | 授权证据 | 内部原创、用户内容、第三方案例、公开领域分别按最小证据要求；授权有效期等于合同/文件期限 | data-model、acceptance |
| F-12 | 授权变更 | 只有 Owner 或 Design Lead 可修改训练/评测授权；变更记录操作人、理由、时间、影响范围；撤回立即隔离 | rbac、data-model、acceptance |
| F-13 | 硬检查 | 18 条规则，按正文、图片、375px、危险 HTML、资源、占位、对比度、字号、复制、结构、外链、标题、图片体积等执行；每条有严重级别和 owner | PRD、acceptance |
| F-14 | 硬检查版本 | 规则版本化；修复后只对新版本重跑；同一版本最多自动修复 2 轮；误报只能建立有期限例外并审计 | data-model、acceptance |
| F-15 | 盲测协议 | 每个 pair 默认 2 名评审 + 1 名裁决人；高价值 pair 3 名评审取多数；允许平票并写理由；A/B 每名评审随机 | PRD、acceptance |
| F-16 | 盲测隔离 | 提交前隐藏模型版本、来源、上一轮分数、其他评审分数；两名评审锁定后只向裁决人揭示；整批结束才向团队展示聚合和匿名来源 | rbac、api、acceptance |
| F-17 | 数据集格式 | `manifest.json`、`briefs.jsonl`、`cases.jsonl`、`candidates.jsonl`、`preferences.jsonl`、`assets/`；CSV 只作人工汇总 | data-model、api、acceptance |
| F-18 | Ground Truth | 黄金 brief 不是唯一正确 HTML；必须包含评估依据和 1–3 份人工参考结果 | PRD、data-model |
| F-19 | 飞书边界 | 优先飞书 OAuth；必须有邮箱邀请/管理员创建降级；最小 scope；通知只带任务 ID 和深链，不发正文/截图/HTML | PRD、api、rbac |
| F-20 | 分类与目标 | 9 个主型：self-referential、material、scene、genre、schema、interface、citation、psychological、process；案例目标 36（最少 30），反例目标 12（最少 10），黄金 brief 60（30% holdout） | PRD、data-model |
| F-21 | 裁决机制 | 设计问题 Design Lead；内容事实/可发布性 Content Lead；授权/隐私/法律 Owner + 法务；常规 1 个工作日，授权法律 3 个工作日；同一争议最多申诉一次 | PRD、rbac、acceptance |
| F-22 | 留存删除 | 授权证据到期后 3 年；案例/截图/HTML 最后使用后 2 年；候选/原始 HTML 180 天；评审 3 年；审计 3 年；数据集版本至少 3 年；软删除 30 天；撤回立即隔离 | PRD、acceptance、data-model |
| F-23 | 时间与门槛 | W1 黄金 brief、W3 案例/反例、W5 授权完整与存量导入、W7 试点、W12 数据集 Go/No-Go；绝对日期 TBD-DATE | PRD、acceptance、risks |
| F-24 | 导出权限 | 数据导出仅限 Owner、Admin、Design Lead；训练/评测授权修改仅限 Owner、Design Lead | rbac、api、acceptance |
| F-25 | P0 范围 | 登录/邀请/权限、Brief、案例库、标注评审、候选、硬检查/预览、盲测、仪表盘、数据集、通知、审计、软删除/恢复/法律冻结占位 | PRD、acceptance |

## 3. TBD 清单

| ID | 待确认项 | 确认人 | 影响 | 默认假设（不阻塞开发） |
| --- | --- | --- | --- | --- |
| TBD-OWNER | 案例、反例、黄金 brief 的具体姓名 owner | 项目负责人 + 设计负责人 | 签收、数据生产、责任边界 | 角色持有人代行；不写具体姓名 |
| TBD-FEISHU-OWNER | 飞书应用创建、scope 审批、发布负责人 | IT/项目负责人 | 登录、通知、上线时间 | 邮箱 + 站内通知；飞书适配器保留 |
| TBD-SCOPE-KEY | 飞书后台当前可用 scope key | TBD-FEISHU-OWNER | OAuth 权限、通讯录范围 | 只申请 open_id、姓名、头像，邮箱可选，机器人消息；不申请全量通讯录 |
| TBD-DATE | 项目启动日与 W1–W12 绝对日期 | 项目负责人 | 里程碑、验收、资源 | 全部使用相对周；不写绝对日期 |
| TBD-LEGAL | 留存、删除、证据期限的最终法务结论 | 法务 + 项目负责人 | 备份、删除、导出、合规 | 采用 F-22；法务未确认前不做不可逆物理删除 |
| TBD-HIGH-RISK | 哪些主型属于“高风险主型”（反例至少 3 个） | 设计负责人 | 反例配额、W3 验收 | 未分类前只强制每个主型至少 1 个反例，不强制 3 个 |
| TBD-AUTOFIX | “安全族”定义与自动回退目标 | Design Lead + AI 工程 | 候选失败恢复、硬检查重跑 | 不做自动回退；候选保持 `HARD_CHECK_FAILED`，由人修复或撤回 |
| TBD-DESIGNER-ROLE | 是否单设 Designer 角色 | 项目负责人 + 设计负责人 | RBAC、案例录入体验 | P0 由 Annotator 录入、Design Lead 审核；如单设，列 P1 不改变主数据模型 |
| TBD-CONSISTENCY | 评审一致性的最终统计口径 | 设计负责人 + QA | 仪表盘、验收 | 默认展示“可发布结论一致率 + 各维平均绝对差”；不把单一统计量当质量结论 |
| TBD-RPO-RTO | 备份 RPO/RTO 与恢复演练频率 | 运维/安全 + 项目负责人 | 备份方案、上线门槛 | 试点默认 RPO ≤ 15 分钟、RTO ≤ 4 小时、每周恢复演练 |

### 3.1 必须由项目组确认的 10 个问题

1. `TBD-OWNER`：案例、反例、黄金 brief 的具体姓名 owner 是谁？
2. `TBD-FEISHU-OWNER`：飞书应用创建、scope 审批、发布由谁负责？
3. `TBD-SCOPE-KEY`：飞书后台当前可用 scope key 有哪些？是否只限项目组/指定部门？
4. `TBD-DATE`：项目启动日与 W1–W12 的绝对日期是什么？
5. `TBD-LEGAL`：留存、删除、证据期限与已训练模型影响的最终法务口径是什么？
6. `TBD-HIGH-RISK`：哪些主型属于高风险主型，需要至少 3 个反例？
7. `TBD-AUTOFIX`：“安全族”如何定义，自动回退目标是什么？
8. `TBD-DESIGNER-ROLE`：是否单设 Designer 角色，还是 P0 由 Annotator 录入、Design Lead 审核？
9. `TBD-CONSISTENCY`：评审一致性采用哪个最终统计口径？
10. `TBD-RPO-RTO`：备份 RPO/RTO 与恢复演练频率是多少？

## 4. 冲突、建议与影响

| 冲突 | 说明 | 建议 | 影响 |
| --- | --- | --- | --- |
| 4–6 周实施 vs W7 试点 / W12 Go-No-Go | 工程可在 6 周内完成，但 W7 试点和 W12 数据 Go/No-Go 是项目计划，不是同一维度 | 解释为 W1 启动内容与工程，W1–W6 构建，W7 试点，W12 数据集决策；不把 W12 当作软件上线日 | 若 60 个 brief 未在 W1 完成，W7 试点数据门槛会滑；软件可上线但不能满足“30 案例/10 反例”门禁 |
| W1 60 个黄金 brief vs W1 同周启动 | 内容生产、审批和 holdout 切分需要前置时间 | W1 作为内容冲刺周；若项目启动日才组建内容团队，需将数据门槛顺延并标记 TBD-DATE | 直接影响 W7 上线门槛；不影响工程 P0 开发 |
| Feishu 通知适配为 P0 vs 飞书审批 3–10 个工作日 | 适配器可实现，但真实应用和 scope 不可控 | P0 做站内通知 + Feishu adapter；真实发送以配置开启为条件 | 飞书未批不阻塞试点；不得把“已适配”当成“已上线” |
| Admin 可导出 vs 只有 Owner/Design Lead 可修改训练/评测授权 | 两种权限分离，不是冲突 | 保留：Admin 可导出已批准数据，但不能改变训练/评测授权 | 需要 UI 明确禁用 Admin 的授权编辑；审计区分 |
| 4–6 周工程 vs P0 12 项 + 60 brief/30 案例导入 | P0 范围接近完整产品闭环，4 周非常紧 | 6 周基线；4 周仅在数据预置、P1 全砍、规则冻结时启用 | 4 周路径风险高；不得削减授权、盲测隔离、审计、沙箱 |
| 角色清单未单列 Designer vs 设计案例需要非技术录入 | 新口径列了 Design Lead、Annotator，未列 Designer | P0 用 Annotator 录入、Design Lead 审核；是否单设 Designer 记 TBD-DESIGNER-ROLE | 若设计团队要求独立角色，P1 增加角色映射，不改变数据模型 |
| 仅测试 Viewer/Annotator/Design Lead/Owner vs 还有 Admin/Content Lead/Editor/AI Engineer | 四种角色是上线必测最小集，不是全部系统角色 | P0 必测四种；其余角色做集成权限测试 | 不减少权限矩阵，只明确验收优先级 |

## 5. 文档集

| 文档 | 内容 |
| --- | --- |
| `PRD-v1.0.md` | 目标、非目标、旅程、页面、范围、P0 DoD、里程碑 |
| `data-model.md` | ERD、数据字典、状态机、数据集 schema、约束 |
| `rbac.md` | 角色、权限矩阵、字段级授权、导出与职责分离 |
| `api-draft.md` | API 路径、方法、输入、输出、权限 |
| `acceptance.md` | E2E、测试用例、上线门槛、非功能验收 |
| `risks-and-assumptions.md` | 风险、假设、TBD、依赖、冲突处理 |
| `architecture-and-operations.md` | 技术选型、部署拓扑、沙箱、安全、审计、备份、4–6 周计划 |

