# Auth API v0.1

> 一句话结论：先注册或登录取得 Bearer token，后续画像与 Coach API 才会接受请求，并从 token 得到可信 `user_id`。

## 1. 获取 6 位验证码

```http
POST /api/v1/auth/codes
Content-Type: application/json
```

```json
{
  "purpose": "register",
  "contact_type": "email",
  "contact": "demo@example.com"
}
```

- `purpose`：`register` 或 `login`；
- `contact_type`：`email` 或 `phone`；
- 验证码 10 分钟有效，最多错误 5 次，默认 60 秒内不能重发；
- 本地 `AUTH_DEV_SHOW_CODE=1` 时响应额外包含 `dev_code`，生产环境必须关闭。

## 2. 注册

```http
POST /api/v1/auth/register
Content-Type: application/json
```

```json
{
  "challenge_id": "challenge-uuid",
  "code": "123456",
  "username": "demo_user",
  "password": "career123"
}
```

用户名为 3—24 位中文、字母、数字、下划线或连字符；密码为 8—128 位且至少包含一个字母和一个数字。成功后直接返回登录令牌：

```json
{
  "access_token": "random-token",
  "token_type": "Bearer",
  "expires_at": "2026-09-27T10:00:00+08:00",
  "user": {
    "user_id": "user-uuid",
    "username": "demo_user",
    "contact_type": "email",
    "masked_contact": "de***@example.com"
  }
}
```

## 3. 两种登录

用户名 + 密码：

```http
POST /api/v1/auth/login/password
```

```json
{ "username": "demo_user", "password": "career123" }
```

手机号或邮箱 + 验证码：先以 `purpose=login` 调用 `/auth/codes`，再提交：

```http
POST /api/v1/auth/login/code
```

```json
{ "challenge_id": "challenge-uuid", "code": "123456" }
```

## 4. 使用和退出

所有 Career 和 Coach 接口都携带：

```http
Authorization: Bearer random-token
```

查看当前账号与已保存画像：

```http
GET /api/v1/auth/me
GET /api/v1/users/me/profile
```

退出：

```http
POST /api/v1/auth/logout
Authorization: Bearer random-token
Content-Type: application/json

{}
```

服务端忽略请求体中的伪造 `client_user_id`；访问其他账号的 Coach `session_id` 统一返回 `SESSION_NOT_FOUND`。
