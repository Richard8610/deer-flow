# 财经新闻每日推送工作流

> 每天早上8点自动抓取A股行情新闻，提取10条关键内容推送给用户。

## 项目结构

```
finance_news_push/
├── assets/
│   ├── prompts/
│   └── templates/
├── config/workflow.yaml
├── scripts/run_finance_news_push.py
├── src/
│   ├── state.py
│   ├── graphs/finance_news_push.py
│   ├── storage/news_store.py
│   └── utils/rss_collector.py
└── workflow.json
```

## 工作流程

```
Start → Fetch News → Format Content → Save & Notify → End
```

## 功能特点

- 从主流财经RSS源（新浪财经、同花顺）抓取最新A股新闻
- 自动提取整理前10条新闻
- 保存为Markdown格式到本地
- 支持每日8点定时触发

## 使用方法

### 手动运行
```bash
uv run python projects/finance_news_push/scripts/run_finance_news_push.py
```

### 定时运行
在Workflow Builder中配置定时触发 `0 8 * * *` 即可每日早上8点自动执行。

## 配置

编辑 `config/workflow.yaml` 调整参数：
- `news.max_items`: 提取新闻条数（默认10条）
- `news.rss_feeds`: RSS新闻源列表，可自行添加
- `news.schedule`: Cron调度表达式

## 依赖

- feedparser (RSS解析)
- DeerFlow 后端环境

## 安装依赖
```bash
pip install feedparser
```