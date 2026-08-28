import { escapeYaml, safeScalar } from "./utils.mjs";

function bullets(items, empty = "- 未知") {
  return items?.length ? items.map(item => `- ${String(item).trim()}`).join("\n") : empty;
}

function labelOpportunityType(type) {
  return { employment: "正式招聘", freelance: "自由职业", project: "项目制或外包" }[type] || "其他真实机会";
}

function unknownQuestions(opportunity) {
  const labels = {
    remote_work: "是否允许远程或混合办公？",
    flexible_schedule: "工作时间是否固定，是否存在夜班、轮班或弹性安排？",
    travel: "岗位是否需要出差，频率和持续时间如何？",
    onsite: "是否要求固定坐班或长期驻场？",
    communication_load: "会议、电话和面向客户沟通的频率如何？"
  };
  return opportunity.conditions.filter(item => item.status === "unknown_to_confirm").map(item => labels[item.condition]).filter(Boolean);
}

export function renderOpportunityMarkdown(opportunity, rank) {
  const notes = [
    ...opportunity.extraction_notes,
    `核验状态：${opportunity.verification_status}`,
    `页面内容指纹：${opportunity.content_hash}`,
    "未明确的信息保留为未知，没有根据职业名称或搜索摘要补写。"
  ];
  return `---
schema_version: output2.jd.v1.0
opportunity_id: ${escapeYaml(opportunity.opportunity_id)}
rank: ${rank}
opportunity_type: ${escapeYaml(opportunity.opportunity_type)}
verification_status: ${escapeYaml(opportunity.verification_status)}
retrieved_at: ${escapeYaml(opportunity.retrieved_at)}
source_url: ${escapeYaml(opportunity.url)}
---

# ${safeScalar(opportunity.title)}

## 基本信息

- 公司或发布方：${safeScalar(opportunity.company)}
- 机会类型：${labelOpportunityType(opportunity.opportunity_type)}
- 地点：${safeScalar(opportunity.location)}
- 工作方式：${safeScalar(opportunity.work_mode)}
- 雇佣或合作形式：${safeScalar(opportunity.employment_type)}
- 薪资或报酬：${safeScalar(opportunity.compensation)}
- 招聘或项目状态：${safeScalar(opportunity.status)}
- 发布时间：${safeScalar(opportunity.published_at)}
- 原始链接：[打开来源页面](${opportunity.url})

## 岗位职责或项目任务

${bullets(opportunity.tasks)}

## 必备要求

${bullets(opportunity.required)}

## 优先条件

${bullets(opportunity.preferred)}

## 工具与技术

${bullets(opportunity.tools)}

## 学历、经验与资格

${bullets(opportunity.education_experience)}

## 时间、地点与协作条件

${bullets(opportunity.schedule_location_collaboration)}

## 未知且需要向招聘方确认的条件

${bullets(unknownQuestions(opportunity))}

## 来源与核验说明

- 来源类型：${safeScalar(opportunity.source_type)}
- 检索时间：${safeScalar(opportunity.retrieved_at)}
${bullets(notes)}
`;
}

export function buildMarkdownFiles(opportunities) {
  return opportunities.map((opportunity, index) => ({
    filename: `jd_${String(index + 1).padStart(2, "0")}.md`,
    opportunity_id: opportunity.opportunity_id,
    content: renderOpportunityMarkdown(opportunity, index + 1)
  }));
}
