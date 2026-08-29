# Auth

结论：本模块把前端自报的 `client_user_id` 替换为服务端签发的稳定 `user_id`，并让画像与 Coach 会话按账号隔离存储。

## 支持的链路

- 手机号或邮箱二选一获取 6 位随机验证码；
- 验证码 + 用户名 + 密码注册；
- 用户名 + 密码登录；
- 已注册手机号或邮箱 + 验证码登录；
- Bearer token 鉴权、退出和 30 天过期；
- 画像快照和 Coach 会话绑定 token 对应的 `user_id`。

密码使用 PBKDF2-SHA256 和独立随机 salt，只存哈希；验证码有效期 10 分钟，最多错误 5 次，默认 60 秒后可重发；访问令牌使用 256 位随机值，数据库只存 SHA-256 哈希。

## 本地验证码与生产边界

本地默认 `AUTH_DEV_SHOW_CODE=1`，验证码会在 `/auth/codes` 响应中以 `dev_code` 返回，联调页自动回填。该模式只能绑定回环地址。

真实部署前必须：

- 设置 `AUTH_DEV_SHOW_CODE=0`；
- 将 `DevelopmentCodeDelivery` 替换为短信和邮件 delivery provider；
- 在网关增加 HTTPS、IP/设备级限流、验证码发送审计和异常登录监控；
- 配置数据保留、账号注销、密码重置和联系方式换绑流程。
