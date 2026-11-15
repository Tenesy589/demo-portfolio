import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay, switchMap, takeWhile, timer } from 'rxjs';
import {
  AtRisk, Breakdown, ChurnPrediction, Cohorts, Customer, CustomerInput, CustomerQuery, Forecast, Kpis, ModelInfo, MonthlyRevenue, Page, Role, TaskStatus, User,
} from './models';

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);

  list(query: CustomerQuery): Observable<Page<Customer>> {
    const params = new HttpParams({ fromObject: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v != null)) as Record<string, string> });
    return this.http.get<Page<Customer>>('/api/customers', { params });
  }
  get = (id: number) => this.http.get<Customer>(`/api/customers/${id}`);
  orders = (id: number) => this.http.get<{ id: number; product: string; amount: number; created_at: string }[]>(`/api/customers/${id}/orders`, { params: { limit: 8 } });
  churn = (id: number) => this.http.get<ChurnPrediction>(`/api/customers/${id}/churn`);
  create = (body: CustomerInput) => this.http.post<Customer>('/api/customers', body);
  update = (id: number, body: Partial<CustomerInput>) => this.http.patch<Customer>(`/api/customers/${id}`, body);
  remove = (id: number) => this.http.delete<void>(`/api/customers/${id}`);
  atRisk = (limit = 8) => this.http.get<AtRisk[]>('/api/customers/at-risk', { params: { limit } });
}

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly http = inject(HttpClient);
  kpis = () => this.http.get<Kpis>('/api/analytics/kpis');
  monthly = () => this.http.get<MonthlyRevenue[]>('/api/analytics/revenue/monthly');
  breakdown = (by: 'region' | 'product' | 'segment') => this.http.get<Breakdown[]>('/api/analytics/revenue/breakdown', { params: { by } });
  forecast = (horizon = 6) => this.http.get<Forecast>('/api/analytics/forecast', { params: { horizon } });
  cohorts = (months = 12) => this.http.get<Cohorts>('/api/analytics/cohorts', { params: { months } });
}

@Injectable({ providedIn: 'root' })
export class MlApi {
  private readonly http = inject(HttpClient);
  model = () => this.http.get<ModelInfo>('/api/ml/churn/model');
  predict = (features: object) => this.http.post<ChurnPrediction>('/api/ml/churn/predict', features);

  /**
   * Starts training and returns a stream of progress updates:
   * poll every 700 ms, stop (inclusive) on a terminal state.
   */
  train(): Observable<TaskStatus> {
    return this.http.post<{ task_id: string }>('/api/ml/churn/train', {}).pipe(
      switchMap(({ task_id }) => timer(0, 700).pipe(switchMap(() => this.http.get<TaskStatus>(`/api/tasks/${task_id}`)))),
      takeWhile((s) => s.state !== 'SUCCESS' && s.state !== 'FAILURE', true),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);
  list = () => this.http.get<User[]>('/api/auth/users');
  setRole = (id: number, role: Role) => this.http.patch<User>(`/api/auth/users/${id}/role`, { role }).pipe(map((u) => u));
}
