import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../api.service';

@Component({
  selector: 'app-operations-command-center',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './operations-command-center.html',
  styleUrl: './operations-command-center.css'
})
export class OperationsCommandCenterComponent implements OnInit {
  private readonly api = inject(ApiService);

  tenantId = '';
  entityId = '';
  entityName = 'Entity';
  loading = true;
  error = '';
  invoices: any[] = [];
  exceptions: any[] = [];
  approvals: any[] = [];
  activity: any[] = [];
  summary: any = {};

  ngOnInit(): void {
    const params = new URLSearchParams(window.location.search);
    this.entityId = params.get('entityId') || '';
    this.entityName = params.get('entityName') || 'Entity';
    this.tenantId = params.get('tenantId') || localStorage.getItem('lx_tenant_id') || '';

    if (this.tenantId) {
      this.loadData();
      return;
    }

    this.api.getTenant().subscribe({
      next: (response: any) => {
        this.tenantId = response.data?.[0]?.id || '';
        if (this.tenantId) {
          localStorage.setItem('lx_tenant_id', this.tenantId);
          this.loadData();
        } else {
          this.loading = false;
          this.error = 'No tenant context was found.';
        }
      },
      error: () => {
        this.loading = false;
        this.error = 'The tenant context could not be loaded.';
      }
    });
  }

  loadData(): void {
    if (!this.tenantId || !this.entityId) {
      this.loading = false;
      this.error = 'Select an entity to view its operations.';
      return;
    }

    this.loading = true;
    this.error = '';
    forkJoin({
      dashboard: this.api.getEntityDashboard(this.tenantId, this.entityId).pipe(catchError(() => of({}))),
      summary: this.api.getMatchSummary(this.tenantId, this.entityId).pipe(catchError(() => of({}))),
      invoices: this.api.getEntityInvoices(this.tenantId, this.entityId).pipe(catchError(() => of({ data: [] }))),
      exceptions: this.api.getEntityExceptions(this.tenantId, this.entityId).pipe(catchError(() => of({ data: [] }))),
      approvals: this.api.getApprovals(this.tenantId, this.entityId, 'pending').pipe(catchError(() => of({ data: [] }))),
      activity: this.api.getEntityAuditEvents(this.tenantId, this.entityId, { limit: '8' }).pipe(catchError(() => of({ data: [] })))
    }).subscribe({
      next: (response: any) => {
        this.entityName = response.dashboard?.entity?.name || this.entityName;
        this.summary = response.summary?.data || response.summary || {};
        this.invoices = response.invoices?.data || [];
        this.exceptions = response.exceptions?.data || [];
        this.approvals = response.approvals?.data || [];
        this.activity = response.activity?.data || [];
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = 'Operational data could not be loaded.';
      }
    });
  }

  link(path: string): string {
    const query = new URLSearchParams({
      entityId: this.entityId,
      entityName: this.entityName,
      tenantId: this.tenantId
    });
    return `${path}?${query.toString()}`;
  }

  invoiceState(invoice: any): string {
    const state = String(invoice.match_status || invoice.status || 'pending').toLowerCase();
    if (state === 'matched' || state === 'approved' || state === 'paid') return 'Touchless';
    if (state === 'partial' || state === 'partially_matched' || state === 'under_review') return 'Review';
    if (state === 'disputed' || state === 'unmatched' || state === 'rejected') return 'Blocked';
    return 'Processing';
  }

  invoiceStateClass(invoice: any): string {
    const state = this.invoiceState(invoice);
    return state === 'Touchless' ? 'success' : state === 'Blocked' ? 'danger' : state === 'Review' ? 'warning' : 'info';
  }

  gateClass(invoice: any, gate: string): string {
    const state = String(invoice.match_status || invoice.status || 'pending').toLowerCase();
    if (gate === 'match') {
      if (state === 'matched' || state === 'approved' || state === 'paid') return 'pass';
      if (state === 'partial' || state === 'partially_matched' || state === 'under_review') return 'warn';
      if (state === 'unmatched' || state === 'disputed' || state === 'rejected') return 'fail';
    }
    if (gate === 'document' && invoice.invoice_key) return 'pass';
    return 'skip';
  }

  formatAmount(value: unknown): string {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount === 0) return '$';
    return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  formatDate(value: unknown): string {
    if (!value) return '—';
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  exceptionCount(): number {
    return this.exceptions.filter((item) => !['resolved', 'closed'].includes(String(item.status).toLowerCase())).length;
  }

  holdValue(): number {
    return this.exceptions
      .filter((item) => !['resolved', 'closed'].includes(String(item.status).toLowerCase()))
      .reduce((total, item) => total + Number(item.amount_num || 0), 0);
  }

  touchlessRate(): string {
    const value = this.summary.touchless_rate_pct ?? this.summary.auto_match_rate_pct;
    return value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`;
  }

  activityLabel(item: any): string {
    return String(item.action || item.event_type || 'Activity').replace(/[._]/g, ' ');
  }
}
