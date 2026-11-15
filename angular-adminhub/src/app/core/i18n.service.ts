import { Injectable, Pipe, PipeTransform, computed, inject, signal } from '@angular/core';

import { DICT, LOCALES, Lang } from './i18n.dict';

export type { Lang };

/** Runtime i18n with signals: switching language re-renders instantly, no reload or per-locale builds. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(this.restore());
  readonly locale = computed(() => LOCALES[this.lang()]);
  readonly langs: Lang[] = ['ru', 'uk', 'en'];

  setLang(lang: Lang) {
    localStorage.setItem('adminhub.lang', lang);
    document.documentElement.lang = lang;
    this.lang.set(lang);
  }

  t(key: string): string {
    return DICT[this.lang()][key] ?? DICT.en[key] ?? key;
  }

  private restore(): Lang {
    const saved = localStorage.getItem('adminhub.lang') as Lang | null;
    return saved && saved in DICT ? saved : 'ru';
  }
}

/** Impure on purpose: it reads a signal, so it must re-evaluate when the language changes. */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(key: string): string {
    return this.i18n.t(key);
  }
}
