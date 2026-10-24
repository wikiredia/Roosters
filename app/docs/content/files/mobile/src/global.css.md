---
updated: 2026-10-24T12:55:00Z
---

The **design tokens** as a Tailwind v4 theme for Uniwind: fonts, type scale, colours (light and dark with the same names), radii. Names map 1:1 to classes: `--color-together` gives `bg-together` and `text-together`. Source: `app/design/claude-design/tokens.css`. Components read some tokens in JS with `useCSSVariable`.

Lesson kinds each have a colour pair (`--color-<kind>` for the border, `--color-<kind>-soft` for the fill): theory
(blue), lab (teal), exercises (violet), project (orange), support (sky), internship (brown), info (slate), other
(neutral); exams are ink. They stay clear of the together yellow, the friend pink and the danger red.

A shared break that's **planned** has a darker edge (`--color-together-edge`: brown in light, cream in dark, so it
always differs from an open one), and one you **asked** for has faint lines (`--color-together-line`, dimmer in dark).
A class you skip is grey (`--color-skip`).
