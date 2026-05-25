# Daily AI Industry News Digest Template

Used by the **Format Digest** LLM node to produce the final notification message.

---

🤖 **Daily AI Industry News — {date}**

{story_1_index}. **{story_1_title}**
{story_1_summary}
🔗 {story_1_link}

{story_2_index}. **{story_2_title}**
{story_2_summary}
🔗 {story_2_link}

{story_3_index}. **{story_3_title}**
{story_3_summary}
🔗 {story_3_link}

---
Automated by AI Daily News Workflow

---

## Field Constraints

| Field | Constraint |
|-------|-----------|
| `date` | `YYYY-MM-DD HH:MM:SS` (local time) |
| `story_N_title` | Verbatim from RSS feed entry |
| `story_N_summary` | HTML-stripped, ≤ 200 characters, truncated with `…` |
| `story_N_link` | Direct article URL |

## Prompt Template (sent to LLM)

```
Format the following top AI news stories into a concise daily digest
with emoji headers, summaries under 200 characters, and source links.

Stories: {{top_news}}
```