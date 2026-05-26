# AI News Daily Workflow

> Fetch AI industry RSS feeds → score and rank articles → extract top 3 stories → LLM-formatted digest → deliver via Telegram, webhook, or local file.

## Project Structure

```
ai_news_daily/
├── assets/
│   ├── prompts/
│   │   └── rss_sources.md          # RSS feed reference and keyword weights
│   └── templates/
│       └── digest_template.md      # digest format template
├── config/
│   └── workflow.yaml               # feeds, scoring, digest, and notification settings
├── scripts/
│   └── run_news.py                 # standalone CLI runner
└── src/
    ├── graphs/
    │   └── ai_news_daily.py        # StateGraph (source of truth)
    ├── state.py                    # re-exports WorkflowState from harness
    ├── storage/
    │   └── digest_store.py         # save / load digests from disk
    ├── tools/                      # custom tool stubs (extend as needed)
    └── utils/
        ├── rss_collector.py        # AINewsCollector: fetch, score, format
        └── notifier.py             # Notifier: telegram / webhook / file delivery
```

## Workflow

```
         Trigger (scheduled or manual)
                     │
                     ▼
           ┌─────────────────┐
           │   Fetch RSS     │  pull articles from all configured feeds
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │  Score & Rank   │  keyword-weighted relevance scoring
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │ Extract Top 3   │  keep top-N highest-scoring articles
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │ Format Digest   │  LLM produces polished Markdown digest
           └────────┬────────┘
                    │
                    ▼
           ┌─────────────────┐
           │ Delivery Method?│
           └──┬──────────┬───┘
              │          │
    ┌─────────▼──┐  ┌────▼──────┐
    │Send Telegram│  │Send Webhook│
    └─────────┬──┘  └────┬──────┘
              └────┬─────┘
                   │
                   ▼
             ┌──────────┐
             │   Done   │  digest saved to {DEER_FLOW_HOME}/projects/ai_news_daily/
             └──────────┘
```

## Usage

### CLI (standalone)

```bash
# Write digest to a local Markdown file (default, no credentials needed)
uv run python projects/ai_news_daily/src/run_news.py --method file

# Fetch top 5 stories instead of 3
uv run python projects/ai_news_daily/src/run_news.py --top-n 5

# Send via Telegram (credentials from env vars)
export TELEGRAM_BOT_TOKEN=your_bot_token
export TELEGRAM_CHAT_ID=your_chat_id
uv run python projects/ai_news_daily/src/run_news.py --method telegram

# Send via Telegram using a credentials JSON file
uv run python projects/ai_news_daily/src/run_news.py \
    --method telegram --config path/to/credentials.json

# POST to a webhook
export WEBHOOK_URL=https://your.endpoint/hook
uv run python projects/ai_news_daily/src/run_news.py --method webhook
```

Example `credentials.json`:
```json
{
  "bot_token": "123456:ABC-your-bot-token",
  "chat_id": "-100your_chat_id",
  "webhook_url": "https://your.endpoint/hook"
}
```

### Via DeerFlow Chat

Enable the **ai-news-daily** skill in the DeerFlow UI, then type:

```
Run the AI news daily digest and send it via Telegram
```

or trigger it on a schedule via the DeerFlow workflow runner.

## Configuration

### `config/workflow.yaml`

Key settings:

| Key | Default | Description |
|-----|---------|-------------|
| `collector.feeds` | 5 feeds | RSS/Atom feed URLs to poll |
| `collector.top_n` | `3` | Number of top stories to include |
| `collector.fetch_timeout_seconds` | `30` | Per-feed HTTP timeout |
| `scoring.ai_keyword_weight` | `2` | Multiplier for AI-specific keywords vs generic keywords |
| `digest.max_summary_chars` | `200` | Maximum summary length before truncation |
| `digest.model_name` | `null` | LLM to use (`null` = default from `config.yaml`) |
| `notification.method` | `telegram` | Default delivery method |

### Credential Environment Variables

| Variable | Used by |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram delivery (`--method telegram`) |
| `TELEGRAM_CHAT_ID` | Telegram delivery (`--method telegram`) |
| `WEBHOOK_URL` | Webhook delivery (`--method webhook`) |

Credentials can also be passed via a `--config` JSON file or set in `config/workflow.yaml` under `notification.telegram` / `notification.webhook`.

### Digest Output

Digests are saved to `{DEER_FLOW_HOME}/projects/ai_news_daily/ai_news_{YYYYMMDD}.md`.

## Prerequisites

- DeerFlow backend installed (`make install` from repo root)
- `config.yaml` with at least one LLM model configured
- `feedparser` Python package (`uv add feedparser`)
- `requests` Python package (`uv add requests`) for Telegram/webhook delivery
- For Telegram delivery: a bot token and chat ID (see [Telegram Bot API](https://core.telegram.org/bots/api))