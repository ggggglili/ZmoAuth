# Next.js + React + shadcn 授权系统实施文档

## 1. 目标与边界
- 当前只支持 `PHP` 项目授权。
- 后续可扩展 `Java`、`Python` 等语言，架构按多语言抽象设计。
- 系统包含：用户系统、角色权限、积分余额系统、应用管理、授权绑定、订单与流水、后台管理。

## 2. 角色模型（RBAC）

### 2.1 平台角色
系统平台角色固定 2 类：
- `SUPER_ADMIN`：平台最高权限，管理用户、应用、授权、积分、系统配置。
- `USER`：默认注册角色。

说明：
- 注册用户默认都是 `USER`。
- 超级管理员账号不走注册，来源于 `.env`：
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD_HASH`

### 2.2 应用级授权商（不是全局角色）
授权商资格是“应用内身份”，不是全局角色：
- 用户 A 可以在应用 A 是授权商。
- 同一个用户 A 在应用 B 可以不是授权商。

实现方式：
- 新增“应用成员关系”概念，按 `app_id + user_id` 维护身份。
- 成员身份建议枚举：`OWNER | RESELLER | MEMBER`。
  - `OWNER`：默认为超级管理员（或平台指定负责人）。
  - `RESELLER`：该应用授权商（享受该应用折扣、可给自己名下用户充值）。
  - `MEMBER`：普通应用用户。

### 2.3 权限边界
- `SUPER_ADMIN`：
  - 管理所有用户与应用。
  - 将用户在某个应用下升级/降级为授权商（`MEMBER <-> RESELLER`）。
  - 配置每个应用的授权商折扣。
  - 删除、编辑应用及版本。
- 应用 `RESELLER`：
  - 仅在所属应用内拥有折扣购买和充值权限。
  - 只能给“自己名下用户”充值积分（扣减自己的积分余额）。
  - 不能改平台配置、不能管理其他应用。
- `USER/MEMBER`：
  - 登录后购买授权、绑定授权、查看自己的授权与积分。

## 3. 多语言授权抽象（先支持 PHP）

### 3.1 应用上传与版本管理
应用由超级管理员创建，创建时必须填写：
- 应用名称
- 应用简介
- 下载链接（支持多版本）
- 周卡/月卡/年卡/永久卡积分价格

版本规则：
- 同一应用支持多版本共存（例如 `v1.0.0`、`v1.1.0`、`v2.0.0`）。
- 编辑应用页面提供“新增版本”按钮。
- 应用可编辑、可删除；编辑时除历史订单关联字段外，其余业务字段可修改。

隔离规则：
- 每个应用数据独立存储、独立查询，不互相污染。
- 新增应用不会影响已有应用的版本、授权、SDK、折扣和成员关系。

### 3.2 单应用独立授权 SDK
- 每个应用生成并维护自己的授权 SDK 文件（例如 PHP SDK）。
- 不同应用的 SDK 相互独立，不共享密钥与签名配置。
- SDK 绑定到应用级密钥配置（如 `app_key/app_secret`），避免跨应用串用。

### 3.3 授权绑定规则
- 绑定授权必须先登录。
- 绑定目标支持：
  - 域名（`example.com`）
  - IP（支持端口，如 `192.168.1.2:8080`）
- 服务端需校验绑定格式并做唯一性约束（同一授权在同一时刻只允许一个有效绑定目标，按业务策略可换绑）。

### 3.4 远程更新（每应用独立，可集成到 SDK）
可以集成在授权 SDK 中，并且按应用独立：
- 每个应用有自己的更新配置与更新签名密钥。
- SDK 提供更新检查接口（例如 `checkForUpdate()`），返回当前应用可用版本。
- SDK 提供更新包下载地址获取接口，返回对应版本的下载链接和签名信息。
- 更新校验必须包含：应用 ID、当前版本、目标版本、签名校验。
- 更新策略可配置：强制更新 / 可选更新 / 灰度发布。
- SDK 内置离线容错：当授权/更新接口短时不可用时，可使用本地缓存的短期授权结果（带过期时间和签名）继续运行，超时后必须恢复在线校验。

建议接口（应用级）：
- `POST /api/v1/apps/:appId/update/check`
- `GET /api/v1/apps/:appId/update/package/:version`

## 4. 积分系统设计（仅积分，无现金）

### 4.1 钱包字段
- `point_balance`：用户积分余额。

说明：
- 不存在 `cash_balance`。
- 所有价格、扣费、退款都使用积分。

### 4.2 积分流水机制
使用积分流水，禁止直接改余额：
- `point_transactions`
  - `type`: `recharge | purchase | refund | adjust | transfer_out | transfer_in`
  - `amount`: 正负值
  - `reference_type`: `order | license | manual | invite`
  - `reference_id`
  - `operator_id`

规则：
- 每次积分变动必须写流水。
- 管理员手工调整必须有备注和操作人。

### 4.3 充值规则
- 允许充值的角色：
  - `SUPER_ADMIN`：可给任意用户充值（平台增发）。
  - 应用 `RESELLER`：仅可给自己名下用户充值，且必须扣减自己的积分余额。
- 普通用户不能给他人充值。

授权商充值记账规则：
- 授权商扣减：`transfer_out`（负数）
- 被充值用户增加：`transfer_in`（正数）
- 两笔流水必须同事务提交，保证账务一致。

### 4.4 折扣结算规则（按应用）
- 折扣维度：`app_id + reseller_user_id`。
- 每个应用折扣可不同。
- 卡类原价由应用定义（周/月/年/永久，单位积分）。
- 结算公式：
  - 普通用户：`final_points = base_points`
  - 应用授权商：`final_points = round(base_points * discount_rate)`
- 折扣范围：`(0, 1]`，如 `0.5` 表示 5 折，`1` 表示不打折。
- 最终价格必须服务端计算，前端仅展示。

## 5. 数据库与存储（Neon）
- 数据库使用 `Neon PostgreSQL`。
- 本文档不放完整 Prisma 模型（避免篇幅过大），仅定义必备实体：
  - `users`
  - `invites`（邀请码、邀请链接、邀请人、过期时间、使用次数上限、已使用次数、使用状态）
  - `apps`
  - `app_versions`（一应用多版本下载链接）
  - `app_members`（应用级身份：`OWNER | RESELLER | MEMBER`）
  - `app_reseller_discounts`（应用级授权商折扣）
  - `app_update_policies`（远程更新策略）
  - `orders`
  - `licenses`
  - `license_bindings`（域名或 IP:Port）
  - `wallets`（仅 `point_balance`）
  - `point_transactions`
  - `audit_logs`

## 6. API 设计（App Router）

### 6.1 认证与邀请注册
- `POST /api/auth/register`
  - 必须携带 `inviteCode`。
  - 无邀请码或邀请码无效/过期/已达使用上限时拒绝注册。
  - 默认创建 `USER`。
  - 无论邀请人是管理员还是授权商，注册结果都为普通用户（`USER`）。
  - 请求体不允许 `role`。
- `POST /api/auth/login`
  - 若邮箱命中 `ADMIN_EMAIL`，走超级管理员认证分支。
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 6.2 邀请接口
- 仅 `SUPER_ADMIN` 和应用 `RESELLER` 可以生成邀请链接。
- `POST /api/admin/invites`
  - 超级管理员生成邀请链接。
- `POST /api/reseller/apps/:appId/invites`
  - 应用授权商生成“自己名下用户”的邀请链接。
- 邀请码使用次数限制：
  - 默认每个邀请码最多可使用 `10` 次（可在后台调整）。
- `GET /api/invites/:code/validate`
  - 校验邀请码状态（是否有效、是否过期、是否达到上限、剩余次数）。
  - 返回结果不展示所属应用信息。

### 6.3 应用管理（管理员）
- `POST /api/admin/apps`
  - 创建应用（名称、简介、四卡积分价格）。
- `PATCH /api/admin/apps/:appId`
  - 编辑应用信息和价格。
- `DELETE /api/admin/apps/:appId`
  - 删除应用。
- `POST /api/admin/apps/:appId/versions`
  - 新增版本（版本号 + 下载链接）。
- `PATCH /api/admin/apps/:appId/versions/:versionId`
  - 编辑版本下载链接。
- `DELETE /api/admin/apps/:appId/versions/:versionId`
  - 删除版本。

### 6.4 应用级授权商管理（管理员）
- `PUT /api/admin/apps/:appId/members/:userId/role`
  - body: `{ "role": "RESELLER" | "MEMBER" }`
  - 仅应用内升降级，不影响其他应用。
- `PUT /api/admin/apps/:appId/reseller-discounts/:userId`
  - body: `{ "discountRate": 0.5 }`

### 6.5 订单与授权
- `POST /api/orders`
  - body 必含：`appId`, `planType` (`WEEK | MONTH | YEAR | LIFETIME`)
  - 服务端按应用身份与折扣计算积分价格。
- `POST /api/orders/:orderId/pay`
  - 扣积分并写流水（事务）。
- `GET /api/licenses`
  - 查询当前用户授权。
- `POST /api/licenses/:licenseId/bind`
  - 需登录，绑定域名或 `IP:Port`。
- `POST /api/v1/license/verify`
  - PHP 客户端校验接口。

### 6.6 远程更新接口（SDK 使用）
- `POST /api/v1/apps/:appId/update/check`
  - 入参：`currentVersion`、`licenseKey`（必填）。
  - 出参：是否有新版本、目标版本、更新策略、更新说明、离线容错 TTL。
- `GET /api/v1/apps/:appId/update/package/:version`
  - Query 必填：`licenseKey`。
  - 返回更新包下载信息与签名。

### 6.7 充值
- `POST /api/admin/wallet/recharge`
  - 超级管理员给任意用户充值。
- `POST /api/reseller/apps/:appId/wallet/recharge`
  - 应用授权商给自己名下用户充值（扣减授权商积分）。

## 7. PHP 授权校验协议（MVP）
请求参数：
- `license_key`
- `bind_target`（域名或 IP:Port）
- `timestamp`
- `nonce`
- `sign`

签名示例：
- `sign = HMAC_SHA256(license_key + bind_target + timestamp + nonce, app_secret)`

服务端返回：
- `valid`: `true/false`
- `status`: `ACTIVE/EXPIRED/REVOKED...`
- `expires_at`
- `server_time`
- `signature`（服务端签名，防篡改）

安全建议：
- 设置 `timestamp` 最大偏移（例如 5 分钟）。
- `nonce` 防重放。
- 记录 `verify` 审计日志。

## 8. 前端页面结构（Next.js + shadcn）
- `/login`
- `/register?invite=xxxx`（必须从邀请链接进入）
- `/dashboard`
- `/dashboard/licenses`
- `/dashboard/wallet`
- `/admin/apps`
- `/admin/apps/[appId]/edit`（含“新增版本”按钮）
- `/admin/apps/[appId]/members`
- `/admin/apps/[appId]/discounts`
- `/admin/invites`
- `/reseller/apps/[appId]/users/recharge`
- `/reseller/apps/[appId]/invites`

## 9. 项目分层建议
- `app/(auth)`：登录注册
- `app/(panel)`：后台面板
- `app/api`：Route Handlers
- `lib/auth`：认证、会话、权限守卫
- `lib/invite`：邀请码生成、校验、核销
- `lib/rbac`：平台角色 + 应用成员权限校验
- `lib/wallet`：积分余额与流水
- `lib/license`：授权生成、绑定、校验
- `lib/update`：远程更新策略与签名
- `lib/pricing`：积分价格读取、折扣计算
- `lib/apps`：应用与版本管理
- `prisma`：schema 与迁移（连接 Neon）

## 10. 开发步骤（可直接执行）
1. 接入 Neon PostgreSQL，完成 Prisma 连接与迁移基线。
2. 实现认证：普通注册 + `.env` 超级管理员登录分支。
3. 实现邀请码：管理员/授权商生成邀请链接，注册强依赖邀请码。
4. 实现应用管理：创建/编辑/删除应用与版本（多版本共存）。
5. 实现应用成员：按应用设置 `RESELLER/MEMBER`。
6. 实现积分钱包：仅积分余额、积分流水、充值接口（含授权商扣自己）。
7. 实现应用级折扣结算与下单支付。
8. 实现应用独立 SDK（授权 + 更新）与 PHP 校验接口。
9. 实现授权绑定（登录后绑定域名或 IP:Port）。
10. 完成后台页面与权限联调。

## 11. 关键实现细节（避免后期返工）
- 应用删除建议采用软删除，避免影响历史订单追溯。
- 每个应用的 SDK 密钥与更新签名密钥独立存储并支持轮换。
- 绑定目标需规范化处理（域名小写、IP:Port 格式校验）。
- 所有扣积分与写流水动作必须在同一事务内完成。
- 授权商充值必须校验“被充值用户是否属于该授权商名下”。
- 所有角色变更、折扣变更、充值动作、邀请码核销写入审计日志。

## 12. 推荐依赖
- 认证：`next-auth`（或 `jose` + 自建 JWT）
- 数据库：`prisma` + `@prisma/client`（Neon）
- 校验：`zod`
- 表单：`react-hook-form`
- UI：`shadcn/ui` + `lucide-react`
- 表格：`@tanstack/react-table`
- 密码：`bcryptjs`
- 防重放缓存：`upstash/redis`（可选）

## 13. 第一版 MVP 验收标准
- 新用户必须通过邀请码注册链接注册，无码不可注册。
- 管理员和应用授权商都可生成邀请链接。
- 每个邀请码默认最多使用 `10` 次，第 `11` 次注册必须失败。
- 邀请码状态校验接口不返回所属应用信息。
- 新用户注册默认 `USER`，不能自行提权。
- `.env` 超级管理员可登录管理后台。
- 超级管理员可创建应用并设置周/月/年/永久积分价格。
- 同一应用支持新增多个版本下载链接并共存。
- 应用 A 与应用 B 的数据、SDK、折扣、授权商关系互相隔离。
- 用户可在应用 A 被设为授权商，但在应用 B 仍是普通用户。
- 仅积分余额生效，不存在现金余额。
- 超级管理员可充值；应用授权商给下级用户充值时会扣减自己的积分余额。
- 普通用户按原价；应用授权商按该应用折扣价结算。
- 授权绑定必须登录，且支持域名或 `IP:Port`。
- 每个应用的 SDK 都可独立完成授权校验和远程更新检查。

## 14. 默认假设（已锁定）
- 管理员为单一 `.env` 内置账号。
- 卡类固定四种：周卡、月卡、年卡、永久卡。
- 折扣按“应用 + 授权商用户”维度设置。
- 授权商资格是应用内身份，不是全局角色。
- 注册必须依赖邀请码（邀请链接）。
- 邀请码默认最大使用次数为 `10`。
- 数据库为 Neon PostgreSQL。

## 15. 推荐功能
- 二步验证（2FA）：管理员和授权商登录启用 TOTP。
- 邀请码风控：限制邀请码有效期、使用次数、来源 IP。
- 应用更新灰度：按用户比例或白名单逐步放量更新。
- 设备指纹风控：同账号短时间高频换绑时触发二次验证。
- 自动续费提醒：授权到期前站内信/邮件通知。
- 对账报表：按应用输出积分收入、折扣让利、充值明细。
- 操作审计导出：支持按时间/操作者导出 CSV。
- 异常告警：授权校验失败率、更新失败率超阈值自动告警。
