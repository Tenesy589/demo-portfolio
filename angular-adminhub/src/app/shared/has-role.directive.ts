import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { Role } from '../core/models';

/** Structural directive: `<button *appHasRole="'admin'">` — rendered only for that role or higher. */
@Directive({ selector: '[appHasRole]' })
export class HasRoleDirective {
  readonly appHasRole = input.required<Role>();
  private readonly auth = inject(AuthService);
  private readonly tpl = inject(TemplateRef);
  private readonly vcr = inject(ViewContainerRef);
  private shown = false;

  constructor() {
    effect(() => {
      const allowed = this.auth.hasRole(this.appHasRole());
      if (allowed && !this.shown) this.vcr.createEmbeddedView(this.tpl);
      if (!allowed && this.shown) this.vcr.clear();
      this.shown = allowed;
    });
  }
}
