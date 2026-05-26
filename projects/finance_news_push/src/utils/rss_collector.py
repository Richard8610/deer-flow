"""A股财经新闻收集工具"""
import feedparser
from typing import List, Dict
from datetime import datetime

# 常用财经新闻RSS源
RSS_FEEDS = [
    "https://rss.sina.com.cn/finance/stock/hs.xml",  # 新浪财经 - 沪深股市
    "https://www.10jqka.com.cn/rss/all.xml",  # 同花顺财经
]

def get_stock_news(max_items: int = 10) -> List[Dict]:
    """从RSS源获取A股最新新闻
    
    Args:
        max_items: 返回最大条数
        
    Returns:
        新闻列表，每个元素包含title, link, summary, published
    """
    news_items = []
    
    for feed_url in RSS_FEEDS:
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries:
                news_item = {
                    "title": entry.title,
                    "link": entry.link,
                    "summary": entry.get("summary", ""),
                    "published": entry.get("published", ""),
                }
                news_items.append(news_item)
        except Exception as e:
            print(f"Error fetching {feed_url}: {e}")
            continue
    
    # 按时间排序，返回最新的前N条
    # 这里简化处理，直接返回前N条
    return news_items[:max_items]


def format_news_message(news_items: List[Dict]) -> str:
    """将新闻格式化为易读的消息
    
    Args:
        news_items: 新闻列表
        
    Returns:
        格式化后的Markdown消息
    """
    today = datetime.now().strftime("%Y年%m月%d日")
    message = f"# 📈 今日A股财经早报 ({today})\n\n"
    
    for i, item in enumerate(news_items, 1):
        message += f"## {i}. [{item['title']}]({item['link']})\n"
        if item['summary']:
            # 去除HTML标签简化
            import re
            summary_clean = re.sub('<[^<]+?>', '', item['summary'])
            message += f"{summary_clean[:200]}...\n"
        message += "\n"
    
    message += "\n---\n每日早8点自动推送"
    return message