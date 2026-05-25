# RSS Feed Sources Reference

Default feeds used by `AINewsCollector.get_news_from_feeds()`.

## Configured Sources

| Source | Feed URL |
|--------|----------|
| Google AI Blog | `https://ai.googleblog.com/atom.xml` |
| OpenAI Blog | `https://openai.com/blog/rss.xml` |
| AI Times | `https://www.aitimes.com/rss` |
| TechCrunch AI | `https://techcrunch.com/category/artificial-intelligence/feed/` |
| KDNuggets | `https://www.kdnuggets.com/feed` |

## AI Keyword Weights

Articles are scored by keyword frequency. Double-weight terms (×2):

```
ai, artificial, intelligence, machine, learning, model,
llm, gpt, chatbot, neural, deep, openai, google, gemini, transformer
```

All other words receive ×1 weight after English stop-word removal.

## Adding Custom Feeds

Add URLs to `RSS_FEEDS` in `config/workflow.yaml` under the `collector.feeds` key:

```yaml
collector:
  feeds:
    - https://your-feed-url/rss.xml
```

## Tips

- Prefer Atom feeds over RSS 2.0 — they carry richer `updated` timestamps.
- Add `?lang=en` to feeds that support locale filtering.
- Use year-qualified search queries ("AI 2025") to surface recent articles.