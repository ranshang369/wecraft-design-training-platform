# 稳定公网部署

## 当前地址

- 训练平台：<https://wecraft-training.zer-go.cn>
- 健康检查：<https://wecraft-training.zer-go.cn/api/v1/health>
- 主机：`39.105.45.154`，Ubuntu 22.04，Docker Compose。
- 目录：`/opt/wecraft-training`。
- Compose 项目：`wecraft-design-training`。

该地址使用 `zer-go.cn` 的自有子域，A 记录指向固定公网 IP `39.105.45.154`，由 Caddy 自动申请 Let's Encrypt 证书。它不依赖 Render Free 的休眠实例、30 天数据库或临时隧道。

登录方式：打开登录页后，直接使用分配的邮箱账号和密码登录；不再要求站点级 Basic Auth 口令。演示密码不写入 Git、公开飞书文档或聊天记录。

公网已经切换到正式试点 Workspace `wecraft-pilot`。原演示 Workspace `wecraft-design` 保留但隔离，8 个 `@example.test` 演示账号已停用；正式成员必须使用 OWNER/ADMIN 发放的邀请链接和独立账号。

正式投用的剩余门禁和签收证据见[正式投用切换清单](production-cutover.md)。

## 2026-11-13 验收记录

- HTTPS 健康检查返回 `200`，响应包含 `ok: true`；根路径 `307` 跳转到 `/login`，登录页返回 `200`，不再弹出 Basic Auth 口令框。
- Owner 与 Annotator 登录返回 `200`，Worker、PostgreSQL、Caddy 反向代理均正常。
- 案例截图与 HTML 文件返回 `200`；HTML 响应带 `default-src 'none'`、`script-src 'none'` 等 CSP，预览在沙箱中运行。
- 候选 `CD-0001`、`CD-0002` 的 `HC-01` 至 `HC-05` 均为 `PASS`，证明容器内 Chromium 可执行硬检查。
- 盲测 pair 返回匿名 A/B、Brief 和文件 ID，不包含模型名、模型版本、来源或上一轮分数。
- `DS-0001` 返回 `422 DATASET_BLOCKED`，阻断项为 `RIGHTS_MISSING`（`CA-0005` 缺少训练授权），导出门禁按设计生效。
- 应用容器重启后，健康检查、账号登录和数据库内文件仍可用，验证 PostgreSQL 与 `STORAGE_DRIVER=database` 的持久化。

## 2026-11-14 生产化验收记录

- 健康检查返回 `200`、`ok: true`、`database: "ok"` 和部署版本号；数据库故障会返回 `503`。
- 训练应用与数据库容器均健康，登录后仪表盘、实验、数据集、成员和审计页面返回 `200`；当前 revision 以 `/api/v1/health` 和 `/var/lib/wecraft-training/last-release` 为准。
- 正式试点空间 `wecraft-pilot` 已创建，Owner 已迁入；演示账号已停用，`DEMO_SEED_IF_EMPTY=0`。仪表盘“正式试点数据门禁”当前仍为 0 个业务案例、0 个反例和 0 个黄金 Brief。
- 登录失败按账号 8 次、IP 30 次阻断 15 分钟，返回 `429`；限流键只保存 SHA-256，不落明文邮箱或 IP。
- 并发创建数据集的编号冲突已修复；编号由 PostgreSQL 原子序列分配，并有 8 路并发 E2E 回归。
- Holdout 支持 2–3 名独立评审，裁决人不得兼任评审，候选制作人不得参与同组评审或裁决；结果按固定候选 A/B 归一化。
- 每日 `02:30` 自动备份 PostgreSQL，30 天保留，备份带 SHA-256 和 `pg_restore` 可读性校验；已在隔离数据库完成一次恢复演练。
- 每 5 分钟检查健康、数据库、容器、磁盘、发布 revision、Caddy 路由和备份新鲜度；飞书 webhook 尚未配置，告警仍只写本机日志。
- 所有 JSON API 统一限制 16MB 请求体，超限返回 `413 PAYLOAD_TOO_LARGE`；截图原文件仍限制 8MB。
- 发布已改用固定 revision 镜像、共享生产发布锁、发布前备份和发布后公网校验；当前镜像另保存为带 SHA-256 的 zstd 归档，可在本地镜像被清理后恢复。
- 共用主机的并发构建曾在 15:03、15:22、15:30、15:33 多次触发内存保护，并在 15:29 清理训练容器与镜像，造成训练站点 502。当前已恢复；正式生产必须迁移独立主机/Docker daemon，或在发布窗口内由双方显式串行并值守。

