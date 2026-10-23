---
updated: 2026-10-23T17:30:00Z
---

The docs as **Markdown in the repo** (`app/docs/content/`) and back:
`hub.md`, `guides/<slug>.md` (front matter: title, position, updated) and `files/<path>.md` (front matter:
updated; the file text; then one `## \`symbol\`` section per symbol or group).

This is how agents without access to the live service document their changes: edit these files in the
same commit, with `updated` set to now, and the service imports them (newer wins).

## `SYMBOL_HEADING`

A heading that is one or more backticked names: `## \`a\`` or `## \`a\`, \`b\``.

## `_front`, `_meta`

Read and write the `---` front matter.

## `export_tree`

The live entries in the same format, ready to write to disk.

## `parse_file_doc`

Split a file doc into its front matter, file text and symbol sections.

## `read_tree`

Every entry in the content folder (pages, file docs, symbol docs).
