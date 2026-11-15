export type Role = 'admin' | 'manager' | 'viewer';
export type Segment = 'SMB' | 'MidMarket' | 'Enterprise';
export type CustomerStatus = 'lead' | 'active' | 'churned';
export type Plan = 'basic' | 'pro' | 'enterprise';
export const REGIONS = ['Europe', 'North America', 'Asia', 'LATAM', 'Africa'] as const;
export type Region = (typeof REGIONS)[number];

export interface User { id: number; email: string; name: string; role: Role }
export interface Session { access_token: string; user: User }

export interface Contact { name: string; email: string; phone: string | null; role: string | null }

export interface Customer {
  id: number;
  name: string;
  email: string;
  company: string;
  region: Region;
  segment: Segment;
  status: CustomerStatus;
  plan: Plan;
  monthly_spend: number;
  tenure_months: number;
  support_tickets: number;
  last_login_days: number;
  nps: number;
  contacts: Contact[];
  created_at: string;
}
export type CustomerInput = Omit<Customer, 'id' | 'created_at'>;

export interface Page<T> { items: T[]; total: number; page: number; size: number }

export interface CustomerQuery {
  q?: string;
  region?: string;
  segment?: string;
  status?: string;
  sort: string;
  page: number;
  size: number;
}

export interface Kpis {
  revenue_total: number;
  revenue_last_month: number;
  revenue_growth_pct: number | null;
  orders: number;
  avg_order_value: number;
  active_customers: number;
  churn_rate_pct: number;
}

export interface MonthlyRevenue { month: string; revenue: number; orders: number; customers: number; rolling_avg_3m: number }
export interface Breakdown { name: string; revenue: number; orders: number; share_pct: number }
export interface Forecast {
  history: { month: string; revenue: number }[];
  forecast: { month: string; revenue: number; low: number; high: number }[];
  r2: number;
}
export interface Cohorts { cohorts: string[]; ages: number[]; sizes: number[]; matrix: (number | null)[][] }

export interface Driver { feature: string; value: number; typical: number; impact: number }
export interface ChurnPrediction { customer_id?: number; probability: number; risk: 'low' | 'medium' | 'high'; drivers: Driver[] }
export interface AtRisk { customer_id: number; name: string; company: string; monthly_spend: number; probability: number; risk: 'low' | 'medium' | 'high' }
export interface ModelInfo {
  model: string;
  cv_roc_auc: Record<string, number>;
  test_roc_auc: number;
  precision: number;
  recall: number;
  train_size: number;
  test_size: number;
  churn_rate: number;
  trained_at: string;
}
export interface TaskStatus {
  task_id: string;
  state: 'PENDING' | 'STARTED' | 'PROGRESS' | 'SUCCESS' | 'FAILURE';
  progress: { percent: number; step: string } | null;
  result: ModelInfo | null;
  error: string | null;
}