## 隔离边界

训练平台是独立 Stack：

- 自己的 PostgreSQL 16 容器和 `training_db` 卷。
- 自己的应用镜像、容器、`.env` 和日志。
- 文件使用 `STORAGE_DRIVER=database`，截图、HTML 和导出包与业务数据一起持久化。
- 不连接 `wecraft-production` 或 `wecraft-preview` 数据库，不读取 WeCraft 生产源码和对象存储。
- 仅通过外部网络 `wecraft-production_edge` 接受现有 Caddy 的反向代理，不加入生产数据库网络。

稳定公网当前未启用站点级 Basic Auth，直接由平台自身的邮箱密码、Session 和 RBAC 控制权限。`SITE_ACCESS_PASSWORD` 的可选能力仍保留，供需要额外内网门禁的部署使用。

注意：该 Stack 与 WeCraft 生产环境共用主机和 Caddy 入口。训练平台故障通常不影响生产站点，但生产发布可能覆盖 `/opt/wecraft/deploy/Caddyfile` 并移除训练路由，因此每次生产发布后都要执行下文的 Caddy 路由检查。

## 首次部署 / 重新部署

在仓库根目录生成源码包并上传：

```bash
git archive --format=tar.gz --output=wecraft-training-src.tar.gz HEAD
scp wecraft-training-src.tar.gz root@39.105.45.154:/tmp/
scp -r deploy/training root@39.105.45.154:/tmp/wecraft-training-deploy/
```

在服务器执行：

```bash
mkdir -p /opt/wecraft-training
tar -xzf /tmp/wecraft-training-src.tar.gz -C /opt/wecraft-training
mkdir -p /opt/wecraft-training/deploy/training
cp /tmp/wecraft-training-deploy/training/* /opt/wecraft-training/deploy/training/
cd /opt/wecraft-training
cp deploy/training/.env.example deploy/training/.env
chmod 600 deploy/training/.env
```

填入部署时生成的真实值后，构建并启动：

```bash
cd /opt/wecraft-training
docker compose --env-file deploy/training/.env -f deploy/training/docker-compose.yml up -d --build
docker compose --env-file deploy/training/.env -f deploy/training/docker-compose.yml ps
docker compose --env-file deploy/training/.env -f deploy/training/docker-compose.yml logs --tail 100 app
```

首次启动只执行 `prisma migrate deploy`。`deploy/training/.env.example` 默认 `DEMO_SEED_IF_EMPTY=0`，不会自动写入演示数据；正式环境禁止把该值改为 `1`。

## Caddy 路由

在 `/opt/wecraft/deploy/Caddyfile` 追加 `deploy/training/Caddyfile.snippet` 的内容。该路由与生产站点、预览站点按 Host 隔离。

先在容器内校验配置：

```bash
docker exec wecraft-production-caddy-1 \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

生产 Caddy 的全局配置为 `admin off`，因此 2.10 版本不能走 Admin API 热加载。校验成功后重启 Caddy 容器：

```bash
docker restart wecraft-production-caddy-1
```

WeCraft 生产发布可能覆盖 `/opt/wecraft/deploy/Caddyfile`。每次生产发布后检查：

```bash
grep -q 'wecraft-training.zer-go.cn' /opt/wecraft/deploy/Caddyfile \
  || echo 'training route missing'
