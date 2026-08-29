# 真实岗位候选与单份 JD 交付模块

## 模块边界

输入：A 模块输出并经用户授权的 `output1.json`。

交互输出：5 个来自实时搜索的岗位候选名称、公司和来源链接。候选仅表示“搜索发现”，用户选择前不宣称已完成页面核验。

最终输出：用户选定岗位经原始页面核验后，同时生成结构化 `selected_job`（`output2.jd.v1.0`）和 `jd_selected.md`。Markdown 不包含用户画像、能力差距、训练目标或 Coach 计划；Python `JobCoachAdapter` 使用结构化对象接入 Coach，避免反向解析 Markdown。

## 两阶段接口

### 1. 搜索5个候选

`POST /api/job-search/candidates`

```json
{
  "profile": {},
  "market": "CN",
  "language": "zh-CN"
}
```

返回 `candidates`，每项包含 `candidate_id`、`title`、`company`、`location`、`source_url`、`direction_id` 和 `discovery_status`。

### 2. 选择并生成 Markdown

`POST /api/job-search/select`

```json
{
  "profile": {},
  "candidate": {}
}
```

服务端只核验所选岗位，执行硬约束检查，成功后返回 `selected_job`、`file.filename=jd_selected.md` 和 Markdown 内容。

浏览器不应直接调用本模块。正式联调入口是 Python API 的 `/api/v1/job-search/*`，由它完成 Bearer 鉴权、账号隔离、候选持久化和 Coach handoff。

## 运行

1. 复制 `.env.example` 为 `.env.local`，填写服务端密钥、精确模型 ID 和可选代理。
2. 执行 `npm install`。
3. 执行 `npm test`。
4. 执行 `npm run dev`。

密钥只能放在部署平台环境变量或本地 `.env.local`，禁止加入交付压缩包。

## 性能说明

候选阶段已从十几次模型搜索缩减为一次合并搜索。OpenAI Next `gpt-5.6-terra` 的真实测试耗时约45秒，因此不能保证首次数秒返回。若产品要求稳定数秒，应将 `SearchProvider` 替换为 Brave/Tavily 等传统搜索 API；接口和后续核验模块无需改变。相同查询可以通过短期缓存加速，但缓存不得超过24小时而不重新确认机会状态。

## 文件职责

- `api/job-search/candidates.mjs`：候选搜索 HTTP 入口。
- `api/job-search/select.mjs`：单岗位核验与 Markdown HTTP 入口。
- `lib/job-search/selection-pipeline.mjs`：两阶段业务编排。
- `privacy.mjs`：联网前授权检查和最小字段裁剪。
- `compiler.mjs`：用户语言转换为动作、对象、交付物、工具和条件。
- `taxonomy.mjs`：职业名称来源与市场同义词扩展。
- `providers.mjs`：OpenAI/Google 搜索适配、代理、缓存和错误处理。
- `verifier.mjs`：访问原始页面、SSRF 防护、JD 字段提取和证据状态。
- `ranking.mjs`：硬约束判断与内部排序。
- `markdown.mjs`：生成 B 可消费的固定 Markdown 结构。
- `errors.mjs`、`utils.mjs`：公共错误和安全工具。
- `tests/`：隐私、真实性、硬约束、两阶段和输出格式回归测试。
