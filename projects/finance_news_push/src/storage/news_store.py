"""保存输出结果到本地存储"""
from __future__ import annotations
from datetime import datetime
from pathlib import Path
from typing import Optional

def save_output(content: str, name: str, output_dir: Optional[Path] = None) -> Optional[Path]:
    """保存输出到文件
    
    Args:
        content: 要保存的内容
        name: 文件名前缀
        output_dir: 输出目录
        
    Returns:
        保存成功返回路径，失败返回None
    """
    try:
        if output_dir is None:
            from deerflow.config.paths import get_paths
            output_dir = get_paths().base_dir / "projects" / "finance_news_push"
        output_dir.mkdir(parents=True, exist_ok=True)
        date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = output_dir / f"{name}_{date_str}.md"
        path.write_text(content, encoding="utf-8")
        return path
    except Exception as e:
        print(f"Error saving output: {e}")
        return None