```

缺失时重新追加 snippet、校验并重启 Caddy。训练平台自身的容器和数据库不受影响。

## 健康与验收

```bash
curl -fsS https://wecraft-training.zer-go.cn/api/v1/health
curl -sS -o /dev/null -w '%{http_code}\n' https://wecraft-training.zer-go.cn/
cd /opt/wecraft-training
bash scripts/ops/preflight.sh
```

期望健康检查为 `200` 且返回 `ok: true`；根路径返回 `307` 并跳转到 `/login`，登录页返回 `200`。随后用浏览器完成：

1. 使用 Owner 邮箱和密码登录。
2. 打开案例详情，确认自动适配截图、原始截图入口与沙箱 HTML 可见。
3. 对候选触发硬检查，确认 Chromium 能执行 HC-04/HC-05。
4. 打开盲测 pair，确认评审页隐藏模型和来源。
5. 校验并导出数据集，确认授权缺失时被阻断。

## 更新与回滚

更新应用时使用固定 revision，禁止直接覆盖 `latest`。脚本会获取与 WeCraft 生产发布共用的 `/run/wecraft-release.lock`，在构建前备份数据库，并在切换后校验公网健康、revision、登录页和 Caddy 路由：

```bash
cd /opt/wecraft-training
bash scripts/ops/release.sh <immutable-revision-tag>
```

成功输出必须包含 `RELEASE_OK`。若生产发布正在构建，脚本会以退出码 75 拒绝并发执行。回滚应用时使用 `/var/lib/wecraft-training/last-release` 之前的固定镜像标签；数据库迁移只能使用已提交的向后兼容迁移，不执行 `prisma migrate reset`，不对生产数据运行 `db seed` 重置。

## 备份

当前使用命名卷持久化 PostgreSQL，并已安装每日自动备份：

```bash
systemctl list-timers 'wecraft-training-*' --all
bash /opt/wecraft-training/scripts/ops/backup-postgres.sh
bash /opt/wecraft-training/scripts/ops/restore-drill.sh /var/backups/wecraft-training/latest.dump
```

备份写入 `/var/backups/wecraft-training`，默认保留 30 天；恢复演练会创建临时数据库、校验至少一个 Workspace 后立即删除，不触碰生产库。

仍需配置 `RCLONE_REMOTE` 完成异地副本。当前 `backup.env` 留空时脚本会明确输出 `offsite_copy=skipped`，不能把本机备份视为灾备完成。配置后必须验证 `last-offsite-copy` 为 26 小时内且 `result=ok`。

数据库密码、会话密钥和账号密码只存放在服务器 `/opt/wecraft-training/deploy/training/.env` 与受控密钥库，不写入 Git 或公开飞书文档。

## 监控与告警

```bash
systemctl status wecraft-training-monitor.timer --no-pager
bash /opt/wecraft-training/scripts/ops/monitor.sh
```

监控每 5 分钟检查 HTTPS 健康、数据库、应用/数据库容器状态、磁盘 85% 阈值、备份 26 小时新鲜度、发布 revision 和训练平台 Caddy 路由。将飞书自定义机器人 webhook 写入 `/etc/wecraft-training/monitor.env` 的 `ALERT_WEBHOOK_URL` 后，告警才会实际送达；webhook 文件必须保持 `600`，不得提交到 Git。配置后执行：

```bash
bash scripts/ops/test-alert.sh
cat /var/lib/wecraft-training/last-alert-test
```

成功必须同时看到 `ALERT_TEST_OK` 和飞书群中的测试消息。

## 已知边界

- 主入口依赖 `zer-go.cn` 的 `wecraft-training` A 记录；修改 DNS 时必须保持指向 `39.105.45.154`，并同步更新 `APP_URL` 与 Caddy Host。旧 `sslip.io` 地址仍作为兼容别名保留。
- 当前未启用 MFA、企业 SSO、WAF 或 IP 允许列表；邮箱登录已启用失败节流和健康监控，但仍应通过受控渠道分发地址。
- 自动备份目前只在本机；异地备份和飞书告警送达仍需配置外部凭据。
- 公网试点空间当前没有真实业务数据；原虚构演示数据只保留在隔离 Workspace，不用于正式验收。
- 部署健康与功能冒烟通过，不等于模型训练已经产生可验证的设计提升。训练效果必须用 HOLD OUT 实验、盲评一致性和可复现证据单独验收。
