import json
import sys
from pathlib import Path

import pytest
from pptx import Presentation

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skill_loader import load  # noqa: E402

gen = load("pptx-report")

OUTLINE = {
    "title": "AI 行业趋势",
    "subtitle": "简报",
    "slides": [
        {"type": "bullets", "title": "要点", "bullets": ["一", "二"], "notes": "讲稿"},
        {"type": "section", "title": "模型"},
        {"type": "two-column", "title": "对比", "left": ["a"], "right": ["b"]},
        {"type": "table", "title": "玩家", "columns": ["公司", "动作"], "rows": [["A", "B"], ["C", "D"]]},
        {"type": "sources", "title": "来源", "bullets": ["x, https://example.com"]},
    ],
}


def test_builds_an_editable_deck(tmp_path):
    out = gen.build(OUTLINE, tmp_path / "d.pptx")
    prs = Presentation(out)
    assert len(prs.slides) == 6                                   # title slide + five
    assert prs.slides[0].shapes.title.text_frame.text == "AI 行业趋势"
    assert prs.slides[1].placeholders[1].text_frame.text == "一\n二"
    assert prs.slides[1].notes_slide.notes_text_frame.text == "讲稿"
    table = next(s for s in prs.slides[4].shapes if s.has_table).table
    assert [c.text for c in table.rows[0].cells] == ["公司", "动作"]
    assert table.cell(2, 1).text == "D"


@pytest.mark.parametrize("change,message", [
    (lambda o: o.pop("title"), "title"),
    (lambda o: o.update(slides=[]), "slides"),
    (lambda o: o["slides"][0].update(type="chart"), "slides[1].type"),
    (lambda o: o["slides"][0].update(bullets=["x"] * 9), "limit is 8"),
    (lambda o: o["slides"][0].update(bullets=["x" * 161]), "limit is 160"),
    (lambda o: o["slides"][3].update(rows=[["only one"]]), "rows[0]"),
    (lambda o: o["slides"][0].update(notes=5), "notes"),
])
def test_rejects_an_invalid_outline(change, message):
    outline = json.loads(json.dumps(OUTLINE))
    change(outline)
    with pytest.raises(gen.OutlineError, match=message.replace("[", r"\[").replace("]", r"\]")):
        gen.validate(outline)


def test_cli_exit_codes(tmp_path, capsys):
    src, out = tmp_path / "o.json", tmp_path / "out" / "d.pptx"
    src.write_text(json.dumps(OUTLINE), encoding="utf-8-sig")     # a BOM must not break loading
    assert gen.main(["--outline", str(src), "--output", str(out)]) == 0
    assert capsys.readouterr().out.strip() == str(out) and out.is_file()
    src.write_text("{not json")
    assert gen.main(["--outline", str(src), "--output", str(out)]) == 1
    assert "error:" in capsys.readouterr().err
    assert gen.main(["--outline", str(tmp_path / "missing.json"), "--output", str(out)]) == 1
