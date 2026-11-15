import { Injectable, Pipe, PipeTransform, computed, inject, signal } from '@angular/core';

export type Lang = 'uk' | 'en';

const DICT: Record<Lang, Record<string, string>> = {
  en: {
    'nav.dashboard': 'Dashboard', 'nav.customers': 'Customers', 'nav.ml': 'Churn AI', 'nav.users': 'Users', 'nav.logout': 'Log out',
    'login.title': 'Sign in to AdminHub', 'login.email': 'Email', 'login.password': 'Password', 'login.submit': 'Sign in', 'login.invalid': 'Invalid email or password',
    'dash.revenue': 'Total revenue', 'dash.lastMonth': 'Last month', 'dash.aov': 'Avg. order', 'dash.active': 'Active customers', 'dash.churn': 'Churn rate',
    'dash.trend': 'Revenue & 6-month forecast', 'dash.byRegion': 'Revenue by region', 'dash.byProduct': 'Revenue by product', 'dash.cohorts': 'Retention cohorts (%)', 'dash.atRisk': 'Customers at risk',
    'cust.search': 'Search name, company, email…', 'cust.all': 'All', 'cust.new': 'New customer', 'cust.region': 'Region', 'cust.segment': 'Segment', 'cust.status': 'Status',
    'cust.name': 'Name', 'cust.company': 'Company', 'cust.spend': 'Monthly spend', 'cust.tenure': 'Tenure (mo.)', 'cust.empty': 'No customers match your filters',
    'cust.orders': 'Recent orders', 'cust.risk': 'Churn risk', 'cust.drivers': 'Why?', 'cust.edit': 'Edit', 'cust.delete': 'Delete', 'cust.confirmDelete': 'Delete this customer permanently?',
    'form.basic': 'Basic info', 'form.business': 'Business', 'form.health': 'Account health', 'form.contacts': 'Contacts', 'form.addContact': 'Add contact', 'form.save': 'Save', 'form.cancel': 'Cancel',
    'form.saved': 'Saved', 'form.unsaved': 'You have unsaved changes. Leave anyway?', 'form.required': 'Required', 'form.email': 'Invalid email', 'form.min': 'Too small', 'form.max': 'Too large',
    'form.minlength': 'Too short', 'form.pattern': 'Invalid format', 'form.spendPlan': 'Enterprise plan requires spend ≥ 1000', 'form.duplicateEmail': 'Duplicate contact email',
    'ml.model': 'Current model', 'ml.train': 'Retrain model', 'ml.training': 'Training…', 'ml.whatIf': 'What-if simulator', 'ml.whatIfHint': 'Move the sliders — prediction updates live',
    'ml.probability': 'Churn probability', 'ml.trained': 'Model retrained', 'users.role': 'Role', 'users.updated': 'Role updated',
    'errors.sessionExpired': 'Session expired — please sign in again', 'errors.forbidden': 'You do not have permission for this action', 'errors.server': 'Server unavailable, try again later',
  },
  uk: {
    'nav.dashboard': 'Дашборд', 'nav.customers': 'Клієнти', 'nav.ml': 'Churn AI', 'nav.users': 'Користувачі', 'nav.logout': 'Вийти',
    'login.title': 'Вхід в AdminHub', 'login.email': 'Email', 'login.password': 'Пароль', 'login.submit': 'Увійти', 'login.invalid': 'Невірний email або пароль',
    'dash.revenue': 'Загальний дохід', 'dash.lastMonth': 'Минулий місяць', 'dash.aov': 'Середній чек', 'dash.active': 'Активні клієнти', 'dash.churn': 'Відтік',
    'dash.trend': 'Дохід і прогноз на 6 міс.', 'dash.byRegion': 'Дохід за регіонами', 'dash.byProduct': 'Дохід за продуктами', 'dash.cohorts': 'Утримання когорт (%)', 'dash.atRisk': 'Клієнти під ризиком',
    'cust.search': 'Пошук: ім’я, компанія, email…', 'cust.all': 'Усі', 'cust.new': 'Новий клієнт', 'cust.region': 'Регіон', 'cust.segment': 'Сегмент', 'cust.status': 'Статус',
    'cust.name': 'Ім’я', 'cust.company': 'Компанія', 'cust.spend': 'Витрати / міс.', 'cust.tenure': 'Стаж (міс.)', 'cust.empty': 'Немає клієнтів за цими фільтрами',
    'cust.orders': 'Останні замовлення', 'cust.risk': 'Ризик відтоку', 'cust.drivers': 'Чому?', 'cust.edit': 'Редагувати', 'cust.delete': 'Видалити', 'cust.confirmDelete': 'Видалити клієнта назавжди?',
    'form.basic': 'Основне', 'form.business': 'Бізнес', 'form.health': 'Стан акаунта', 'form.contacts': 'Контакти', 'form.addContact': 'Додати контакт', 'form.save': 'Зберегти', 'form.cancel': 'Скасувати',
    'form.saved': 'Збережено', 'form.unsaved': 'Є незбережені зміни. Все одно вийти?', 'form.required': 'Обов’язкове поле', 'form.email': 'Невірний email', 'form.min': 'Замале значення', 'form.max': 'Завелике значення',
    'form.minlength': 'Закоротко', 'form.pattern': 'Невірний формат', 'form.spendPlan': 'План Enterprise потребує витрат ≥ 1000', 'form.duplicateEmail': 'Email контакту дублюється',
    'ml.model': 'Поточна модель', 'ml.train': 'Перенавчити модель', 'ml.training': 'Навчання…', 'ml.whatIf': 'Симулятор «що як»', 'ml.whatIfHint': 'Рухайте повзунки — прогноз оновлюється миттєво',
    'ml.probability': 'Ймовірність відтоку', 'ml.trained': 'Модель перенавчено', 'users.role': 'Роль', 'users.updated': 'Роль оновлено',
    'errors.sessionExpired': 'Сесія завершилась — увійдіть знову', 'errors.forbidden': 'Недостатньо прав для цієї дії', 'errors.server': 'Сервер недоступний, спробуйте пізніше',
  },
};

/** Runtime i18n with signals: switching language re-renders instantly, no reload or per-locale builds. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>((localStorage.getItem('adminhub.lang') as Lang) ?? 'uk');
  readonly locale = computed(() => (this.lang() === 'uk' ? 'uk' : 'en-US'));

  setLang(lang: Lang) {
    localStorage.setItem('adminhub.lang', lang);
    document.documentElement.lang = lang;
    this.lang.set(lang);
  }

  t(key: string): string {
    return DICT[this.lang()][key] ?? key;
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
