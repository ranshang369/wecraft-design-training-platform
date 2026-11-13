# 稳定公网部署

## 当前地址

- 训练平台：<https://wecraft-training.zer-go.cn>
- 健康检查：<https://wecraft-training.zer-go.cn/api/v1/health>
- 主机：`39.105.45.154`，Ubuntu 22.04，Docker Compose。
- 目录：`/opt/wecraft-training`。
- Compose 项目：`wecraft-design-training`。

该地址使用 `zer-go.cn` 的自有子域，A 记录指向固定公网 IP `39.105.45.154`，由 Caddy 自动申请 Let's Encrypt 证书。它不依赖 Render Free 的休眠实例、30 天数据库或临时隧道。

登录方式：打开登录页后，直接使用分配的邮箱账号和密码登录；不再要求站点级 Basic Auth 口令。演示密码不写入 Git、公开飞书文档或聊天记录。

## 2026-11-13 验收记录

- HTTPS 健康检查返回 `200`，响应包含 `ok: true`；根路径直接返回 `200` 登录页，不再弹出 Basic Auth 口令框。
- Owner 与 Annotator 登录返回 `200`，Worker、PostgreSQL、Caddy 反向代理均正常。
- 案例截图与 HTML 文件返回 `200`；HTML 响应带 `default-src 'none'`、`script-src 'none'` 等 CSP，预览在沙箱中运行。
- 候选 `CD-0001`、`CD-0002` 的 `HC-01` 至 `HC-05` 均为 `PASS`，证明容器内 Chromium 可执行硬检查。
- 盲测 pair 返回匿名 A/B、Brief 和文件 ID，不包含模型名、模型版本、来源或上一轮分数。
- `DS-0001` 返回 `422 DATASET_BLOCKED`，阻断项为 `RIGHTS_MISSING`（`CA-0005` 缺少训练授权），导出门禁按设计生效。
- 应用容器重启后，健康检查、账号登录和数据库内文件仍可用，验证 PostgreSQL 与 `STORAGE_DRIVER=database` 的持久化。

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

首次空库会依次执行迁移和演示种子；已有 Workspace 时种子自动跳过，不会清空业务数据。

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
```

期望健康检查为 `200` 且返回 `ok: true`；根路径为 `200` 并直接显示登录页。随后用浏览器完成：

1. 使用 Owner 邮箱和密码登录。
2. 打开案例详情，确认 375px 截图与沙箱 HTML 可见。
3. 对候选触发硬检查，确认 Chromium 能执行 HC-04/HC-05。
4. 打开盲测 pair，确认评审页隐藏模型和来源。
5. 校验并导出数据集，确认授权缺失时被阻断。

## 更新与回滚

更新应用：

```bash
cd /opt/wecraft-training
docker compose --env-file deploy/training/.env -f deploy/training/docker-compose.yml build app
docker compose --env-file deploy/training/.env -f deploy/training/docker-compose.yml up -d app
```

回滚代码时使用上一个已验证的源码版本重新执行同一构建命令。数据库迁移只能使用已提交的向后兼容迁移，不执行 `prisma migrate reset`，不对生产数据运行 `db seed` 重置。

## 备份

当前已使用命名卷持久化 PostgreSQL，但尚未配置自动异地备份。上线协作训练前，至少每日执行一次逻辑备份，并将备份移出本机：

```bash
docker exec wecraft-design-training-db-1 \
  pg_dump -U wecraft_training -d wecraft_dt -Fc \
  > /opt/wecraft-training/backup-$(date +%F).dump
```

恢复演练必须在隔离目录进行。数据库密码、会话密钥和账号密码只存放在服务器 `/opt/wecraft-training/deploy/training/.env` 与受控密钥库，不写入 Git 或公开飞书文档。

## 已知边界

- 主入口依赖 `zer-go.cn` 的 `wecraft-training` A 记录；修改 DNS 时必须保持指向 `39.105.45.154`，并同步更新 `APP_URL` 与 Caddy Host。旧 `sslip.io` 地址仍作为兼容别名保留。
- 为简化登录，当前未启用站点门禁和 MFA，也没有登录速率限制；只应通过受控渠道分发地址，并在真实数据试点前补 SSO、速率限制和监控。
- 当前数据是虚构演示数据，不包含真实案例、授权证据或生产内容。
- 部署健康与功能冒烟通过，不等于模型训练已经产生可验证的设计提升。训练效果必须用 HOLD OUT 实验、盲评一致性和可复现证据单独验收。
