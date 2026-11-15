import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { AbstractControl, FormArray, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CustomersApi } from '../../core/api';
import { HasUnsavedChanges } from '../../core/guards';
import { I18nService, TranslatePipe } from '../../core/i18n.service';
import { Contact, CustomerInput, REGIONS } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { FieldErrorComponent } from '../../shared/ui';

/** Cross-field validator: business rule spanning two controls. */
const enterpriseMinSpend: ValidatorFn = (group: AbstractControl): ValidationErrors | null =>
  group.get('plan')?.value === 'enterprise' && group.get('monthly_spend')!.value < 1000 ? { spendPlan: true } : null;

/** FormArray validator: contact emails must be unique. */
const uniqueEmails: ValidatorFn = (arr: AbstractControl): ValidationErrors | null => {
  const emails = (arr.value as Contact[]).map((c) => c.email.toLowerCase()).filter(Boolean);
  return new Set(emails).size !== emails.length ? { duplicateEmail: true } : null;
};

@Component({
  selector: 'app-customer-form',
  imports: [ReactiveFormsModule, TranslatePipe, FieldErrorComponent, RouterLink],
  template: `
    <div class="page-head">
      <h1>{{ id() ? form.controls.name.value : ('cust.new' | t) }}</h1>
    </div>
    <form [formGroup]="form" (ngSubmit)="save()" class="form-grid">
      <fieldset class="card">
        <legend>{{ 'form.basic' | t }}</legend>
        <label>{{ 'cust.name' | t }} *<input formControlName="name" /><app-field-error [control]="form.controls.name" /></label>
        <label>Email *<input formControlName="email" type="email" /><app-field-error [control]="form.controls.email" /></label>
        <label>{{ 'cust.company' | t }} *<input formControlName="company" /><app-field-error [control]="form.controls.company" /></label>
        <label>{{ 'cust.region' | t }}
          <select formControlName="region">@for (r of regions; track r) { <option [value]="r">{{ r }}</option> }</select>
        </label>
      </fieldset>

      <fieldset class="card">
        <legend>{{ 'form.business' | t }}</legend>
        <label>{{ 'cust.segment' | t }}
          <select formControlName="segment">@for (s of ['SMB', 'MidMarket', 'Enterprise']; track s) { <option [value]="s">{{ s }}</option> }</select>
        </label>
        <label>{{ 'cust.status' | t }}
          <select formControlName="status">@for (s of ['lead', 'active', 'churned']; track s) { <option [value]="s">{{ 'status.' + s | t }}</option> }</select>
        </label>
        <label>{{ 'cust.plan' | t }}
          <select formControlName="plan">@for (p of ['basic', 'pro', 'enterprise']; track p) { <option [value]="p">{{ p }}</option> }</select>
        </label>
        <label>{{ 'cust.spend' | t }} ($)<input type="number" formControlName="monthly_spend" /><app-field-error [control]="form.controls.monthly_spend" /></label>
        @if (form.errors?.['spendPlan']) { <small class="error">{{ 'form.spendPlan' | t }}</small> }
      </fieldset>

      <fieldset class="card">
        <legend>{{ 'form.health' | t }}</legend>
        <label>{{ 'cust.tenure' | t }}<input type="number" formControlName="tenure_months" /><app-field-error [control]="form.controls.tenure_months" /></label>
        <label>{{ 'cust.tickets' | t }}<input type="number" formControlName="support_tickets" /></label>
        <label>{{ 'cust.lastLogin' | t }}<input type="number" formControlName="last_login_days" /></label>
        <label>{{ 'cust.nps' | t }}: {{ form.controls.nps.value }}<input type="range" min="0" max="10" formControlName="nps" /></label>
      </fieldset>

      <fieldset class="card span-all" formArrayName="contacts">
        <legend>{{ 'form.contacts' | t }} ({{ contacts.length }})</legend>
        @for (c of contacts.controls; track c; let i = $index) {
          <div class="contact-row" [formGroupName]="i">
            <label>{{ 'cust.name' | t }}<input formControlName="name" /><app-field-error [control]="c.controls.name" /></label>
            <label>Email<input formControlName="email" /><app-field-error [control]="c.controls.email" /></label>
            <label>{{ 'cust.phone' | t }}<input formControlName="phone" placeholder="+380 67 123 4567" /><app-field-error [control]="c.controls.phone" /></label>
            <label>{{ 'cust.role' | t }}<input formControlName="role" /></label>
            <button type="button" class="btn ghost sm" (click)="contacts.removeAt(i); form.markAsDirty()">✕</button>
          </div>
        }
        @if (contacts.errors?.['duplicateEmail']) { <small class="error">{{ 'form.duplicateEmail' | t }}</small> }
        <button type="button" class="btn ghost" (click)="addContact()" [disabled]="contacts.length >= 10">+ {{ 'form.addContact' | t }}</button>
      </fieldset>

      <div class="actions span-all">
        @if (serverError()) { <span class="error">{{ serverError() }}</span> }
        @else if (form.invalid && form.touched) { <span class="muted">{{ 'form.fixErrors' | t }}</span> }
        <a class="btn ghost" [routerLink]="id() ? ['/customers', id()] : ['/customers']">{{ 'form.cancel' | t }}</a>
        <button class="btn primary" [disabled]="form.invalid || saving()">{{ saving() ? '…' : ('form.save' | t) }}</button>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CustomerFormPage implements OnInit, HasUnsavedChanges {
  /** Bound from the route param via withComponentInputBinding(). */
  readonly id = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(CustomersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  readonly regions = REGIONS;
  readonly saving = signal(false);
  readonly serverError = signal<string | null>(null);

  /** Strictly typed reactive form — `form.value` is fully typed, no `any`. */
  readonly form = this.fb.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      company: ['', [Validators.required, Validators.minLength(2)]],
      region: this.fb.control<CustomerInput['region']>('Europe'),
      segment: this.fb.control<CustomerInput['segment']>('SMB'),
      status: this.fb.control<CustomerInput['status']>('lead'),
      plan: this.fb.control<CustomerInput['plan']>('basic'),
      monthly_spend: [0, [Validators.required, Validators.min(0), Validators.max(1_000_000)]],
      tenure_months: [0, [Validators.min(0), Validators.max(600)]],
      support_tickets: [0, [Validators.min(0)]],
      last_login_days: [0, [Validators.min(0)]],
      nps: [7],
      contacts: this.fb.array<ReturnType<CustomerFormPage['contactGroup']>>([], { validators: uniqueEmails }),
    },
    { validators: enterpriseMinSpend },
  );

  get contacts() {
    return this.form.controls.contacts as FormArray<ReturnType<CustomerFormPage['contactGroup']>>;
  }

  ngOnInit() {
    const id = this.id();
    if (!id) return this.addContact();
    this.api.get(+id).subscribe((c) => {
      c.contacts.forEach(() => this.contacts.push(this.contactGroup()));
      this.form.reset(c);
    });
  }

  contactGroup(c?: Partial<Contact>) {
    return this.fb.group({
      name: [c?.name ?? '', [Validators.required, Validators.minLength(2)]],
      email: [c?.email ?? '', [Validators.required, Validators.email]],
      phone: this.fb.control<string | null>(c?.phone ?? null, Validators.pattern(/^\+?[0-9 ()-]{7,20}$/)),
      role: this.fb.control<string | null>(c?.role ?? null),
    });
  }

  addContact() {
    this.contacts.push(this.contactGroup());
  }

  hasUnsavedChanges() {
    return this.form.dirty && !this.saving();
  }

  save() {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.saving.set(true);
    this.serverError.set(null);
    const body = this.form.getRawValue() as CustomerInput;
    const id = this.id();
    (id ? this.api.update(+id, body) : this.api.create(body)).pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (c) => {
        this.form.markAsPristine();
        this.toast.success(this.i18n.t('form.saved'));
        this.router.navigate(['/customers', c.id]);
      },
      error: (e) => this.serverError.set(typeof e.error?.detail === 'string' ? e.error.detail : 'Validation error'),
    });
  }
}
