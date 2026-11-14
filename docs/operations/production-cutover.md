# 正式投用切换清单

> 更新日期：2026-11-14
> 当前判断：**受控试点环境已就绪，正式生产仍为 NO-GO。**
> 本清单只记录可复核的证据，不以“容器健康”替代“训练有效”，也不以“演示数据”替代真实业务数据。

## 1. 当前运行边界

| 项目 | 当前状态 |
| --- | --- |
| 公网入口 | <https://wecraft-training.zer-go.cn> |
| 正式试点 Workspace | `wecraft-pilot`（`WeCraft 设计训练正式试点`） |
| 演示 Workspace | `wecraft-design` 保留但不用于正式试点 |
| 演示账号 | 8 个 `@example.test` 账号已停用 |
| 当前正式账号 | 1 个 OWNER；独立评审、设计负责人和 AI 工程账号尚未建立 |
| 演示种子 | `DEMO_SEED_IF_EMPTY=0`，空库不会自动恢复演示数据 |
| 数据存储 | PostgreSQL 16，文件使用 `STORAGE_DRIVER=database` |
| 发布方式 | 固定 revision 镜像、共享发布锁、发布前备份、发布后 preflight |
| 当前发布 | `20261114T1620-6922dd1`，应用与数据库健康，运行时 preflight 为 0 阻断 |

正式试点不得继续使用演示账号。Owner 当前临时持有多个角色，只用于初始化；开始真实双评前必须创建独立账号并完成职责分离。

## 2. 已完成的技术证据

- 公网健康接口返回 `ok: true`、`database: "ok"`，revision 与 `/var/lib/wecraft-training/last-release` 一致。
- 应用与 PostgreSQL 容器为 `healthy`，Caddy 训练路由存在，磁盘低于阻断阈值。
- `wecraft-training-backup.timer` 与 `wecraft-training-monitor.timer` 已启用。
- 发布脚本会拒绝 `DEMO_SEED_IF_EMPTY != 0`，并在发布后运行 runtime preflight。
- 备份包含 SHA-256、`pg_restore` 可读性校验和 30 天保留策略。
- 2026-11-14 已在隔离数据库完成恢复演练（2 个 Workspace、5 个案例、53 条审计），并写入 `last-restore-drill`。
- 单元测试、类型检查和生产构建通过；核心 E2E 曾通过 13/13，覆盖双评、Holdout、硬检查、导出、权限与审计。
- 正式试点 Workspace 已创建，演示账号已停用，审计中有初始化记录。
- `preflight.sh --pilot` 当前为 11 个阻断：告警、异地备份、案例、反例、黄金 Brief、主型、授权、双评和 Holdout；运行时检查为 0 阻断。

## 3. 正式投用前仍为阻断项

| 阻断项 | 负责人 | 关闭证据 | 当前状态 |
| --- | --- | --- | --- |
| 飞书告警送达 | 平台运维 | 自定义机器人 webhook 写入 `600` 权限文件，`test-alert.sh` 返回 `ALERT_TEST_OK` | 未配置 |
| 异地备份 | 平台运维 + 数据负责人 | 独立 OSS/S3/R2 bucket 与专用 rclone remote，`backup-postgres.sh` 输出 `offsite_copy=ok` | 未配置 |
| 恢复演练证据 | 平台运维 | 执行 `restore-drill.sh`，生成 7 天内有效的 `last-restore-drill` | 已完成（2026-11-14 16:19） |
| 独立团队账号 | OWNER | 至少建立独立的 DESIGN_LEAD、ANNOTATOR（2 人以上）和 AI_ENGINEER 账号 | 未完成 |
| 真实优质案例 | DESIGN_LEAD | 30 个 `ELIGIBLE` 案例，9 个主型各至少 3 个 | 0 / 30 |
| 已批准反例 | DESIGN_LEAD | 10 个 `APPROVED` 反例 | 0 / 10 |
| 黄金 Brief | CONTENT_LEAD | 60 个非 `CASE_SOURCE` Brief | 0 / 60 |
| 授权台账 | OWNER / 法务 | 每个入库案例授权为 `VERIFIED` 且覆盖训练用途 | 0 / 0 |
| 案例双评 | DESIGN_LEAD | 所有案例的当前版本均有至少 2 名独立评审 | 0 / 0 |
| Holdout 实验 | AI_ENGINEER | 30 个已完成、已裁决的 Holdout pair，3 名独立评审 | 0 / 30 |
| 业务签收 | 业务负责人 | 范围、SLA、退出条件、保留期和风险接受书面签收 | 未签收 |
| 独立运行边界 | 平台负责人 | 迁移到独立 ECS/Docker daemon，或有书面值守和隔离方案 | 仍共用主机 |

