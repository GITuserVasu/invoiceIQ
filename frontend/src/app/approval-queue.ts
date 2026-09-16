import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ApiService } from './api.service';

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="approval-shell">
      <section class="approval-card">
        <h1>AP Approval Queue</h1>
        <p class="muted">Review invoice approval steps assigned to your role.</p>
        <p *ngIf="message" class="message">{{ message }}</p>
        <p *ngIf="!loading && !approvals.length" class="muted">No approval tasks are waiting.</p>
        <table *ngIf="approvals.length">
          <thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Level</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            <tr *ngFor="let item of approvals">
              <td>{{ item.invoice_number }}</td>
              <td>{{ item.vendor_name || 'Unknown vendor' }}</td>
              <td>{{ item.currency }} {{ item.total_amount | number:'1.2-2' }}</td>
              <td>{{ item.approval_level }} · {{ item.approver_role_key }}</td>
              <td>{{ item.status }}</td>
              <td class="actions" *ngIf="item.status === 'pending'">
                <button (click)="act(item, 'approve')">Approve</button>
                <button class="danger" (click)="act(item, 'reject')">Reject</button>
                <button class="secondary" (click)="act(item, 'escalate')">Escalate</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  `,
  styles: [`
    .approval-shell { min-height: 100vh; background: #f4f7fb; padding: 32px; font-family: Arial, sans-serif; }
    .approval-card { max-width: 1100px; margin: auto; background: white; border: 1px solid #dbe4ef; border-radius: 14px; padding: 28px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #e5ebf2; font-size: 13px; }
    button { border: 0; border-radius: 6px; padding: 8px 11px; margin-right: 6px; background: #0d7c97; color: white; cursor: pointer; }
    button.danger { background: #b94343; }
    button.secondary { background: #e8eef5; color: #334a63; }
    .actions { white-space: nowrap; }
    .muted { color: #71839a; }
    .message { color: #0d7c97; }
  `]
})
export class ApprovalQueueComponent {
  private readonly api = inject(ApiService);
  private readonly params = new URLSearchParams(window.location.search);
  readonly tenantId = this.params.get('tenantId') || localStorage.getItem('lx_tenant_id') || '';
  readonly entityId = this.params.get('entityId') || '';
  approvals: any[] = [];
  loading = true;
  message = '';

  constructor() {
    this.load();
  }

  act(item: any, action: 'approve' | 'reject' | 'escalate'): void {
    this.loading = true;
    this.api.actOnApproval(this.tenantId, this.entityId, item.invoice_id, item.id, action).subscribe({
      next: () => {
        this.message = `Invoice ${item.invoice_number} ${action}d.`;
        this.load();
      },
      error: (error) => {
        this.message = error?.error?.error || 'Approval action failed.';
        this.loading = false;
      }
    });
  }

  private load(): void {
    if (!this.tenantId || !this.entityId) {
      this.loading = false;
      return;
    }
    this.api.getApprovals(this.tenantId, this.entityId, 'pending').subscribe({
      next: (response) => {
        this.approvals = response.data || [];
        this.loading = false;
      },
      error: () => {
        this.message = 'Unable to load approval tasks.';
        this.loading = false;
      }
    });
  }
}
