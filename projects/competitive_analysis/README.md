# Competitive Analysis Workflow

> Input a company name → three parallel web-research subagents → professional Chinese-language competitive analysis report.

## Project Structure

```
competitive_analysis/
├── assets/
│   ├── prompts/
│   │   └── research_queries.md     # search query reference guide
│   └── templates/
│       └── report_template.md      # report format template
├── config/
│   └── workflow.yaml               # agent / subagent / report settings
├── scripts/
│   └── run_analysis.py             # standalone CLI runner
└── src/
    ├── agents/                     # SubagentConfig factory
    ├── graphs/
    │   └── competitive_analysis.py # StateGraph (source of truth)
    ├── storage/
    │   └── report_store.py         # save / load reports
    ├── tools/                      # custom tool stubs (extend as needed)
    └── utils/
        ├── company_extractor.py    # parse company name from message
        └── prompts.py              # all prompt templates
```

## Workflow

```
User message (company name)
        │
        ▼
┌─────────────────┐
│ extract_company │  parse the company name from free-form text
└────────┬────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                    research (parallel)                  │
│  ┌────────────────┐  ┌──────────────────┐  ┌─────────┐ │
│  │ Company profile│  │ Competitor research│  │ Market │ │
│  │  (subagent A)  │  │   (subagent B)    │  │analysis│ │
│  └────────────────┘  └──────────────────┘  └─────────┘ │
└────────────────────────────┬───────────────────────────┘
                             │
                             ▼
                   ┌──────────────────┐
                   │ generate_report  │  LLM synthesises into structured report
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────┐
                   │   save_report    │  writes Markdown file to disk
                   └──────────────────┘
```

## Usage

### Via LangGraph API (recommended)

```bash
POST /api/langgraph/competitive_analysis_agent/runs/stream
Content-Type: application/json

{
  "input": {
    "messages": [{"role": "user", "content": "OpenAI 竞品分析"}]
  }
}
```

### CLI (standalone)

```bash
# From the repository root
uv run python projects/competitive_analysis/src/run_analysis.py "OpenAI"
uv run python projects/competitive_analysis/src/run_analysis.py "字节跳动"
```

### Via DeerFlow Chat (Skill)

Enable the **competitive-analysis** skill in the DeerFlow UI, then simply type:

```
帮我做 OpenAI 的竞品分析
```

## Report Output

Reports are saved to `{DEER_FLOW_HOME}/projects/competitive_analysis/{company}_{date}_竞品分析.md`.

Default report structure:
1. 执行摘要 (Executive Summary)
2. 公司概况 (Company Overview)
3. 市场格局 (Market Landscape)
4. 主要竞争对手分析 (Competitor Analysis — 3–5 companies)
5. 竞争对比矩阵 (Competitive Matrix table)
6. SWOT 分析 (SWOT)
7. 战略建议 (Strategic Recommendations)
8. 结论 (Conclusion)

## Configuration

Edit `config/workflow.yaml` to adjust timeouts, subagent settings, and output paths.

## Prerequisites

- DeerFlow backend installed (`make install` from repo root)
- `config.yaml` with at least one LLM model configured
- Web search tool configured (Tavily recommended) for live research