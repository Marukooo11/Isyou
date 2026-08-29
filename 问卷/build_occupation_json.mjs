// build_occupation_json.mjs
// 解析《全维度职业标签总库.md》，生成结构化 occupation.json 与解析报告。
// 规范标签层：中文标签 → canonical_id（坑2：旧字母码全部废弃，不入库）。
// 用法: node build_occupation_json.mjs [源md路径] [输出目录]
//   默认源：脚本所在目录的 全维度职业标签总库.md，不存在时回退 E:/ASD/新职业库/；
//   默认输出：与源文件同目录（occupation.json ＋ occupation_解析报告.md）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [argSrc, argOutDir] = process.argv.slice(2);
const FALLBACK_DIR = "E:/ASD/新职业库";
const SRC = argSrc
  ?? [path.join(HERE, "全维度职业标签总库.md"), path.join(FALLBACK_DIR, "全维度职业标签总库.md")]
       .find(p => fs.existsSync(p));
if (!SRC) throw new Error("未找到 全维度职业标签总库.md，请显式传入源路径");
const DIR = argOutDir ?? path.dirname(SRC);
const OUT_JSON = path.join(DIR, "occupation.json");
const OUT_REPORT = path.join(DIR, "occupation_解析报告.md");

const BIG5_MAP = {
  高外向性: "E_HIGH", 低外向性: "E_LOW",
  高神经质: "N_HIGH", 低神经质: "N_LOW",
  高尽责性: "C_HIGH", 低尽责性: "C_LOW",
  高宜人性: "A_HIGH", 低宜人性: "A_LOW",
  高开放性: "O_HIGH", 低开放性: "O_LOW",
};
const INT_MAP = {
  语言智能: "linguistic", 数学逻辑智能: "logical_mathematical", 空间智能: "spatial",
  身体运动智能: "bodily_kinesthetic", 音乐智能: "musical", 人际智能: "interpersonal",
  自我认知智能: "intrapersonal", 自然认知智能: "naturalistic",
};
const DIMS = ["E", "N", "C", "A", "O"];

const raw = fs.readFileSync(SRC, "utf8").replace(/^\uFEFF/, "");
const lines = raw.split(/\r?\n/);

// 定位两个"第二部分"总表（第一处=五维，第二处=智能）
const secIdx = lines.map((l, i) => (l.startsWith("## 第二部分") ? i : -1)).filter(i => i >= 0);
if (secIdx.length < 2) throw new Error("未找到两个第二部分总表，段落数=" + secIdx.length);

function parseTable(start) {
  const rows = [];
  const errors = [];
  const map = new Map(); // name -> {name, tags:Set, source, dup:0}
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("## ")) break; // 到下一章节为止
    if (!l.startsWith("|")) continue;
    const cells = l.split("|").map(c => c.trim());
    // cells: ['', 职业, 标签, (来源), '']
    const name = (cells[1] || "").replace(/\s+/g, "");
    if (!name || name === "职业") continue;
    if (/^-+$/.test(name)) continue; // Markdown 表格分隔行 |---|---|
    const tagStr = cells[2] || "";
    const source = cells[3] || null;
    if (!tagStr) { errors.push({ name, line: i + 1, problem: "标签列为空" }); continue; }
    if (map.has(name)) {
      const prev = map.get(name);
      prev.dup++;
      // 同名行：标签取并集，保留首个来源；并记错误
      tagStr.split("、").map(t => t.trim()).filter(Boolean).forEach(t => prev.tags.add(t));
      errors.push({ name, line: i + 1, problem: "同名重复行，标签已并集" });
      continue;
    }
    map.set(name, { name, tags: new Set(tagStr.split("、").map(t => t.trim()).filter(Boolean)), source });
  }
  return { map, errors };
}

const big5Res = parseTable(secIdx[0]);
const intRes = parseTable(secIdx[1]);

// 中文标签 → canonical；未映射的记入错误清单
function mapTags(name, cnTags, dict, errors) {
  const out = []; const unmapped = [];
  for (const t of cnTags) {
    if (dict[t]) out.push(dict[t]); else unmapped.push(t);
  }
  if (unmapped.length) errors.push({ name, line: null, problem: "未映射标签：" + unmapped.join("、") });
  return out;
}
const big5Errors = [];
const intErrors = [];

// 维度状态归并：high/low/both/none（坑3：both 不裁决，原样保留）
function big5State(canonicalTags) {
  const st = {};
  for (const d of DIMS) {
    const hasHigh = canonicalTags.includes(d + "_HIGH");
    const hasLow = canonicalTags.includes(d + "_LOW");
    st[d] = hasHigh && hasLow ? "both" : hasHigh ? "high" : hasLow ? "low" : "none";
  }
  return st;
}

// 两表按职业名连接
const allNames = new Set([...big5Res.map.keys(), ...intRes.map.keys()]);
const onlyInBig5 = [...big5Res.map.keys()].filter(n => !intRes.map.has(n));
const onlyInInt = [...intRes.map.keys()].filter(n => !big5Res.map.has(n));

const occupations = [...allNames]
  .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))
  .map((name, idx) => {
    const b = big5Res.map.get(name);
    const i = intRes.map.get(name);
    const canonicalBig5 = b ? mapTags(name, [...b.tags], BIG5_MAP, big5Errors) : [];
    const canonicalInt = i ? mapTags(name, [...i.tags], INT_MAP, intErrors) : [];
    const state = big5State(canonicalBig5);
    return {
      occupation_id: "OCC-" + String(idx + 1).padStart(4, "0"),
      name,
      source: b ? b.source : null,
      big5_raw_tags: b ? [...b.tags] : [],
      big5_canonical_tags: canonicalBig5.sort(),
      big5_state: state,
      contradiction_dims: DIMS.filter(d => state[d] === "both"),
      intelligence_tags: canonicalInt, // 保持库内 top3 排名顺序
      environment_tags: null,          // 二期待补标（对应 Q14 A–G）
    };
  });

