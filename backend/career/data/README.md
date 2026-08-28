# Occupation data boundary

结论：`occupations.json` 仅用于 Isyou 私有 Hackathon Demo 的职业方向探索，不是心理测评常模，也不能替代真实 JD 的资格核验。

- 数据版本：`schema_version 1.1`，642 个职业条目。
- 上游文件：飞书《全维度职业标签总库.md》与维护脚本生成结果。
- 标签状态：环境、职级、资格与多智能标签包含 AI 初标；应用层必须保留“不确定/待核验”边界。
- 发布边界：仓库转为公开前，必须重新核查上游数据来源、授权与许可；当前文件不得被视为可公开再分发的数据集。
- 产品边界：只输出 `career_fit_direction`。地点、薪资、雇佣类型、职级和资格的真实岗位过滤由后续 JD handoff 完成。
