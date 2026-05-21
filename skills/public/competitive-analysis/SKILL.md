---
name: competitive-analysis
description: Use this skill whenever the user asks to analyze a company's competitive landscape, research competitors, or generate a competitive analysis report. Triggers on phrases like "竞品分析", "analyze competitors of X", "competitive landscape of X", "帮我分析X的竞争对手", or any request to compare a company against its market peers.
---

# Competitive Analysis Skill

## Overview

This skill provides a structured methodology for conducting thorough competitive analysis and generating professional reports. It orchestrates three parallel research streams using subagents, then synthesizes everything into a consulting-grade report.

## When to Use This Skill

- User provides a company name and asks for competitive analysis
- User asks "who are the competitors of X"
- User asks for market landscape analysis of an industry
- User wants a SWOT analysis anchored to a real company
- User wants to understand how a company stacks up against peers

## Workflow

### Phase 1 — Extract Company

Parse the target company name from the user's message. Accept Chinese or English names.

Examples:
- "帮我分析字节跳动的竞争对手" → company = "字节跳动"
- "competitive analysis of OpenAI" → company = "OpenAI"
- "Salesforce 竞品分析" → company = "Salesforce"

### Phase 2 — Parallel Research (use `task` tool for all three simultaneously)

Launch **three subagent tasks in parallel** using the `task` tool:

#### Task A — Company Profile
```
Description: Research {company} company profile
Subagent type: general-purpose
Prompt:
Research the company "{company}" thoroughly using web search.
Find: founding year, HQ, CEO, employee count, products/services, business model,
funding/revenue, market position, and key news from the past 12 months.
Search queries: "{company} overview products", "{company} funding revenue 2025",
"{company} latest news 2025". Write a structured summary.
```

#### Task B — Competitor Research
```
Description: Research {company} top competitors
Subagent type: general-purpose
Prompt:
Identify and research the top 3–5 competitors of "{company}".
For each: name, what they do, strengths vs {company}, weaknesses vs {company},
market share or revenue, and pricing comparison.
Search queries: "{company} competitors alternatives", "top companies in [industry]",
"{company} vs [competitor]".
End with a comparison table.
```

#### Task C — Market Analysis
```
Description: Analyze {company} market landscape
Subagent type: general-purpose
Prompt:
Research the market that "{company}" operates in.
Find: market size (TAM), CAGR, top trends 2024–2025, growth drivers,
barriers to entry, key risks and threats.
Search queries: "{company} industry market size 2025",
"[industry] trends growth forecast", "[industry] challenges opportunities".
```

### Phase 3 — Generate Report

After all three tasks complete, synthesize findings into a professional Markdown report with this structure:

```markdown
# {company} 竞品分析报告

## 执行摘要
[3–5 条核心发现]

## 1. 公司概况
[目标公司业务、产品、定位]

## 2. 市场格局
### 2.1 市场规模与增长
### 2.2 市场趋势（2024–2025）
### 2.3 竞争强度评估

## 3. 主要竞争对手分析
### 3.1 [竞争对手1]
（产品、优劣势、市场地位）
### 3.2 [竞争对手2]
### 3.3 [竞争对手3]

## 4. 竞争比较矩阵
| 维度 | {company} | 竞对A | 竞对B | 竞对C |
|------|-----------|-------|-------|-------|
| 产品广度 | | | | |
| 定价 | | | | |
| 市场份额 | | | | |
| 技术壁垒 | | | | |
| 品牌知名度 | | | | |

## 5. SWOT 分析 — {company}
| | 优势 (S) | 劣势 (W) |
|---|---|---|
| **机会 (O)** | SO战略 | WO战略 |
| **威胁 (T)** | ST战略 | WT战略 |

## 6. 战略建议
1. [具体建议1]
2. [具体建议2]
3. [具体建议3]

## 7. 结论
[客观综述]
```

### Phase 4 — Save Report

Use `write_file` to save the report to `/mnt/user-data/outputs/{company}_竞品分析.md`, then use `present_files` to make it available to the user.

## Quality Standards

- Every claim must be backed by web search results — no hallucinations.
- If data is unavailable, write "数据暂不可得" rather than fabricating numbers.
- Use McKinsey/BCG consulting tone throughout.
- Report language: Chinese (中文) unless user specifies otherwise.
- Minimum report length: 1500 Chinese characters.
- The comparison matrix and SWOT table are mandatory.

## Research Tips

- Search in both Chinese and English for Chinese companies.
- Use year-qualified queries: "2024" or "2025" to get current data.
- Fetch full pages for key authoritative sources (annual reports, analyst reports).
- Cross-reference at least 3 sources for market size figures.
- Check Crunchbase, LinkedIn, and company IR pages for financial data.