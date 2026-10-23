---
updated: 2026-10-23T17:30:00Z
---

**Translations.** `useT()` gives `t('key', {params})` in the current language and re-renders when it changes.
Dutch for Dutch-speaking phones, English for everyone else, unless the user picked a language
(Settings → Language).

Adding text: add the key to `nl.ts` (the source of truth for keys), then to `en.ts`; the type check
fails until both have it.

## `Lang`, `LangPref`

nl / en, and the preference (system / nl / en).

## `Params`, `translate`

Fill `{name}` placeholders; an optional `<key>.one` text is used when `n` is 1.

## `langPref`, `lang`, `apply`

Stores for the preference and the language in use; `apply` also tells the API client.

## `loadLanguage`, `setLanguage`

Read at start; change and save.

## `systemLang`, `systemLanguage`

Dutch when the phone's first language is Dutch, else English.

## `useT`

The hook every screen uses.
