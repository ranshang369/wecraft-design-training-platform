# 部署入口

本目录只包含演示与单机部署所需的 Docker Compose 配置。生产环境应使用独立数据库、私有对象存储、密钥管理和组织内网入口。

## 演示部署

先准备环境变量：

```bash
export SESSION_SECRET="$(openssl rand -base64 32)"
export APP_URL="http://localhost:3000"
export COOKIE_SECURE="false"
docker compose -f deploy/docker-compose.yml up --build -d
docker compose -f deploy/docker-compose.yml run --rm -e NODE_ENV=development app npx prisma db seed
```

访问 `http://localhost:3000`。演示账号与数据见仓库根目录 `README.md`。

## 生产注意

- 把 `APP_URL` 改为 HTTPS 地址并设置 `COOKIE_SECURE=true`。
- 数据库和存储卷必须持久化，并完成备份恢复演练。
- 不要对生产数据库运行 `db seed`；该命令会清空全部业务表。
- 当前 Compose 使用本地文件存储；迁移到 S3/OSS 前需替换存储适配器并补集成测试。
- 完整说明见 `docs/operations/deployment.md` 与 `docs/operations/security-backup.md`。
