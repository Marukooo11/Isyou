# Isyou

一句话结论：仓库根目录就是唯一可运行的完整 Demo；克隆后执行 `npm ci && npm start`，不要再从旧子目录启动。

Isyou 是一个帮助用户理解自身能力、探索职业可能，并把方向转化为真实岗位与个性化成长行动的 Web Demo。

## 本地运行

要求 Node.js 20 或更新版本：

```bash
npm ci
cp .env.example .env.local
npm start
```

Windows PowerShell：

```powershell
npm ci
Copy-Item .env.example .env.local
npm start
```

打开 `http://127.0.0.1:3000`；健康检查为 `http://127.0.0.1:3000/health`。

## 配置 DeepSeek 联网岗位搜索

只把密钥写入本地 `.env.local`，不要提交到 Git：

```dotenv
OPENAI_API_KEY=你的DeepSeek密钥
OPENAI_SEARCH_MODEL=deepseek-v4-flash
OPENAI_BASE_URL=https://api.deepseek.com
```

这里沿用 `OPENAI_*` 变量名是因为 DeepSeek 提供 OpenAI Responses API 兼容接口。密钥只在服务端使用，不会下发到浏览器。未配置密钥时，能力探索、图谱、演示岗位、岗位详情和培训流程仍可运行；只有联网岗位搜索不可用。

如需改用 OpenAI：

```dotenv
OPENAI_API_KEY=你的OpenAI密钥
OPENAI_SEARCH_MODEL=gpt-5-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

也可配置 Google Custom Search 作为搜索提供商：

```dotenv
GOOGLE_CSE_API_KEY=
GOOGLE_CSE_ID=
JOB_SEARCH_PROVIDER=google
```

不同服务商的密钥不能混用。

## Demo 链路

1. 完成能力探索问卷，答案和进度保存在当前浏览器。
2. 查看可追溯的能力图谱。
3. 查看 5 个稳定的演示岗位匹配结果。
4. 明确授权后联网搜索 5 个真实岗位候选。
5. 选择候选，服务端核验公开招聘页并下载 `jd_selected.md`。
6. 从岗位卡片或详情进入通用成长 Coach，确认 Gap Map、阶段计划与第一项行动。
7. 提交行动结果，Coach 保存为待复核证据，并在下一学习日先 Review 再调整任务。


## 成长 Coach

Coach 与主站共用 `npm start` 和同源 `/api/v1/coach/*` 接口，不需要再单独启动 8001 端口。进入时会自动带入当前岗位、能力轴事实、约束和岗位差距；它不会把未知能力写成缺陷，而是先通过已有材料定位起点，再生成可调整的阶段计划和每日任务。

当前 Demo 的 Coach 会话保存在 Node 进程内存中，刷新页面可以恢复，重启服务后会新建会话。生产环境应把会话与证据日志迁移到持久化数据库。

## 验证

```bash
npm run verify
```

测试覆盖画像隐私裁剪、联网授权、职业扩展、岗位页面核验、硬约束、候选选择、Coach 状态机与接口、静态服务、健康检查、环境文件保护、无效 JSON 和速率限制。

## 部署

仓库根目录包含 `Dockerfile` 和 `vercel.json`。公网运行时把密钥配置在部署平台的服务器环境变量中，不要写入源码。Windows 开机启动脚本位于 `deploy/windows/`。

外部联网链路仍依赖服务商密钥与配额、服务器网络连通性，以及第三方招聘页面可访问且岗位仍有效。代码会明确返回外部错误，不会伪造搜索结果。
