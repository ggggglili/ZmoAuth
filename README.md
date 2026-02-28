# zmoauth

一个基于 Next.js 16、Prisma、NextAuth 和 PostgreSQL 的授权与分销管理平台。

## 项目亮点

- 在同一系统中管理应用、用户、许可证、订单与钱包
- 多角色权限模型（`SUPER_ADMIN`、`OWNER`、`RESELLER`、`MEMBER`、`USER`）
- 基于邀请码的注册流程与分销层级关系
- 积分钱包与充值流水能力
- 面向客户端集成的远程更新 API
- 关键操作审计日志支持

## 技术栈

- Next.js 16（App Router）
- React 19 + TypeScript
- NextAuth（Credentials + JWT Session）
- Prisma ORM + PostgreSQL（支持 Neon）
- Tailwind CSS 4 + shadcn 风格 UI 组件

## 项目结构

```text
.
|-- app/          # App Router 页面与 API 路由
|-- components/   # 可复用 UI 组件
|-- lib/          # 业务服务、认证、安全、数据库工具
|-- prisma/       # Prisma Schema 与迁移文件
|-- docs/         # 产品与 API 文档
`-- public/       # 静态资源
```

## 快速开始

### 1. 环境要求

- Node.js 20+
- pnpm 9+
- PostgreSQL 数据库（Neon 或自建）

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

在项目根目录创建 `.env` 文件。

必需：

- `DATABASE_URL`：PostgreSQL 连接串
- `NEXTAUTH_SECRET`：JWT/签名密钥
- `ADMIN_EMAIL`：初始化超级管理员邮箱
- `ADMIN_PASSWORD_HASH` 或 `ADMIN_PASSWORD`：初始化超级管理员凭据

建议：

- `NEXTAUTH_URL`：站点对外访问地址（生产环境建议配置）

可选（生产环境下若启用 Redis 防重放/邮箱验证码能力则必需）：

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### 4. 生成 Prisma Client

```bash
pnpm prisma:generate
```

### 5. 执行迁移（开发环境）

```bash
pnpm prisma:migrate
```

### 6. 启动开发服务

```bash
pnpm dev
```

打开 `http://localhost:3000`。

## 脚本命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务 |
| `pnpm lint` | 执行 ESLint 检查 |
| `pnpm prisma:generate` | 生成 Prisma Client |
| `pnpm prisma:migrate` | 执行开发迁移 |
| `pnpm prisma:studio` | 打开 Prisma Studio |

## 核心 API（MVP）

认证与注册：

- `POST /api/auth/register`
- `GET /api/auth/me`
- `GET /api/invites/:code/validate`

管理员：

- `POST /api/admin/invites`
- `GET /api/admin/invites`
- `POST /api/admin/apps/:appId/members`
- `GET /api/admin/apps/:appId/members`
- `POST /api/admin/wallet/recharge`

分销商：

- `POST /api/reseller/apps/:appId/invites`
- `GET /api/reseller/apps/:appId/invites`
- `POST /api/reseller/apps/:appId/wallet/recharge`
- `GET /api/reseller/apps/:appId/children`

远程更新：

- `POST /api/v1/apps/:appId/update/check`
- `GET /api/v1/apps/:appId/update/package/:version`

## 重要页面路由（MVP）

- `/login`
- `/register?invite=xxxx`
- `/dashboard`
- `/admin/invites`
- `/admin/wallet`
- `/admin/apps/[appId]/members`
- `/reseller/apps/[appId]/invites`
- `/reseller/apps/[appId]/users/recharge`

## 远程更新契约变更（2026-02-24）

- `POST /api/v1/apps/:appId/update/check` 现要求在 JSON Body 中传入 `licenseKey`。
- `GET /api/v1/apps/:appId/update/package/:version` 现要求在 Query 中传入 `licenseKey`。
- 客户端示例见 `docs/remote-update-api-contract.md`。

## 说明

- 注册流程基于邀请码。
- 邀请码默认最多可使用 `10` 次（未额外配置时）。
- 分销商给下级用户充值会扣减分销商自身钱包积分。
- 建议部署前先确保 `pnpm build` 成功通过。
