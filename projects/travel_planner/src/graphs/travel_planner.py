"""旅行计划生成工作流 - 输入城市名称，生成详细时间表和旅行攻略"""
from __future__ import annotations
import logging
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

logger = logging.getLogger(__name__)


def _get_state_class():
    from ..state import WorkflowState
    return WorkflowState


# ── Node functions ─────────────────────────────────────────────────────────

async def validate_input(state, config: RunnableConfig) -> dict:
    """验证用户输入的城市名称"""
    city_name = state.get("user_input", "").strip()
    if not city_name:
        return {"error": "请提供城市名称", "is_valid": False}
    return {"city_name": city_name, "is_valid": True}


async def generate_travel_plan(state, config: RunnableConfig) -> dict:
    """调用LLM生成详细旅行计划和时间表"""
    from deerflow.config import get_app_config
    from deerflow.models import create_chat_model
    
    city_name = state["city_name"]
    model = create_chat_model(thinking_enabled=True, app_config=get_app_config())
    
    prompt = f"""你是一位专业的旅行规划师，请为我计划前往{city_name}的旅行做一份详细攻略。
请包含以下内容：
1. 推荐行程安排（按天划分，详细到时间段）
2. 必去景点推荐（每个景点简要介绍、建议游览时间、门票信息）
3. 美食推荐（当地特色菜品和推荐餐厅）
4. 住宿建议（不同预算区域推荐）
5. 出行交通指南
6. 注意事项和旅行小贴士

请使用清晰的Markdown格式输出，结构分明，重点突出。
"""
    
    response = await model.ainvoke([HumanMessage(content=prompt)])
    return {"travel_plan": response.content}


async def save_result(state, config: RunnableConfig) -> dict:
    """保存旅行计划结果到文件"""
    from ...src.storage.travel_store import save_output
    city_name = state["city_name"]
    travel_plan = state["travel_plan"]
    
    output_path = save_output(travel_plan, f"{city_name}_travel_plan")
    if output_path:
        return {"output_path": str(output_path), "final_output": travel_plan}
    return {"final_output": travel_plan}


# ── Graph factory ──────────────────────────────────────────────────────────

def make_travel_planner_graph() -> StateGraph:
    WorkflowState = _get_state_class()
    builder = StateGraph(WorkflowState)

    builder.add_node("validate_input", validate_input)
    builder.add_node("generate_travel_plan", generate_travel_plan)
    builder.add_node("save_result", save_result)

    builder.add_edge(START, "validate_input")
    builder.add_edge("validate_input", "generate_travel_plan")
    builder.add_edge("generate_travel_plan", "save_result")
    builder.add_edge("save_result", END)

    return builder