## 4. 关门前必须执行的检查

在训练平台服务器执行：

```bash
cd /opt/wecraft-training
bash scripts/ops/preflight.sh --pilot
curl -fsS https://wecraft-training.zer-go.cn/api/v1/health
systemctl list-timers 'wecraft-training-*' --all --no-pager
```

`preflight.sh --pilot` 必须输出 `SUMMARY mode=pilot blockers=0`。只要仍有 `BLOCK`，就只能在隔离空间做受控试点，不能对外宣布正式生产。

### 4.1 告警测试

由飞书群管理员创建“自定义机器人”，把 webhook 写入服务器 `/etc/wecraft-training/monitor.env`，保持文件权限 `600`，然后执行：

```bash
bash /opt/wecraft-training/scripts/ops/test-alert.sh
cat /var/lib/wecraft-training/last-alert-test
```

成功标准：测试群收到消息，命令输出 `ALERT_TEST_OK`，状态文件包含 `result=ok`。webhook 不得写入 Git、聊天记录或公开文档。

### 4.2 异地备份

使用独立于生产 WeCraft 的对象存储 bucket 和最小权限凭据，不在训练主机上复用生产密钥：

```bash
cat >/etc/wecraft-training/backup.env <<'EOF'
RCLONE_REMOTE=wecraft-training-backup:wecraft-training
RETENTION_DAYS=30
EOF
chmod 600 /etc/wecraft-training/backup.env
command -v rclone
bash /opt/wecraft-training/scripts/ops/backup-postgres.sh
cat /var/lib/wecraft-training/last-offsite-copy
```

成功标准：脚本输出 `offsite_copy=ok`，状态文件包含 `result=ok`，并从另一台机器或对象存储控制台验证备份文件可读取。

### 4.3 恢复演练

```bash
bash /opt/wecraft-training/scripts/ops/restore-drill.sh
cat /var/lib/wecraft-training/last-restore-drill
```

脚本只创建临时恢复数据库，验证至少一个 Workspace 后删除，不触碰生产库。

### 4.4 正式数据与实验

1. OWNER 邀请真实成员，分别授予 DESIGN_LEAD、ANNOTATOR、AI_ENGINEER，不使用共享账号。
2. 先录入 60 个黄金 Brief，再按 9 个主型补齐 30 个优质案例与 10 个反例。
3. 每个案例核验授权证据，完成独立双评；分歧由未参与该案例评审的人裁决。
4. 固定 Holdout brief、B0/B1 模型版本、提示词、参数、seed 和排除规则。
5. 完成至少 30 个 Holdout pair，由 3 名独立评审盲评，裁决人不得兼任同组评审。
6. 在实验详情页查看胜率、95% bootstrap 置信区间、TIE 率、样本量和硬检查失败率。

## 5. 效果验收口径

| 结论 | 条件 |
| --- | --- |
| 不能证明有效 | 少于 30 个有效 pair，或置信区间跨过 50% |
| 观察到收益 | 至少 30 个有效 pair，胜率 95% CI 下界高于 50%，且硬检查失败率未恶化 |
| 观察到劣势 | 胜率 95% CI 上界低于 50% |
| 不予放行 | 即使胜率显著，出现授权风险、成本不可接受或硬检查回退 |

离线盲测只证明评审偏好，不证明 WeCraft 生产端提升。生产端收益必须在 WeCraft 做受控灰度或 A/B，并单独记录点击、阅读、转化或留存等业务指标。

## 6. 投用决策

只有以下五类签收同时满足，才可把状态改为“正式投入试点”：

- [ ] 技术发布、告警与恢复演练：平台运维。
- [ ] 授权、保留期和删除流程：OWNER/法务。
- [ ] 数据量与双评质量：DESIGN_LEAD。
- [ ] Holdout 实验与统计结论：AI_ENGINEER。
- [ ] 业务范围、SLA、退出条件：业务负责人。

正式生产还需要独立运行边界或书面风险接受。当前共用 ECS/Docker daemon 已在 2026-11-14 发生训练容器被并发构建清理的事故，不能把“当前健康”视为已完成隔离。
