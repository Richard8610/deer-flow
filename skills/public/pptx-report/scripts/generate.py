"""Build an editable .pptx (real text, bullets and tables, no slide images) from a JSON outline.

Usage: python generate.py --outline outline.json --output deck.pptx
Exits non-zero with the reason on stderr when the outline is invalid; prints the output path on stdout.
"""
import argparse
import json
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

MAX_SLIDES = 40
MAX_BULLETS = 8
MAX_BULLET_CHARS = 160
MAX_TITLE_CHARS = 80
TYPES = ("bullets", "section", "two-column", "table", "sources")
ACCENT = RGBColor(0x1F, 0x4E, 0x79)
BODY = RGBColor(0x26, 0x26, 0x26)
CJK_FONT = "Microsoft YaHei"
LATIN_FONT = "Calibri"

# layout indexes in python-pptx's default template
L_TITLE, L_CONTENT, L_SECTION, L_TWO, L_TITLE_ONLY = 0, 1, 2, 3, 5


class OutlineError(ValueError):
    pass


def _text(value, field, limit):
    if not isinstance(value, str) or not value.strip():
        raise OutlineError(f"{field} must be a non-empty string")
    if len(value) > limit:
        raise OutlineError(f"{field} is {len(value)} characters; the limit is {limit}")
    return value.strip()


def _bullets(value, field):
    if not isinstance(value, list) or not value:
        raise OutlineError(f"{field} must be a non-empty list")
    if len(value) > MAX_BULLETS:
        raise OutlineError(f"{field} has {len(value)} items; the limit is {MAX_BULLETS} (split the slide)")
    return [_text(v, f"{field}[{i}]", MAX_BULLET_CHARS) for i, v in enumerate(value)]


def validate(outline):
    """Return the outline unchanged or raise OutlineError naming the first problem."""
    if not isinstance(outline, dict):
        raise OutlineError("the outline must be a JSON object")
    _text(outline.get("title"), "title", MAX_TITLE_CHARS)
    slides = outline.get("slides")
    if not isinstance(slides, list) or not slides:
        raise OutlineError("slides must be a non-empty list")
    if len(slides) > MAX_SLIDES:
        raise OutlineError(f"{len(slides)} slides; the limit is {MAX_SLIDES}")
    for i, s in enumerate(slides, 1):
        where = f"slides[{i}]"
        if not isinstance(s, dict) or s.get("type") not in TYPES:
            raise OutlineError(f"{where}.type must be one of {', '.join(TYPES)}")
        _text(s.get("title"), f"{where}.title", MAX_TITLE_CHARS)
        kind = s["type"]
        if kind in ("bullets", "sources"):
            _bullets(s.get("bullets"), f"{where}.bullets")
        elif kind == "two-column":
            _bullets(s.get("left"), f"{where}.left")
            _bullets(s.get("right"), f"{where}.right")
        elif kind == "table":
            cols, rows = s.get("columns"), s.get("rows")
            if not isinstance(cols, list) or not 1 <= len(cols) <= 6:
                raise OutlineError(f"{where}.columns must be a list of 1 to 6 headings")
            if not isinstance(rows, list) or not 1 <= len(rows) <= 10:
                raise OutlineError(f"{where}.rows must be a list of 1 to 10 rows")
            for r, row in enumerate(rows):
                if not isinstance(row, list) or len(row) != len(cols):
                    raise OutlineError(f"{where}.rows[{r}] must have {len(cols)} cells")
        if "notes" in s and not isinstance(s["notes"], str):
            raise OutlineError(f"{where}.notes must be a string")
    return outline


def _font(run, size, bold=False, color=BODY):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    run.font.name = LATIN_FONT
    rpr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:cs"):                      # Chinese text falls back to a system font without this
        el = rpr.find(qn(tag))
        if el is None:
            el = rpr.makeelement(qn(tag), {})
            rpr.append(el)
        el.set("typeface", CJK_FONT)


def _set_title(slide, text, size=32):
    tf = slide.shapes.title.text_frame
    tf.text = text
    tf.word_wrap = True
    for p in tf.paragraphs:
        for r in p.runs:
            _font(r, size, bold=True, color=ACCENT)


def _fill(placeholder, items):
    tf = placeholder.text_frame
    tf.word_wrap = True
    size = 22 if len(items) <= 5 else 18
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        r = p.add_run()
        r.text = item
        _font(r, size)
        p.space_after = Pt(8)


def _table(slide, columns, rows):
    left, top, width = Inches(0.8), Inches(1.9), Inches(11.7)
    height = Inches(0.5) * (len(rows) + 1)
    table = slide.shapes.add_table(len(rows) + 1, len(columns), left, top, width, height).table
    for c, heading in enumerate(columns):
        cell = table.cell(0, c)
        cell.text = str(heading)
        for r in cell.text_frame.paragraphs[0].runs:
            _font(r, 16, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))
    for ri, row in enumerate(rows, 1):
        for c, value in enumerate(row):
            cell = table.cell(ri, c)
            cell.text = str(value)
            for r in cell.text_frame.paragraphs[0].runs:
                _font(r, 14)


def build(outline, output):
    validate(outline)
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)

    first = prs.slides.add_slide(prs.slide_layouts[L_TITLE])
    _set_title(first, outline["title"].strip(), 40)
    subtitle = " · ".join(x for x in (outline.get("subtitle"), outline.get("author"), outline.get("date")) if x)
    if subtitle:
        first.placeholders[1].text_frame.text = subtitle
        for r in first.placeholders[1].text_frame.paragraphs[0].runs:
            _font(r, 20)
    else:
        first.placeholders[1]._element.getparent().remove(first.placeholders[1]._element)

    for s in outline["slides"]:
        kind = s["type"]
        if kind in ("bullets", "sources"):
            slide = prs.slides.add_slide(prs.slide_layouts[L_CONTENT])
            _set_title(slide, s["title"].strip())
            _fill(slide.placeholders[1], s["bullets"])
        elif kind == "section":
            slide = prs.slides.add_slide(prs.slide_layouts[L_SECTION])
            _set_title(slide, s["title"].strip(), 36)
            body = [p for p in slide.placeholders if p.placeholder_format.idx == 1]
            if s.get("bullets"):
                _fill(body[0], _bullets(s["bullets"], "bullets"))
            elif body:
                body[0]._element.getparent().remove(body[0]._element)
        elif kind == "two-column":
            slide = prs.slides.add_slide(prs.slide_layouts[L_TWO])
            _set_title(slide, s["title"].strip())
            _fill(slide.placeholders[1], s["left"])
            _fill(slide.placeholders[2], s["right"])
        else:
            slide = prs.slides.add_slide(prs.slide_layouts[L_TITLE_ONLY])
            _set_title(slide, s["title"].strip())
            _table(slide, s["columns"], s["rows"])
        if s.get("notes"):
            slide.notes_slide.notes_text_frame.text = s["notes"]

    out = Path(output)
    out.parent.mkdir(parents=True, exist_ok=True)
    prs.save(out)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--outline", required=True, help="path to the outline JSON")
    ap.add_argument("--output", required=True, help="path of the .pptx to write")
    args = ap.parse_args(argv)
    try:
        outline = json.loads(Path(args.outline).read_text(encoding="utf-8-sig"))
        out = build(outline, args.output)
    except (OSError, json.JSONDecodeError, OutlineError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
