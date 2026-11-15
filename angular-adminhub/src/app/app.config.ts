import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { PreloadAllModules, provideRouter, withComponentInputBinding, withPreloading, withViewTransitions } from '@angular/router';
import { authInterceptor, errorInterceptor } from './core/interceptors';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(), // no zone.js: change detection driven purely by signals
    provideRouter(routes, withComponentInputBinding(), withPreloading(PreloadAllModules), withViewTransitions()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor])),
  ],
};