// 统计
const stat = { total: occupations.length };
for (const d of DIMS) {
  stat[d] = {
    high: occupations.filter(o => o.big5_state[d] === "high").length,
    low: occupations.filter(o => o.big5_state[d] === "low").length,
    both: occupations.filter(o => o.big5_state[d] === "both").length,
    none: occupations.filter(o => o.big5_state[d] === "none").length,
  };
}
const bothCount = occupations.filter(o => o.contradiction_dims.length > 0).length;
const bothTop = [...occupations].filter(o => o.contradiction_dims.length >= 3)
  .sort((a, b) => b.contradiction_dims.length - a.contradiction_dims.length).slice(0, 10);
const intDist = {};
for (const o of occupations) for (const t of o.intelligence_tags) intDist[t] = (intDist[t] || 0) + 1;
const noInt = occupations.filter(o => o.intelligence_tags.length === 0).length;
const srcDist = {};
for (const o of occupations) { const s = o.source || "(仅在智能库)"; srcDist[s] = (srcDist[s] || 0) + 1; }

const dbOut = {
  schema_version: "1.1",
  generated_at: new Date().toISOString().slice(0, 10),
  source_file: "全维度职业标签总库.md",
  tag_system: {
    big5: "canonical_id 见《智能-数据字段说明.md》附录A标签注册表；旧单字母码（S/R/C/L/O/U/A/E/I/N）已废弃",
    intelligence: ["linguistic", "logical_mathematical", "spatial", "bodily_kinesthetic", "musical", "interpersonal", "intrapersonal", "naturalistic"],
    big5_state_enum: ["high", "low", "both(矛盾标签，匹配时该维退出分母)", "none(无标签)"],
  },
  occupations,
};

// 若存在 AI 初标数据文件，自动合并三组标签（环境/职级/资格），重跑不丢补标
let rptExtra = "";
let tagStats = null;
const tagsHelperPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "tag_occupations.mjs");
if (fs.existsSync(tagsHelperPath)) {
  const { applyTags, tagStatsSection } = await import(pathToFileURL(tagsHelperPath).href);
  tagStats = applyTags(dbOut);
  rptExtra = tagStatsSection(tagStats);
}
fs.writeFileSync(OUT_JSON, JSON.stringify(dbOut, null, 2), "utf8");

// 解析报告
const rpt = [];
rpt.push("# occupation.json 解析报告");
rpt.push("");
rpt.push(`生成时间：${new Date().toISOString().slice(0, 19)}　源文件：全维度职业标签总库.md`);
rpt.push("");
rpt.push(`## 总览`);
rpt.push("");
rpt.push(`- 职业总数：**${stat.total}**（两表按名称连接后去重）`);
rpt.push(`- 含矛盾标签（≥1 个维度 both）的职业：**${bothCount}**（${(bothCount / stat.total * 100).toFixed(1)}%）`);
rpt.push(`- 无智能标签（仅在五维库出现）的职业：${noInt}；仅在五维库：${onlyInBig5.length ? onlyInBig5.join("、") : "无"}；仅在智能库：${onlyInInt.length ? onlyInInt.join("、") : "无"}`);
rpt.push(`- 五维库来源分布：${Object.entries(srcDist).map(([k, v]) => `${k}=${v}`).join("，")}`);
rpt.push("");
rpt.push("## 各维度状态分布（坑3：both=矛盾标签）");
rpt.push("");
rpt.push("| 维度 | high | low | both | none |");
rpt.push("|---|---|---|---|---|");
for (const d of DIMS) rpt.push(`| ${d} | ${stat[d].high} | ${stat[d].low} | ${stat[d].both} | ${stat[d].none} |`);
rpt.push("");
rpt.push("## 智能标签分布（top3 计数）");
rpt.push("");
rpt.push(Object.entries(intDist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}：${v}`).join("\n"));
rpt.push("");
rpt.push("## 矛盾标签最多的职业（≥3 维 both，前 10）");
rpt.push("");
if (bothTop.length) {
  rpt.push("| 职业 | 矛盾维度 |");
  rpt.push("|---|---|");
  for (const o of bothTop) rpt.push(`| ${o.name} | ${o.contradiction_dims.join("、")} |`);
} else rpt.push("无");
rpt.push("");
rpt.push("## 解析错误清单（需人工处理）");
rpt.push("");
const allErr = [...big5Res.errors, ...big5Errors, ...intRes.errors, ...intErrors];
if (allErr.length === 0) rpt.push("无——所有标签均成功映射到 canonical_id，无重复行。");
else allErr.forEach(e => rpt.push(`- ${e.name}${e.line ? "（第" + e.line + "行）" : ""}：${e.problem}`));
rpt.push("");
rpt.push(rptExtra);
fs.writeFileSync(OUT_REPORT, rpt.join("\n"), "utf8");

console.log(JSON.stringify({ total: stat.total, bothCount, noInt, onlyInBig5, onlyInInt, errors: allErr.length, perDim: Object.fromEntries(DIMS.map(d => [d, stat[d]])), intDist }, null, 2));
