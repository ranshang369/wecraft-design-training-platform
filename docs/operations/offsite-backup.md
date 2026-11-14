# 异地备份与恢复演练

> 更新日期：2026-11-14
> 目标：数据库备份离开训练主机；发生主机故障或误删时，可以从对象存储重新下载并恢复。

## 1. 当前架构

| 项目 | 配置 |
| --- | --- |
| 源数据 | 训练主机上的 PostgreSQL 16 命名卷 `training_db` |
| 本机备份 | `/var/backups/wecraft-training`，保留 30 天 |
| 异地对象存储 | 阿里云 OSS `wecraft-training-backup-20261114`，华南 1（深圳） |
| 异地前缀 | `wecraft-training/` |
| 访问方式 | 专用 RAM 用户 `wecraft-training-backup` + rclone remote `wecraft-training-backup` |
| 对象存储安全 | 私有、阻止公共访问、OSS 完全托管 AES256 服务端加密 |
| 生命周期 | `wecraft-training/` 下对象最后修改 30 天后删除；碎片 30 天后删除 |
| 备份节奏 | 每日 02:30 定时执行；发布前也会执行一次 |
| 当前 RPO | 最长 24 小时（以最近一次成功备份为准） |

训练平台和 WeCraft 生产对象存储必须保持分离。RAM 用户只具备训练备份前缀所需的
`PutObject/GetObject/ListObjects/ListParts/AbortMultipartUpload` 等对象级权限，
不授予账户级权限、`ListBuckets`、`DeleteObject` 或整桶删除权限。

## 2. 凭据边界

- rclone 配置：`/root/.config/rclone/rclone.conf`，权限 `600`。
- 备份环境变量：`/etc/wecraft-training/backup.env`，权限 `600`。
- AccessKey 只保存在服务器受控文件中，不写入 Git、飞书文档、聊天记录或截图。
- rclone remote 配置了 `no_check_bucket = true`，因为最小权限策略刻意不包含 `ListBuckets`。

## 3. 每次备份

```bash
bash /opt/wecraft-training/scripts/ops/backup-postgres.sh
cat /var/lib/wecraft-training/last-offsite-copy
```

成功标准：

- 输出包含 `backup_ok` 和 `offsite_copy=ok`。
- `last-offsite-copy` 包含 `result=ok`，时间在最近 26 小时内。
- `rclone check` 对本次 dump 和 `.sha256` 显示 `0 differences found`。

备份文件使用 `--immutable` 上传，目标已存在时不会被静默覆盖。

## 4. 异地恢复演练

```bash
bash /opt/wecraft-training/scripts/ops/restore-drill-offsite.sh
cat /var/lib/wecraft-training/last-restore-drill
```

脚本会：

1. 列出远端完整的 `.dump` + `.sha256` 对，选择最新一对。
2. 下载到权限 `700` 的临时目录。
3. 对下载后的 dump 计算 SHA-256，并与远端清单首字段比较，避免误校验本机旧文件。
4. 在训练数据库容器内创建临时库，执行 `pg_restore`。
5. 验证至少一个 Workspace，打印 Workspace、案例、候选和审计数量。
6. 删除临时数据库和临时下载文件。
7. 写入 `last-restore-drill`，`source` 以 `offsite:` 开头。

2026-11-14 17:41 的演练结果：远端最新备份下载校验通过，恢复出 2 个 Workspace、5 个案例、2 个候选和 53 条审计；临时库已删除。

## 5. 密钥轮换与撤销

建议每 90 天或人员/权限变更时轮换：

1. 为专用 RAM 用户创建第二把 AccessKey。
2. 在服务器更新 rclone 配置，保持配置文件权限 `600`；不得把密钥写入命令行历史或文档。
3. 执行一次备份和一次异地恢复演练，确认新密钥可用。
4. 禁用并删除旧 AccessKey。
5. 记录轮换日期、执行人和演练结果；不要记录密钥本身。

## 6. 已知边界

- 备份与 Bucket 位于同一阿里云账号，仍受账号级故障、欠费和管理员误删影响；它不是跨云灾备。
- Bucket 未开启版本控制；生命周期删除不可恢复。当前依赖 30 天保留和最小权限降低误删风险。
- 备份只覆盖 PostgreSQL；数据库内文件（截图、HTML、导出包）随数据库一起备份，主机上的非数据库临时文件不在范围内。
- 当前 RPO 为 24 小时。若业务要求更短 RPO，需要改为更频繁的增量/WAL 归档，并单独验证恢复目标。
- 共用主机上的训练容器仍可能被其他发布或运维操作停止；异地备份解决数据恢复，不解决运行隔离。
