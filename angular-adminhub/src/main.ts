import { registerLocaleData } from '@angular/common';
import localeUk from '@angular/common/locales/uk';
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

// Number/currency/date pipes need CLDR data for every non-default locale.
registerLocaleData(localeUk);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
