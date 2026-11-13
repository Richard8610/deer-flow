---
name: pptx-report
description: Use this skill when the user wants a research or briefing deck as an editable PowerPoint (.pptx) with real text, bullets and tables, for example "make it a PPT" after a research task. Unlike ppt-generation it makes no slide images and needs no image model, so the user can edit every word.
---

# Editable PPTX Report

Turns a JSON outline into a `.pptx` with python-pptx. Use `ppt-generation` instead when the user wants image-heavy, designed slides.

## Workflow

1. Finish the research first (load `deep-research` for web questions). Keep the source URLs.
2. Write the outline JSON to `/mnt/user-data/workspace/outline.json`.
3. Build the deck:

   ```bash
   python /mnt/skills/public/pptx-report/scripts/generate.py \
     --outline /mnt/user-data/workspace/outline.json \
     --output /mnt/user-data/outputs/<topic>.pptx
   ```

4. If the script exits non-zero, read stderr, fix the outline and run it again. Do not tell the user the deck exists until it printed the output path.
5. Present the file. To mail it, load `email-send`.

## Outline format

```json
{
  "title": "AI Industry Trends 2026",
  "subtitle": "Briefing for the strategy team",
  "author": "optional",
  "date": "2026-11-13",
  "slides": [
    {"type": "bullets", "title": "Key takeaways", "bullets": ["...", "..."], "notes": "speaker notes"},
    {"type": "section", "title": "Models and compute"},
    {"type": "two-column", "title": "Open vs closed models", "left": ["..."], "right": ["..."]},
    {"type": "table", "title": "Major players", "columns": ["Company", "Move", "Why it matters"], "rows": [["A", "B", "C"]]},
    {"type": "sources", "title": "Sources", "bullets": ["Title, publisher, URL"]}
  ]
}
```

Slide types: `bullets`, `section` (optional `bullets` as a one-line subtitle), `two-column`, `table`, `sources`.

## Limits the script enforces

At most 40 slides; 8 bullets per list, 160 characters each; titles 80 characters; tables 1 to 6 columns and 1 to 10 rows, every row as long as the heading row. Split a slide rather than shrinking text.

## Writing guidance

- One idea per slide; the title states the conclusion ("Inference cost fell about 10x in two years"), not the topic.
- Every number or claim from research names its source on a `sources` slide near the end. Do not state a figure you did not find.
- 8 to 14 slides for a briefing: summary first, 3 to 5 themes, risks or open questions, sources.
- Write the deck in the language the user wrote in.
- The deck is built from text only. State in the reply that it has no charts or images, so the user does not expect them.
