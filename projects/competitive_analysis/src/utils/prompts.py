"""Prompt templates for the competitive analysis workflow."""

COMPANY_RESEARCH_PROMPT_TEMPLATE = """\
Research the company "{company}" thoroughly using web search.

Collect the following information and write your findings clearly:

1. **Company Overview** — founding year, headquarters, CEO/leadership, employee count, stage (startup/public/etc.)
2. **Products & Services** — main offerings, pricing model, key differentiators
3. **Business Model** — how it makes money, customer segments, go-to-market strategy
4. **Financial Snapshot** — funding rounds / revenue / valuation (if public or disclosed)
5. **Market Position** — target market, geographic presence, estimated market share
6. **Recent News** — notable events in the past 6–12 months (fundraising, launches, partnerships)

Recommended search queries:
- "{company} company overview products"
- "{company} funding revenue valuation 2025"
- "{company} business model customers"
- "{company} latest news 2025"

Write a structured summary with clear section headers. State "数据暂不可得" when information is unavailable.
"""

COMPETITOR_RESEARCH_PROMPT_TEMPLATE = """\
Identify and research the top 3–5 competitors of "{company}" using web search.

For each competitor collect:
1. **Name & Overview** — what they do, founding year, size
2. **Products & Services** — key offerings and how they compare to {company}
3. **Strengths** — where they outperform {company}
4. **Weaknesses** — where they fall short
5. **Market Share / Revenue** — if available
6. **Pricing** — how their pricing compares
7. **Target Customers** — same or different segments

Recommended search queries:
- "{company} competitors alternatives 2025"
- "{company} vs [competitor name]"
- "top companies in [industry of {company}]"
- "[competitor] review comparison"

End with a structured comparison table:
| Company | Core Product | Strength vs {company} | Weakness vs {company} | Funding/Revenue |
|---------|-------------|----------------------|----------------------|-----------------|
"""

MARKET_RESEARCH_PROMPT_TEMPLATE = """\
Research the market landscape for the industry that "{company}" operates in.

Collect:
1. **Market Size & Growth** — TAM, current size in USD, CAGR 2024–2028
2. **Market Trends** — top 3–5 trends shaping the industry in 2024–2025
3. **Growth Drivers** — factors accelerating demand
4. **Barriers to Entry** — capital requirements, regulation, technology moats, network effects
5. **Industry Challenges** — headwinds, regulatory risks, macroeconomic factors
6. **Emerging Threats** — new technologies, substitutes, potential disruptors

Recommended search queries:
- "{company} industry market size 2024 2025"
- "[industry of {company}] market trends growth forecast"
- "[industry of {company}] challenges opportunities report"
- "[industry of {company}] competitive dynamics Porter five forces"

Write a structured market analysis with clear section headers.
"""

COMPETITIVE_REPORT_PROMPT_TEMPLATE = """\
You are a senior strategy consultant. Synthesise the following research into a \
professional competitive analysis report for "{company}". Write entirely in Chinese (中文).

## Research Input

### Company Research
{company_research}

### Competitor Research
{competitor_research}

### Market Research
{market_research}

---

Generate a complete Markdown report with this exact structure:

# {company} 竞品分析报告

## 执行摘要
[3–5 条核心发现，每条 1–2 句话]

## 1. 公司概况
[目标公司业务、产品/服务、商业模式、市场定位的综合描述]

## 2. 市场格局
### 2.1 市场规模与增长趋势
### 2.2 主要市场趋势（2024–2025）
### 2.3 行业竞争强度评估

## 3. 主要竞争对手分析
### 3.1 [竞争对手1名称]
（产品、优劣势、市场地位各一段）
### 3.2 [竞争对手2名称]
### 3.3 [竞争对手3名称]
（根据研究结果增减章节）

## 4. 竞争对比矩阵

| 维度 | {company} | 竞对A | 竞对B | 竞对C |
|------|-----------|-------|-------|-------|
| 核心产品 | | | | |
| 定价策略 | | | | |
| 目标客户 | | | | |
| 技术壁垒 | | | | |
| 品牌知名度 | | | | |
| 融资/营收规模 | | | | |

## 5. SWOT 分析 —— {company}

|  | 优势 (Strengths) | 劣势 (Weaknesses) |
|--|------------------|-------------------|
| **机会 (Opportunities)** | SO 战略 | WO 战略 |
| **威胁 (Threats)** | ST 战略 | WT 战略 |

## 6. 战略建议
1. [具体可执行的建议1]
2. [具体可执行的建议2]
3. [具体可执行的建议3]
4. [建议4（如有）]

## 7. 结论
[客观、中立的总结性判断，2–3 段，不含项目符号]

---

Strict rules:
- All data must come from the research input above — never fabricate numbers.
- Write "数据暂不可得" when information is genuinely unavailable.
- Maintain McKinsey/BCG consulting tone throughout.
- Minimum 1 500 Chinese characters.
"""