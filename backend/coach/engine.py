from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime
from typing import Any
from uuid import uuid4

from .errors import InvalidRequest


class CoachEngine:
    """Deterministic reference Coach used for UI integration and state testing.

    The public response contract is intentionally provider-neutral. A model-backed
    provider can replace the decision functions without changing the frontend API.
    """

    valid_event_types = {
        "message",
        "answer_question",
        "confirm_gap_map",
        "request_gap_change",
        "confirm_plan",
        "request_plan_change",
        "submit_result",
        "report_blocker",
        "request_help",
        "pause",
        "resume",
    }

    def create_state(
        self,
        payload: dict[str, Any],
        now: datetime,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        context = payload.get("career_context") or {}
        preferences = payload.get("preferences") or {}
        session_id = f"coach-{uuid4()}"
        timestamp = now.isoformat()
        state: dict[str, Any] = {
            "session_id": session_id,
            "state_version": 1,
            "phase": "onboarding",
            "domain": payload.get("domain", "career"),
            "user_id": payload.get("user_id") or payload.get("client_user_id"),
            "client_user_id": payload.get("user_id") or payload.get("client_user_id"),
            "career_context": context,
            "gap_map": [],
            "stage_plan": [],
            "current_stage_id": None,
            "current_day": 1,
            "current_task": None,
            "previous_session": None,
            "evidence_log": [],
            "preferences": preferences,
            "paused_from_phase": None,
            "last_learning_date": None,
            "day_completed": False,
            "created_at": timestamp,
            "updated_at": timestamp,
            "last_response": None,
        }
        response = self._onboarding_response(state)
        state["last_response"] = response
        return state, response

    def prepare_for_date(
        self,
        original_state: dict[str, Any],
        today: date,
        now: datetime,
    ) -> tuple[dict[str, Any], dict[str, Any], bool]:
        state = deepcopy(original_state)
        last_date = state.get("last_learning_date")
        if (
            state.get("phase") == "submission_review"
            and state.get("day_completed")
            and last_date
            and date.fromisoformat(last_date) < today
        ):
            state["phase"] = "daily_review"
            state["current_day"] += 1
            state["day_completed"] = False
            state["state_version"] += 1
            state["updated_at"] = now.isoformat()
            response = self._daily_review_response(state)
            state["last_response"] = response
            return state, response, True
        return state, self._refresh_response(state), False

    def handle_turn(
        self,
        original_state: dict[str, Any],
        event: dict[str, Any],
        now: datetime,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        event_type = event.get("type")
        if event_type not in self.valid_event_types:
            raise InvalidRequest(f"不支持的事件类型：{event_type!r}")

        state = deepcopy(original_state)
        phase = state["phase"]

        if event_type == "pause":
            if phase != "paused":
                state["paused_from_phase"] = phase
                state["phase"] = "paused"
            response = self._response(
                state,
                "已经为你保存进度。准备好后从这里继续，不需要重新开始。",
                [{"id": "pause-notice", "type": "notice", "data": {"tone": "neutral", "text": "当前进度已保存。"}}],
                [{"id": "resume", "label": "继续", "event_type": "resume"}],
            )
        elif phase == "paused" and event_type == "resume":
            state["phase"] = state.get("paused_from_phase") or "onboarding"
            state["paused_from_phase"] = None
            response = self._refresh_response(state)
        elif phase == "onboarding":
            response = self._start_gap_analysis(state, event)
        elif phase == "gap_analysis":
            response = self._handle_gap_turn(state, event)
        elif phase == "plan_review":
            response = self._handle_plan_turn(state, event)
        elif phase == "daily_learning":
            response = self._handle_learning_turn(state, event, now)
        elif phase == "submission_review":
            response = self._response(
                state,
                "今天的结果已经保存。下一次进入时，我会先和你复盘，再决定后续内容。",
                [
                    {
                        "id": "day-complete-notice",
                        "type": "notice",
                        "data": {"tone": "supportive", "text": "今天到这里即可，不需要提前完成明天的内容。"},
                    }
                ],
                [],
            )
        elif phase == "daily_review":
            response = self._handle_daily_review(state, event)
        else:
            raise InvalidRequest(f"当前阶段暂不接受新的交互：{phase}")

        state["state_version"] += 1
        state["updated_at"] = now.isoformat()
        response = self._with_state_metadata(state, response)
        state["last_response"] = response
        return state, response

    def _start_gap_analysis(self, state: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
        if event["type"] not in {"message", "answer_question"}:
            raise InvalidRequest("首次对话需要先回答 Coach 的起点问题。")
        state["phase"] = "gap_analysis"
        state["gap_map"] = self._build_gap_map(state)
        return self._response(
            state,
            "我先把目前能确认的内容和还不知道的部分分开。这里不是对你能力的判决，你可以修改。",
            [
                {"id": "gap-map", "type": "gap_map", "data": {"items": state["gap_map"]}},
                {
                    "id": "gap-boundary",
                    "type": "notice",
                    "data": {"tone": "neutral", "text": "没有证据的能力会标记为“待确认”，不会写成“不会”。"},
                },
            ],
            [
                {"id": "confirm-gap", "label": "这个分析基本准确", "event_type": "confirm_gap_map"},
                {"id": "change-gap", "label": "我想修改", "event_type": "request_gap_change"},
            ],
        )

    def _handle_gap_turn(self, state: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
        if event["type"] == "confirm_gap_map":
            state["phase"] = "plan_review"
            state["stage_plan"] = self._build_stage_plan(state)
            state["current_stage_id"] = state["stage_plan"][0]["id"]
            return self._response(
                state,
                "基于当前 Gap，我建议先确认起点，再补最关键能力，最后留下可展示的证据。计划可以随 Review 调整。",
                [{"id": "stage-plan", "type": "stage_plan", "data": {"stages": state["stage_plan"]}}],
                [
                    {"id": "confirm-plan", "label": "按这个计划开始", "event_type": "confirm_plan"},
                    {"id": "change-plan", "label": "我想调整计划", "event_type": "request_plan_change"},
                ],
            )
        if event["type"] in {"request_gap_change", "message"}:
            return self._response(
                state,
                "可以。请告诉我哪一条不像你，或者补充一个能支持你判断的具体经历。",
                [{"id": "gap-question", "type": "question", "data": {"prompt": "你想修改哪一条？为什么？", "allow_text": True}}],
                [{"id": "confirm-gap", "label": "修改后确认", "event_type": "confirm_gap_map"}],
            )
        raise InvalidRequest("请先确认或修改 Gap Map。")

    def _handle_plan_turn(self, state: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
        if event["type"] == "confirm_plan":
            state["phase"] = "daily_learning"
            state["current_task"] = self._build_daily_task(state, "first")
            return self._daily_task_response(
                state,
                "今天不从零做大作品，只做一个低压力的起点定位。",
            )
        if event["type"] in {"request_plan_change", "message"}:
            return self._response(
                state,
                "计划可以改。你更想调整的是目标、顺序、每天投入时间，还是任务难度？",
                [
                    {
                        "id": "plan-question",
                        "type": "question",
                        "data": {
                            "prompt": "请选择或直接说明想调整的部分。",
                            "options": ["目标", "顺序", "每天时间", "难度"],
                            "allow_text": True,
                        },
                    }
                ],
                [{"id": "confirm-plan", "label": "调整后开始", "event_type": "confirm_plan"}],
            )
        raise InvalidRequest("请先确认或修改阶段计划。")

    def _handle_learning_turn(
        self,
        state: dict[str, Any],
        event: dict[str, Any],
        now: datetime,
    ) -> dict[str, Any]:
        if event["type"] in {"report_blocker", "request_help"}:
            state["current_task"] = self._build_daily_task(state, "reduce")
            return self._daily_task_response(
                state,
                "这个卡点不代表你做不到。我们先把任务缩小，只保留定位起点所需的最少证据。",
            )
        if event["type"] == "submit_result":
            evidence = event.get("evidence") or []
            message = (event.get("message") or "").strip()
            evidence_record = {
                "id": f"evidence-{uuid4()}",
                "day": state["current_day"],
                "summary": message or "用户提交了当天任务结果。",
                "attachments": evidence,
                "completion_status": "partial" if event.get("action_id") == "task-partial" else "completed",
                "status": "pending_review",
                "created_at": now.isoformat(),
            }
            state["evidence_log"].append(evidence_record)
            state["previous_session"] = {
                "day": state["current_day"],
                "task": state["current_task"],
                "result": evidence_record,
            }
            state["last_learning_date"] = now.date().isoformat()
            state["day_completed"] = True
            state["phase"] = "submission_review"
            return self._response(
                state,
                "我已经记下今天的结果。它现在是一条待复核证据；明天 Review 后再决定它能支持什么能力判断。",
                [
                    {
                        "id": "feedback",
                        "type": "feedback",
                        "data": {
                            "result": "received",
                            "strength": "你完成了一个可以继续讨论的具体产物或说明。",
                            "boundary": "仅凭一次提交还不能直接证明已经掌握。",
                        },
                    },
                    {"id": "evidence-update", "type": "evidence_update", "data": evidence_record},
                ],
                [],
            )
        raise InvalidRequest("当前课程支持提交结果、报告卡点或请求帮助。")

    def _handle_daily_review(self, state: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
        if event["type"] not in {"message", "answer_question"}:
            raise InvalidRequest("请先完成前一天的 Review。")
        action_id = event.get("action_id") or ""
        text = (event.get("message") or "").lower()
        if action_id == "review_blocked" or "没" in text or "卡" in text:
            mode = "reduce"
            intro = "昨天的主要问题是任务摩擦。今天先降低难度，不增加新的学习负担。"
        elif action_id == "review_partial" or "部分" in text:
            mode = "continue"
            intro = "昨天已经产生了一部分证据。今天从断点继续，不重新做整节内容。"
        else:
            mode = "advance"
            intro = "昨天的起点任务已经完成。今天提高一点点难度，用新任务验证能否迁移。"

        if state["evidence_log"]:
            state["evidence_log"][-1]["status"] = "reviewed"
        state["phase"] = "daily_learning"
        state["current_task"] = self._build_daily_task(state, mode)
        return self._daily_task_response(state, intro)

    def _onboarding_response(self, state: dict[str, Any]) -> dict[str, Any]:
        target = self._target_title(state)
        return self._response(
            state,
            f"我们先不急着开始固定课程。我会围绕“{target}”确认你的目标、已有证据和还不知道的部分，再一起决定从哪里开始。",
            [
                {
                    "id": "onboarding-question",
                    "type": "question",
                    "data": {
                        "prompt": "如果这次 Coach 只能先帮你解决一件事，你最希望是什么？",
                        "options": ["确认自己是否适合", "找到能力差距", "开始第一项练习", "我还不确定"],
                        "allow_text": True,
                    },
                }
            ],
            [{"id": "answer-start", "label": "提交回答", "event_type": "answer_question"}],
        )

    def _daily_review_response(self, state: dict[str, Any]) -> dict[str, Any]:
        previous = state.get("previous_session") or {}
        return self._response(
            state,
            "开始今天的内容前，我们先复盘昨天。重点不是打卡，而是判断任务是否合适、产生了什么证据。",
            [
                {
                    "id": f"review-day-{previous.get('day', state['current_day'] - 1)}",
                    "type": "review",
                    "data": {
                        "previous_day": previous.get("day", state["current_day"] - 1),
                        "previous_task": previous.get("task"),
                        "prompt": "昨天完成到哪里？最大的困难是什么？",
                    },
                }
            ],
            [
                {"id": "review-complete", "label": "顺利完成", "event_type": "answer_question", "action_id": "review_complete"},
                {"id": "review-partial", "label": "只完成一部分", "event_type": "answer_question", "action_id": "review_partial"},
                {"id": "review-blocked", "label": "基本没开始 / 卡住", "event_type": "answer_question", "action_id": "review_blocked"},
            ],
        )

    def _daily_task_response(self, state: dict[str, Any], message: str) -> dict[str, Any]:
        return self._response(
            state,
            message,
            [{"id": f"task-day-{state['current_day']}", "type": "daily_task", "data": state["current_task"]}],
            [
                {"id": "task-done", "label": "我完成了", "event_type": "submit_result"},
                {"id": "task-partial", "label": "我只完成了一部分", "event_type": "submit_result"},
                {"id": "task-blocked", "label": "我卡住了", "event_type": "report_blocker"},
                {"id": "task-help", "label": "我需要帮助", "event_type": "request_help"},
            ],
        )

    def _build_gap_map(self, state: dict[str, Any]) -> list[dict[str, Any]]:
        context = state.get("career_context") or {}
        requirements = context.get("target_requirements") or []
        user_profile = context.get("user_profile") or {}
        evidence = user_profile.get("evidence") or []
        evidence_refs = [
            item.get("id")
            for item in evidence
            if isinstance(item, dict) and item.get("id")
        ]
        first_requirement = requirements[0] if requirements else None
        requirement_refs = [first_requirement.get("id")] if first_requirement else []
        requirement_reason = (
            first_requirement.get("text")
            if first_requirement
            else "当前还没有足够的目标要求来源，需要 Career Skill 补充或由 Coach 继续核验。"
        )
        starting_reason = (
            f"当前已有 {len(evidence_refs)} 条画像证据，但还需要核验它们与目标方向的关联，以及目前能够独立完成到什么程度。"
            if evidence_refs
            else "已有经历能说明接触过相关方向，但不足以判断目前能够独立完成到什么程度。"
        )
        return [
            {
                "id": "gap-starting-level",
                "type": "unknown",
                "title": "当前能力起点仍待确认",
                "status": "unknown",
                "priority": "high",
                "target_requirement_refs": requirement_refs,
                "user_evidence_refs": evidence_refs,
                "reason": starting_reason,
                "next_validation": "用一份已有作品、练习或具体经历定位起点。",
            },
            {
                "id": "gap-evidence",
                "type": "evidence",
                "title": "现有证据与目标方向的关联性待核验" if evidence_refs else "缺少可复核的能力证据",
                "status": "in_progress" if evidence_refs else "confirmed" if first_requirement else "unknown",
                "priority": "high",
                "target_requirement_refs": requirement_refs,
                "user_evidence_refs": evidence_refs,
                "reason": requirement_reason,
                "next_validation": "先寻找已有材料，不要求用户从零完成高压力作品。",
            },
        ]

    def _build_stage_plan(self, state: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            {
                "id": "stage-start",
                "title": "确认当前起点",
                "gap_refs": ["gap-starting-level", "gap-evidence"],
                "reason": "先知道已经会什么，避免重复学习或难度过高。",
                "completion_criteria": ["形成至少一条经过 Review 的能力证据"],
                "status": "active",
            },
            {
                "id": "stage-practice",
                "title": "补足最关键能力",
                "gap_refs": [],
                "reason": "起点确认后才选择真正影响目标的优先 Gap。",
                "completion_criteria": ["在一个新任务中完成迁移验证"],
                "status": "planned",
            },
            {
                "id": "stage-evidence",
                "title": "形成可展示证据",
                "gap_refs": ["gap-evidence"],
                "reason": "让能力能够被用户自己和外部机会理解。",
                "completion_criteria": ["形成可说明过程、结果和个人贡献的产物"],
                "status": "planned",
            },
        ]

    def _build_daily_task(self, state: dict[str, Any], mode: str) -> dict[str, Any]:
        target = self._target_title(state)
        available = int((state.get("preferences") or {}).get("available_minutes") or 30)
        if mode == "reduce":
            return {
                "title": "只找一条与目标相关的旧记录",
                "reason": "当前先降低启动摩擦，不要求完整作品。",
                "steps": ["查看相册、聊天记录、课程记录或旧文件名", "找到一条就停下", "用一句话说明它与目标的关系"],
                "completion_criteria": ["找到或描述一条相关记录；若仍没有，说明搜索过哪些地方"],
                "estimated_minutes": min(10, available),
                "target": target,
            }
        if mode == "continue":
            return {
                "title": "从昨天的断点补齐一条说明",
                "reason": "保留已经完成的部分，只补足判断起点所需的信息。",
                "steps": ["打开昨天的结果", "补充使用过的工具或自己的具体做法", "指出一个最想获得反馈的问题"],
                "completion_criteria": ["在昨天结果上新增一条可复核说明"],
                "estimated_minutes": min(15, available),
                "target": target,
            }
        if mode == "advance":
            return {
                "title": "用一个小变化验证能否迁移",
                "reason": "完成旧证据定位后，需要通过新变化判断能力是否稳定。",
                "steps": ["选择昨天材料中的一个小部分", "做一个明确且可比较的调整", "记录调整前后差异"],
                "completion_criteria": ["提交调整结果，并说明为什么这样改"],
                "estimated_minutes": min(20, available),
                "target": target,
            }
        return {
            "title": "选择一份最能代表当前起点的已有材料",
            "reason": "先定位起点，再决定真正需要学习什么。",
            "steps": ["从旧作品、练习、课程记录或具体经历中选一份", "写下使用过的工具和投入时间", "标记满意与不确定的部分"],
            "completion_criteria": ["提供一份材料或具体描述", "说明使用工具或做法", "指出一个希望获得反馈的问题"],
            "estimated_minutes": min(30, available),
            "target": target,
        }

    def _refresh_response(self, state: dict[str, Any]) -> dict[str, Any]:
        response = deepcopy(state.get("last_response") or self._onboarding_response(state))
        return self._with_state_metadata(state, response)

    def _response(
        self,
        state: dict[str, Any],
        message: str,
        blocks: list[dict[str, Any]],
        actions: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return self._with_state_metadata(
            state,
            {
                "session_id": state["session_id"],
                "state_version": state["state_version"],
                "phase": state["phase"],
                "coach_message": message,
                "ui_blocks": blocks,
                "quick_actions": actions,
            },
        )

    def _with_state_metadata(self, state: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
        result = deepcopy(response)
        result.update(
            {
                "session_id": state["session_id"],
                "state_version": state["state_version"],
                "phase": state["phase"],
                "state_summary": {
                    "target_title": self._target_title(state),
                    "current_stage": state.get("current_stage_id"),
                    "current_day": state.get("current_day", 1),
                    "progress_label": self._progress_label(state["phase"]),
                },
                "updated_at": state["updated_at"],
            }
        )
        return result

    def _target_title(self, state: dict[str, Any]) -> str:
        selected = (state.get("career_context") or {}).get("selected_direction") or {}
        return selected.get("title") or "当前职业方向"

    @staticmethod
    def _progress_label(phase: str) -> str:
        return {
            "onboarding": "首次对话",
            "gap_analysis": "确认 Gap Map",
            "plan_review": "确认阶段计划",
            "daily_learning": "当天课程",
            "submission_review": "等待次日 Review",
            "daily_review": "前一天复盘",
            "paused": "已暂停",
        }.get(phase, phase)
