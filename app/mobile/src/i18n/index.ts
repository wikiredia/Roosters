import { getLocales } from 'expo-localization';

import { setApiLanguage } from '@/lib/api';
import { prefs } from '@/lib/storage';
import { createStore } from '@/lib/store';

import { en, enOne } from './en';
import { nl, nlOne, type Key } from './nl';

export type Lang = 'nl' | 'en';
export type LangPref = 'system' | Lang;

const dicts: Record<Lang, Record<Key, string>> = { nl, en };
const ones: Record<Lang, Partial<Record<`${Key}.one`, string>>> = { nl: nlOne, en: enOne };

function systemLang(): Lang {
  const code = getLocales()[0]?.languageCode ?? 'nl';
  // Dutch for Dutch speakers; English for everyone else (international students)
  return code === 'nl' ? 'nl' : 'en';
}

export const langPref = createStore<LangPref>('system');
export const lang = createStore<Lang>(systemLang());

function apply(pref: LangPref) {
  const l = pref === 'system' ? systemLang() : pref;
  lang.set(l);
  setApiLanguage(l);
}

export async function loadLanguage() {
  const pref = await prefs.get<LangPref>('lang', 'system');
  langPref.set(pref);
  apply(pref);
}

export async function setLanguage(pref: LangPref) {
  langPref.set(pref);
  apply(pref);
  await prefs.set('lang', pref);
}

export function systemLanguage(): Lang {
  return systemLang();
}

export type Params = Record<string, string | number>;

export function translate(l: Lang, key: Key, params?: Params): string {
  // "1 klas" / "2 klassen": an optional '<key>.one' text for n = 1
  const one = params?.n === 1 ? (ones[l] as Record<string, string>)[`${key}.one`] : undefined;
  let s = one ?? dicts[l][key] ?? nl[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** t('today.title') in the current language; re-renders when the language changes. */
export function useT() {
  const l = lang.use();
  const t = (key: Key, params?: Params) => translate(l, key, params);
  return { t, lang: l };
}

export type { Key };
