# Isyou Complete

这是 Isyou 的独立可运行版本，放在原仓库的 `isyou-complete/` 中，不覆盖原有的 `frontend/` 或 `job-matcher/`。

## 这个副本包含什么

- 完整保留仓库 `frontend/index.html` 的原始 UI、交互、`support.js`、`image-slot.js` 和图片素材
- 保留原有能力探索、能力图谱、演示岗位、岗位详情和培训流程
- 在原“岗位匹配”界面内接入真实岗位候选搜索、来源页核验和 `jd_selected.md` 下载
- 前端静态文件和三个 API 由同一个 Node.js 服务提供
- 包含健康检查、请求大小限制、API 速率限制、环境文件保护和基础安全响应头

原 UI 中显示的 5 个岗位仍是 Hackathon 演示数据，并已在页面明确标注。真实岗位搜索只有在服务器配置搜索服务后才会启用，不会把演示内容冒充为实时招聘。

## 本地运行

要求 Node.js 20 或更新版本：

```powershell
cd isyou-complete
npm ci
Copy-Item .env.example .env.local
npm start
```

浏览器打开 `http://127.0.0.1:3000`，健康检查地址为 `http://127.0.0.1:3000/health`。

未配置搜索密钥时，原始 UI 和全部演示流程仍能运行；联网岗位搜索会返回明确的“未配置搜索服务”提示。

## 配置真实岗位搜索

密钥只写入服务器上的 `.env.local`，不要写进 HTML、JavaScript 或 Git：

```dotenv
OPENAI_API_KEY=
OPENAI_SEARCH_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

也可以使用 Google Custom Search：

```dotenv
GOOGLE_CSE_API_KEY=
GOOGLE_CSE_ID=
JOB_SEARCH_PROVIDER=google
```

大陆服务器可能无法直接访问 OpenAI。项目支持 `JOB_SEARCH_PROXY_URL`，但代理需要由部署者合法、可信地提供。`OPENAI_BASE_URL` 指向的服务必须兼容 Responses API 及 `web_search` 工具。

## 页面流程

1. 点击封面上的“点开这本本子，开始”。
2. 回答三道演示问题，查看能力图谱。
3. 进入“岗位匹配”；原来的 5 张演示卡保持不变。
4. 展开“搜索真实岗位”，填写可选城市并明确同意联网检索。
5. 搜索候选岗位，打开公开来源核对信息。
6. 选择候选后由服务端核验页面，并下载 `jd_selected.md`。

页面只把当前三道题的非敏感偏好和可选城市发给同源后端；OpenAI/Google API Key 永远不下发到浏览器。

## 验证

```powershell
npm run verify
```

测试覆盖画像隐私裁剪、授权检查、职业扩展、公开页面字段提取、硬约束、候选选择、统一静态服务、健康检查、环境文件保护、无效 JSON 和速率限制。

## Windows 腾讯云运行

在服务器中安装 Node.js 20 和 Git，克隆仓库并进入本目录：

```powershell
npm ci --omit=dev
Copy-Item .env.example .env.local
notepad .env.local
npm start
```

公网临时直连时，在 `.env.local` 中设置：

```dotenv
HOST=0.0.0.0
PORT=3000
```

并只在腾讯云防火墙中开放实际使用的端口。需要开机启动时，以管理员 PowerShell 运行：

```powershell
.\deploy\windows\install-startup.ps1
```

正式公网访问更建议用 IIS、Nginx 或面板反向代理 80/443 到 `127.0.0.1:3000`，并为域名启用 HTTPS。

## 仍需要部署者提供的外部条件

- OpenAI 或 Google 的有效密钥及配额
- 腾讯云实例到搜索服务的网络连通性
- 第三方招聘页面允许访问且岗位仍有效
- 域名、HTTPS 和平台级日志/监控

代码遇到这些外部条件缺失时会返回明确错误，不会伪造真实岗位或把未知条件标成符合。
