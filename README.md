# Study Desk

A single-page study companion that runs as a [claude.ai](https://claude.ai) Artifact. You keep a list of concepts from
your courses: things you missed, things you are learning for the first time, problem sets, recitations, papers.
Each concept has a saved explanation and its own chat with Claude, grounded in your own course material.

- **Sections** per course, with drag-and-drop to reorder concepts or move them between sections, and rename.
- **Status** per concept: New, Shaky, Got it, with a filter.
- **Explain / Concise / Regenerate** writes a saved explanation (intuition first, then the in-depth treatment, every
  equation explained in words). Quick buttons: Simpler, More rigorous, Worked example, Quiz me.
- **Course material**: attach lecture slides (by slide range) to a concept; Claude can also open other slides itself
  with a `read_slides` tool.
- **Plots** inside answers: Claude writes a small JSON `plot` block; the page draws it, with a slider and Play for a
  parameter.
- **Requests queue**: ask in several concepts at once; they run one after another.
- **PDFs open in Margin Questions (a separate project)**, published next to this page as
  `reader.html`, so you can ask about a passage of the original slides or paper.

## Files

- `index.html` – the page.
- `lib.js` – its pure logic (prompt building, slide slicing, plot sampling, chat storage); `node --test lib.test.mjs`.
- `tools/clean-check.sh`, `tools/pre-push` – nothing personal goes into this repository
  (`ln -s ../../tools/pre-push .git/hooks/pre-push`).

## What you publish next to it

The page reads, by relative path:

- `materials/index.json` – `{ "files": [{ "id", "course", "title", "pdf"?, "sections": [{ "n", "title", "page"? }] }] }`
- `materials/<id>.md` – each lecture as Markdown + LaTeX, one `## Slide N — title` section per printed slide.
- `materials/<id>.pdf` – the original PDF (optional), opened in `reader.html`.
- `animations/*.mp4` – optional videos attached to a concept.

Course material is not part of this repository: convert your own.

## Capabilities

`db` (concepts in `concepts/{id}`, chats in `concepts/{id}/chat/…`), `sample` (Claude, with images), and for the
Margin Questions reader also `user`, `assets`, `downloads`.

## License

MIT.
