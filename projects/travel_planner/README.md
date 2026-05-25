# 旅行计划生成器

> 输入城市名称，自动生成详细的旅行时间表和旅行攻略。

## 项目结构

```
travel_planner/
├── assets/
│   ├── prompts/
│   └── templates/
├── config/workflow.yaml
├── scripts/run_travel_planner.py
├── src/graphs/travel_planner.py
├── src/storage/travel_store.py
└── workflow.json
```

## 工作流程

```
开始 → 验证输入 → 生成旅行计划 → 保存结果 → 结束
```

## 使用方法

### CLI 方式运行

```bash
uv run python projects/travel_planner/scripts/run_travel_planner.py 北京
```

### DeerFlow Workflow Builder

在 Workflow Builder 中打开 `travel_planner`，输入城市名称即可运行。

## 输出内容

生成的旅行攻略包含：
- 推荐行程安排（按天划分，详细到时间段）
- 必去景点推荐（介绍、游览时间、门票信息）
- 美食推荐（特色菜品和餐厅）
- 住宿建议（不同预算区域推荐）
- 出行交通指南
- 注意事项和旅行小贴士

结果会以 Markdown 格式保存到 `outputs/` 目录。

## 配置

编辑 `config/workflow.yaml` 调整参数：
- `travel.max_days`: 推荐行程最大天数
- `travel.include_pricing`: 是否包含价格信息

## 前置条件

- DeerFlow 后端已安装 (`make install`)
- `config.yaml` 中至少配置一个 LLM 模型