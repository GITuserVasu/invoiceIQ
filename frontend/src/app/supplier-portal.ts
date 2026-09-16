import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from './api.service';

@Component({
  selector: 'app-supplier-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="supplier-shell">
      <section class="supplier-card">
        <h1>Supplier Portal</h1>
        <p class="muted">Submit invoices and track processing status.</p>

        <form *ngIf="!authenticated" (ngSubmit)="login()">
          <label>Email <input name="email" type="email" [(ngModel)]="email" required></label>
          <label>Password <input name="password" type="password" [(ngModel)]="password" required></label>
          <button type="submit" [disabled]="loading">Sign in</button>
        </form>

        <section *ngIf="authenticated">
          <div class="toolbar">
            <strong>{{ supplierName }}</strong>
            <button type="button" class="secondary" (click)="logout()">Sign out</button>
          </div>
          <form (ngSubmit)="submit()" class="upload-form">
            <label>Invoice file <input type="file" (change)="selectFile($event)" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.xml" required></label>
            <button type="submit" [disabled]="loading || !file">Submit invoice</button>
          </form>
          <p *ngIf="message" class="message">{{ message }}</p>
          <h2>My submissions</h2>
          <p *ngIf="!submissions.length" class="muted">No submissions yet.</p>
          <table *ngIf="submissions.length">
            <thead><tr><th>Reference</th><th>File</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>
              <tr *ngFor="let item of submissions">
                <td>{{ item.submission_key }}</td>
                <td>{{ item.original_filename }}</td>
                <td>{{ item.status }}</td>
                <td>{{ item.created_at | date:'medium' }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </section>
    </main>
  `,
  styles: [`
    .supplier-shell { min-height: 100vh; display: grid; place-items: center; background: #f4f7fb; padding: 24px; font-family: Arial, sans-serif; }
    .supplier-card { width: min(900px, 100%); background: white; border: 1px solid #dbe4ef; border-radius: 14px; padding: 28px; box-shadow: 0 12px 32px rgba(35, 64, 96, .08); }
    form { display: grid; gap: 14px; max-width: 440px; }
    label { display: grid; gap: 6px; color: #334a63; font-size: 13px; font-weight: 600; }
    input { border: 1px solid #c6d2df; border-radius: 7px; padding: 10px; }
    button { border: 0; border-radius: 7px; padding: 10px 16px; background: #0d7c97; color: white; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    button.secondary { background: #e8eef5; color: #334a63; }
    .toolbar { display: flex; justify-content: space-between; align-items: center; margin: 20px 0; }
    .upload-form { max-width: none; border: 1px dashed #b6c7d8; padding: 18px; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #e5ebf2; font-size: 13px; }
    .muted { color: #71839a; }
    .message { color: #0d7c97; }
  `]
})
export class SupplierPortalComponent {
  private readonly api = inject(ApiService);
  readonly tenantId = new URLSearchParams(window.location.search).get('tenantId') || '';
  readonly entityId = new URLSearchParams(window.location.search).get('entityId') || '';
  email = '';
  password = '';
  supplierName = '';
  file: File | null = null;
  submissions: any[] = [];
  loading = false;
  message = '';
  authenticated = Boolean(localStorage.getItem('supplierAccessToken'));

  constructor() {
    if (this.authenticated) this.loadSubmissions();
  }

  login(): void {
    this.loading = true;
    this.api.supplierLogin(this.tenantId, this.entityId, this.email, this.password).subscribe({
      next: (response) => {
        localStorage.setItem('supplierAccessToken', response.accessToken);
        this.supplierName = response.supplier?.vendorName || response.supplier?.fullName || this.email;
        this.authenticated = true;
        this.loading = false;
        this.loadSubmissions();
      },
      error: () => {
        this.message = 'Invalid supplier credentials.';
        this.loading = false;
      }
    });
  }

  logout(): void {
    localStorage.removeItem('supplierAccessToken');
    this.authenticated = false;
    this.submissions = [];
  }

  selectFile(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] || null;
  }

  submit(): void {
    if (!this.file) return;
    this.loading = true;
    const file = this.file;
    const reader = new FileReader();
    reader.onload = () => {
      const dataBase64 = String(reader.result || '').split(',')[1] || '';
      this.api.submitSupplierDocument(this.tenantId, this.entityId, {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64,
        documentType: 'invoice'
      }).subscribe({
        next: () => {
          this.message = 'Invoice submitted successfully.';
          this.file = null;
          this.loading = false;
          this.loadSubmissions();
        },
        error: () => {
          this.message = 'Invoice submission failed.';
          this.loading = false;
        }
      });
    };
    reader.readAsDataURL(file);
  }

  private loadSubmissions(): void {
    if (!this.tenantId || !this.entityId) return;
    this.api.getSupplierSubmissions(this.tenantId, this.entityId).subscribe({
      next: (response) => this.submissions = response.data || []
    });
  }
}
