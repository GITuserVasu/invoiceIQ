// @ts-nocheck
import { AfterViewInit, Component, inject, OnDestroy, ViewEncapsulation } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-entity-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './entity-dashboard.html',
  styleUrl: './entity-dashboard.css',
  encapsulation: ViewEncapsulation.None
})
export class EntityDashboardComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshInFlight = false;
  tenantName = environment.TENANTNAME;

  //ngAfterViewInit(): void {
  ngOnInit(): void {
    initTopBar();
    const params = new URLSearchParams(window.location.search);
    const entityId = params.get('entityId')?.trim() || localStorage.getItem('lx_entity_id') || '';
    const entityName = params.get('entityName')?.trim() || localStorage.getItem('lx_entity_name') || '';
    const tenantIdFromUrl = params.get('tenantId')?.trim() || localStorage.getItem('lx_tenant_id') || '';

    if (entityId) {
      localStorage.setItem('lx_entity_id', entityId);
      localStorage.setItem('lx_entity_name', entityName);
    }

    if (!entityId) {
      this.showError('Entity context is missing. Open the dashboard from an entity record.');
      this.resetCommandCenter();
      return;
    }

    const loadDashboard = (tenantId: string) => {
      this.loadCommandCenterData(tenantId, entityId, entityName);
      this.startAutoRefresh(tenantId, entityId, entityName);
      this.api.getEntityDashboard(tenantId, entityId).subscribe({
        next: (response: any) => {
          this.renderDashboard(response, entityId, entityName);
          this.api.logAudit(tenantId, 'entity.dashboard.viewed', 'entity', entityId, { entityName }).subscribe({ error: () => {} });
          this.api.getEntityMenu(tenantId, entityId, this.currentUserEmail()).subscribe({

                next: (menuResponse: any) => this.applyMenu(menuResponse.menu || []),
           // next: (menuResponse: any) => {

             // if (menuResponse && typeof menuResponse === 'object' && 'menu' in menuResponse) {
               // this.applyMenu(menuResponse.menu || []);
              //} else {
                // Fallback if the JSON structure is unexpected
               // this.applyMenu([{ key: 'dashboard', visible: true }]);
             // }
            //}
            error: () => this.applyMenu([{ key: 'dashboard', visible: true }])
          });
          // try {
          //   const response = await fetch(menuUrl, { headers: { 'Accept': 'application/json' } });
          //   const contentType = response.headers.get("content-type");

          //   if (!response.ok || !contentType.includes("application/json")) {
          //     throw new TypeError("Expected JSON, got " + contentType);
          //   }

          //   return await response.json();
          // } catch (error) {
          //   console.error("Fetch failed, stopping loop:", error);
          //   // Do not auto-retry without a counter or delay
          // }




        },
        error: () => {
          this.showError('Entity data could not be loaded from the backend.');
        }
      });
    };

    if (tenantIdFromUrl) {
      loadDashboard(tenantIdFromUrl);
    } else {
      this.api.getTenant().subscribe({
        next: (tenantResponse: any) => {
          const tenant = tenantResponse.data?.[0];
          if (!tenant) {
            this.showError('Tenant was not found.');
            return;
          }
          loadDashboard(tenant.id);
        },
        error: () => this.showError('Backend is unavailable.')
      });
    }
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private startAutoRefresh(tenantId: string, entityId: string, entityName: string): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => {
      this.loadCommandCenterData(tenantId, entityId, entityName);
    }, 10000);
  }

  private loadCommandCenterData(tenantId: string, entityId: string, entityName: string): void {
    if (this.refreshInFlight) return;
    this.refreshInFlight = true;
    this.api.getEntityCommandCenter(tenantId, entityId).pipe(
      catchError(() => of({ data: null }))
    ).subscribe((response: any) => {
      const data = response.data || {};
      const summary = data.summary || {};
      const invoices = data.invoices || [];
      const transactions = data.transactions || [];
      const exceptions = data.exceptions || [];
      const approvals = data.approvals || [];
      const activity = data.activity || [];
      const openExceptions = exceptions.filter((item: any) => !['resolved', 'closed'].includes(String(item.status).toLowerCase()));
      const needsAction = Number(summary.needsAction ?? (openExceptions.length + approvals.length));
      const holdValue = Number(summary.holdValue ?? openExceptions.reduce((total: number, item: any) => total + Number(item.amount_num || 0), 0));

      this.setText('ccTouchlessRate', this.formatMetricPercent(summary.touchlessRatePct));
      this.setText('ccNeedsAction', String(needsAction));
      this.setText('ccHoldValue', this.formatAmount(holdValue));
      this.setText('ccInvoiceCount', String(summary.totalInvoices ?? (invoices.length || transactions.length)));
      this.setText('ccRegistryCount', String(summary.registryCount ?? 0));
      this.setText('ccReviewCount', String(summary.reviewCount ?? 0));
      this.setText('ccBlockedCount', String(summary.blockedCount ?? 0));
      this.setText('ccApprovalCount', String(approvals.length));
      this.setText('ccWorkCount', String(needsAction));
      this.setText('ccFlowRegistry', String(summary.registryCount ?? 0));
      this.setText('ccFlowReview', String(summary.reviewCount ?? 0));
      this.setText('ccFlowBlocked', String(summary.blockedCount ?? 0));
      this.setText('ccLanePill', `Intake: ${invoices.length || transactions.length ? 'Active' : 'Ready'}`);
      this.setText('ccUpdatedAt', `Updated: ${this.formatDateTime(data.updatedAt)}`);

      this.renderCommandInvoices(invoices, transactions);
      this.renderCommandQueue(openExceptions, approvals, tenantId, entityId, entityName);
      this.renderCommandActivity(activity);
      this.setCommandLinks(tenantId, entityId, entityName);
      this.refreshInFlight = false;
    }, () => {
      this.refreshInFlight = false;
    });
  }

  private resetCommandCenter(): void {
    this.setText('ccTouchlessRate', '—');
    this.setText('ccNeedsAction', '0');
    this.setText('ccHoldValue', '$');
    this.setText('ccInvoiceCount', '0');
    this.setText('ccRegistryCount', '0');
    this.setText('ccReviewCount', '0');
    this.setText('ccBlockedCount', '0');
    this.setText('ccApprovalCount', '0');
    this.setText('ccWorkCount', '0');
    this.setText('ccFlowRegistry', '0');
    this.setText('ccFlowReview', '0');
    this.setText('ccFlowBlocked', '0');
    this.setText('ccUpdatedAt', 'Updated: —');
    this.renderCommandInvoices([], []);
    this.renderCommandQueue([], [], '', '', '');
    this.renderCommandActivity([]);
  }

  private renderCommandInvoices(invoices: any[], transactions: any[] = []): void {
    const table = document.getElementById('ccInvoiceTable');
    if (!table) return;
    const rows = invoices.length ? invoices : transactions;
    if (!rows.length) {
      table.innerHTML = '<tr><td colspan="6" class="table-empty">No invoices in this entity yet. Use Transactions to upload or connect an intake channel.</td></tr>';
      return;
    }

    table.innerHTML = rows.slice(0, 10).map((invoice: any) => {
      const state = this.commandInvoiceState(invoice);
      const statusClass = state === 'Touchless' ? 'approved' : state === 'Blocked' ? 'rejected' : state === 'Review' ? 'pending' : 'info';
      const gates = ['A', 'B', 'C', 'D'].map((gate) => `<i class="cc-gate ${this.commandGateClass(invoice, gate)}">${gate}</i>`).join('');
      return `<tr>
        <td><strong>${this.escapeHtml(invoice.invoice_key || invoice.invoice_number || invoice.batch_id || '—')}</strong><small>${this.escapeHtml(invoice.po_number || invoice.po_ref || invoice.document_type || 'Document intake')}</small></td>
        <td><strong>${this.escapeHtml(invoice.vendor_name || invoice.supplier_name || 'Document intake')}</strong><small>${this.escapeHtml(invoice.gstin || invoice.source_channel || 'Processing source')}</small></td>
        <td class="amount-cell">${this.formatAmount(invoice.amount_num || invoice.total_amount)}</td>
        <td><span class="cc-gates">${gates}</span></td>
        <td><span class="decision ${statusClass}">${state}</span></td>
        <td>${this.formatDate(invoice.invoice_date || invoice.created_at || invoice.uploaded_at)}</td>
      </tr>`;
    }).join('');
  }

  private renderCommandQueue(exceptions: any[], approvals: any[], tenantId: string, entityId: string, entityName: string): void {
    const container = document.getElementById('ccWorkQueue');
    if (!container) return;
    const items = [
      ...exceptions.slice(0, 4).map((item: any) => ({
        kind: 'Exception',
        title: item.title || item.reason_code || 'Invoice exception',
        detail: `${item.invoice_ref || item.exception_key || 'Review required'} · ${this.formatAmount(item.amount_num)}`,
        href: this.entityLink('/exception-queue', tenantId, entityId, entityName),
        className: 'danger'
      })),
      ...approvals.slice(0, 3).map((item: any) => ({
        kind: 'Approval',
        title: 'Approval pending',
        detail: `${item.invoice_number || 'Invoice'} · ${item.approver_role_key || 'Assigned reviewer'}`,
        href: this.entityLink('/approval-queue', tenantId, entityId, entityName),
        className: 'approval'
      }))
    ];

    container.innerHTML = items.length
      ? items.map((item) => `<a class="dashboard-queue-item ${item.className}" href="${item.href}"><span class="queue-icon">${item.kind === 'Exception' ? '!' : '✓'}</span><span><strong>${this.escapeHtml(item.title)}</strong><small>${this.escapeHtml(item.detail)}</small></span><b>›</b></a>`).join('')
      : '<div class="table-empty">No invoice decisions are waiting.</div>';
  }

  private renderCommandActivity(activity: any[]): void {
    const container = document.getElementById('ccActivity');
    if (!container) return;
    container.innerHTML = activity.length
      ? activity.slice(0, 8).map((item: any) => `<div class="dashboard-activity-row"><span class="activity-dot"></span><span>${this.formatDate(item.created_at || item.occurred_at)}</span><strong>${this.escapeHtml(String(item.action || item.event_type || 'Activity').replace(/[._]/g, ' '))}</strong><small>${this.escapeHtml(item.resource_id || item.metadata?.invoiceKey || 'System activity recorded')}</small></div>`).join('')
      : '<div class="table-empty">Processing events will appear here as invoices move through the workflow.</div>';
  }

  private setCommandLinks(tenantId: string, entityId: string, entityName: string): void {
    ['ccIntakeLink', 'ccPipelineLink', 'ccAuditLink'].forEach((id) => {
      const link = document.getElementById(id) as HTMLAnchorElement | null;
      if (!link) return;
      link.href = this.entityLink(link.getAttribute('href')?.split('?')[0] || '/', tenantId, entityId, entityName);
    });
  }

  private entityLink(path: string, tenantId: string, entityId: string, entityName: string): string {
    const query = new URLSearchParams({ tenantId, entityId, entityName });
    return `${path}?${query.toString()}`;
  }

  private commandInvoiceState(invoice: any): string {
    const state = String(invoice.match_status || invoice.status || 'pending').toLowerCase();
    if (['matched', 'approved', 'paid'].includes(state)) return 'Touchless';
    if (['partial', 'partially_matched', 'under_review'].includes(state)) return 'Review';
    if (['disputed', 'unmatched', 'rejected'].includes(state)) return 'Blocked';
    return 'Processing';
  }

  private commandGateClass(invoice: any, gate: string): string {
    const state = this.commandInvoiceState(invoice);
    if (gate === 'B') return state === 'Touchless' ? 'pass' : state === 'Blocked' ? 'fail' : state === 'Review' ? 'warn' : 'skip';
    if (gate === 'D') return state === 'Touchless' ? 'pass' : state === 'Blocked' ? 'fail' : state === 'Review' ? 'warn' : 'skip';
    return state === 'Touchless' ? 'skip' : 'skip';
  }

  private countInvoiceStates(invoices: any[], states: string[]): number {
    return invoices.filter((invoice) => states.includes(String(invoice.match_status || invoice.status || '').toLowerCase())).length;
  }

  private countProcessingTransactions(transactions: any[]): number {
    return transactions.filter((transaction) => ['processing', 'failed', 'stopped'].includes(String(transaction.status || '').toLowerCase())).length;
  }

  private formatMetricPercent(value: unknown): string {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(1)}%` : '—';
  }

  private formatAmount(value: unknown): string {
    const amount = Number(value || 0);
    return amount > 0 ? `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '$';
  }

  private formatDate(value: unknown): string {
    if (!value) return '—';
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  private formatDateTime(value: unknown): string {
    if (!value) return '—';
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] || character);
  }

  private renderDashboard(data: any, entityId: string, entityName: string): void {
    const entity = data.entity;
    const settings = data.settings || {};
    const intakeChannels = data.intakeChannels || [];
    const roles = data.roles || [];
    const assignments = data.assignments || [];
    const classifications = data.classifications || [];
    const matchingPolicy = data.matchingPolicy;
    const intakeReady = intakeChannels.some((channel) => channel.is_enabled);
    const matchingReady = Boolean(matchingPolicy);
    const modelReady = assignments.length > 0;
    const classReady = classifications.length > 0;
    const accessReady = roles.length > 0 && Boolean(settings.rbac_enabled);
    const apModules = [
      ['Document Upload & Ingestion', intakeReady],
      ['Document Classification', classReady],
      ['OCR / LLM Extraction', modelReady],
      ['3-Way Matching (PO-Inv-GRN)', matchingReady],
      ['Exception Handling', matchingReady],
      ['Approval Workflow', accessReady],
      ['Vendor Management', false],
      ['Payment Processing', false]
    ];
    const arModules = [
      ['Invoice Generation', modelReady],
      ['Customer / Entity Management', accessReady],
      ['Payment Tracking', matchingReady],
      ['Aging Report', matchingReady],
      ['Reconciliation', matchingReady],
      ['Collections Management', false],
      ['Credit Management', false],
      ['Analytics & Reporting', classReady]
    ];
    this.setText('entityCrumbName', entity.name || entityName || 'Entity');
    this.setText('entityHeading', `${entity.name || entityName || 'Entity'} — AP Operations`);
    this.setText('entityIdPill', `Entity ID: ${entity.entity_key || entityId}`);
    this.setText('entityRoleChip', settings.default_role_key || 'Entity Admin');
    this.setText('entityRolePill', `Role: ${settings.default_role_key || 'Entity Admin'}`);
    this.setText('activeLlmPill', `Active LLM: ${assignments[0]?.model_name || 'Not assigned'}`);
    const apCompletion = this.completion(apModules);
    const arCompletion = this.completion(arModules);
    this.setHtml('apPct', `${apCompletion}<small>%</small>`);
    this.setHtml('arPct', `${arCompletion}<small>%</small>`);
    this.setStyle('apBarFill', 'width', `${apCompletion}%`);
    this.setStyle('arBarFill', 'width', `${arCompletion}%`);
    this.setText('overallCompPill', `Overall Completion: ${Math.round((apCompletion + arCompletion) / 2)}%`);
    this.renderModules('apModuleList', apModules);
    this.renderModules('arModuleList', arModules);
    this.renderSetup(entity, roles, assignments, classifications, intakeChannels, settings, matchingPolicy);
    const providers = data.providers || [];
    const providerAssignments = data.providerAssignments || [];
    const connections = data.apiConnections || [];
    this.renderOps(roles, assignments, matchingPolicy, providers, providerAssignments, connections);
    this.renderEntityProfile(entity, settings, intakeChannels, assignments, classifications, providerAssignments, connections, entityId);
    this.renderGovernanceChecklist(entity, settings, roles, assignments, classifications, intakeChannels, providerAssignments, connections, matchingPolicy, entityId, entity.name || entityName);
    this.configureNavigation(entityId, entity.name || entityName);
  }

  private renderModules(id: string, modules: any[]): void {
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = '';
    modules.forEach(([name, ready]) => {
      const row = document.createElement('div');
      row.className = 'mod-item';
      row.innerHTML = `<span class="mod-dot ${ready ? 'done' : 'todo'}"></span><span></span><span class="mod-badge ${ready ? 'done' : 'todo'}">${ready ? 'Live' : 'Pending'}</span>`;
      row.querySelector('span:nth-child(2)').textContent = name;
      container.appendChild(row);
    });
  }

  private renderSetup(entity: any, roles: any[], assignments: any[], classifications: any[], intakeChannels: any[], settings: any, matchingPolicy: any): void {
    const items = [
      ['🏢', 'Entity Created', entity.entity_key, true],
      ['👥', 'Admin Users', `${roles.length} roles assigned`, roles.length > 0],
      ['🔐', 'RBAC Configured', settings.rbac_enabled ? 'Roles assigned' : 'Disabled', Boolean(settings.rbac_enabled)],
      ['🤖', 'AI Model Assigned', `${assignments.length} assignments`, assignments.length > 0],
      ['📄', 'Classification Rules', `${classifications.length} mappings`, classifications.length > 0],
      ['🛡️', 'Matching Policy', matchingPolicy ? 'Configured' : 'Not configured', Boolean(matchingPolicy)],
      ['✉', 'Intake Channels', `${intakeChannels.filter((channel) => channel.is_enabled).length} enabled`, intakeChannels.some((channel) => channel.is_enabled)]
    ];
    const container = document.getElementById('setupStrip');
    if (!container) return;
    container.innerHTML = '';
    items.forEach(([icon, label, detail, ready]) => {
      const card = document.createElement('div');
      card.className = 'setup-card';
      card.innerHTML = `<div class="setup-icon-row"><span class="setup-emoji">${icon}</span><span class="setup-status-dot ${ready ? 'done' : 'todo'}"></span></div><b></b><span></span><span class="setup-tag ${ready ? 'done' : 'todo'}">${ready ? 'Live' : 'Pending'}</span>`;
      card.querySelector('b').textContent = label;
      card.querySelector('b + span').textContent = detail;
      container.appendChild(card);
    });
  }

  private renderOps(roles: any[], assignments: any[], matchingPolicy: any, providers: any[], providerAssignments: any[], connections: any[]): void {
    this.setText('adminUsersCount', String(roles.length || '—'));
    this.setText('vendorCount', String(providers.length || '—'));
    this.setText('invoiceCount', '—');
    this.setText('pendingActionCount', String(connections.filter((c) => ['failed', 'pending'].includes(c.status)).length));
    this.setText('kpiThreeWayRate', matchingPolicy ? (matchingPolicy.matching_method || '3-way').replace('_', ' ') : '—');
    this.setText('kpiLlmAccuracy', assignments.length ? `${assignments.length} model${assignments.length > 1 ? 's' : ''} assigned` : '—');
    this.setText('kpiGovernanceScore', providerAssignments.length ? `${providerAssignments.length} provider${providerAssignments.length > 1 ? 's' : ''}` : 'Pending');
    this.setText('kpiUnitPrice', connections.length ? `${connections.length} API${connections.length > 1 ? 's' : ''}` : '—');
  }

  private renderEntityProfile(entity: any, settings: any, intakeChannels: any[], assignments: any[], classifications: any[], providerAssignments: any[], connections: any[], entityId: string): void {
    const status = entity.status || 'active';
    const badge = document.getElementById('entityStatusBadge');
    if (badge) {
      badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      badge.className = 'tag ' + (status === 'active' ? 'ok' : status === 'suspended' ? 'bad' : 'warn');
    }
    this.setText('profileEntityId', entity.entity_key || entityId || '—');
    this.setText('profileIndustry', entity.industry_code || entity.industry || '—');
    this.setText('profileRegion', entity.region_code || entity.region || '—');
    const intakeEnabled = intakeChannels.filter((c) => c.is_enabled || c.is_active).map((c) => c.channel_key || 'N/A');
    this.setText('profileIntake', intakeEnabled.length ? intakeEnabled.join(', ').toUpperCase() : 'Not configured');
    this.setText('profileRole', settings?.default_role_key || '—');
    const created = entity.created_at ? new Date(entity.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    this.setText('profileCreated', created);

    const readinessItems = [
      ['AI Models', assignments.length > 0, `${assignments.length} assignment${assignments.length !== 1 ? 's' : ''}`],
      ['Classification', classifications.length > 0, `${classifications.length} mapping${classifications.length !== 1 ? 's' : ''}`],
      ['Provider Routing', providerAssignments.length > 0, `${providerAssignments.length} provider${providerAssignments.length !== 1 ? 's' : ''}`],
      ['API Connections', connections.length > 0, `${connections.length} connection${connections.length !== 1 ? 's' : ''}`],
      ['Intake Channels', intakeEnabled.length > 0, intakeEnabled.length ? 'Active' : 'None enabled']
    ];
    const container = document.getElementById('modReadiness');
    if (!container) return;
    container.innerHTML = '';
    readinessItems.forEach(([label, ready, detail]) => {
      const row = document.createElement('div');
      row.className = 'readiness-row';
      row.innerHTML = `<span class="readiness-dot ${ready ? 'done' : 'todo'}"></span><span class="readiness-label"></span><span class="readiness-detail"></span><span class="readiness-badge ${ready ? 'ok' : 'warn'}">${ready ? 'Live' : 'Pending'}</span>`;
      (row.querySelector('.readiness-label') as HTMLElement).textContent = String(label);
      (row.querySelector('.readiness-detail') as HTMLElement).textContent = String(detail);
      container.appendChild(row);
    });
  }

  private renderGovernanceChecklist(entity: any, settings: any, roles: any[], assignments: any[], classifications: any[], intakeChannels: any[], providerAssignments: any[], connections: any[], matchingPolicy: any, entityId: string, entityName: string): void {
    const query = `?entityId=${encodeURIComponent(entityId)}&entityName=${encodeURIComponent(entityName)}`;
    const items = [
      {
        icon: '🏢', title: 'Entity Core', detail: entity.entity_key || entityId,
        ready: Boolean(entity.entity_key), link: null, linkLabel: ''
      },
      {
        icon: '👥', title: 'User Access & RBAC', detail: `${roles.length} role${roles.length !== 1 ? 's' : ''} assigned`,
        ready: roles.length > 0 && Boolean(settings.rbac_enabled), link: null, linkLabel: 'Add Users'
      },
      {
        icon: '⬆', title: 'Intake Channels', detail: intakeChannels.filter((c) => c.is_enabled).length + ' active',
        ready: intakeChannels.some((c) => c.is_enabled), link: null, linkLabel: 'Configure'
      },
      {
        icon: '🤖', title: 'AI Models', detail: `${assignments.length} assignment${assignments.length !== 1 ? 's' : ''}`,
        ready: assignments.length > 0, link: `/models-quality${query}`, linkLabel: 'Assign Model'
      },
      {
        icon: '📄', title: 'Document Classification', detail: `${classifications.length} mapping${classifications.length !== 1 ? 's' : ''}`,
        ready: classifications.length > 0, link: `/document-classification${query}`, linkLabel: 'Configure'
      },
      {
        icon: '🛡️', title: 'Provider Routing', detail: `${providerAssignments.length} provider${providerAssignments.length !== 1 ? 's' : ''} assigned`,
        ready: providerAssignments.length > 0, link: `/provider-governance${query}`, linkLabel: 'Assign Providers'
      },
      {
        icon: '🔄', title: '3-Way Matching Policy', detail: matchingPolicy ? 'Policy configured' : 'Not configured',
        ready: Boolean(matchingPolicy), link: null, linkLabel: 'Set Policy'
      },
      {
        icon: '🔌', title: 'API Integrations', detail: `${connections.length} connection${connections.length !== 1 ? 's' : ''}`,
        ready: connections.length > 0, link: `/api-integrations${query}`, linkLabel: 'Add Integration'
      }
    ];

    const container = document.getElementById('govChecklist');
    if (!container) return;
    container.innerHTML = '';
    items.forEach(({ icon, title, detail, ready, link, linkLabel }) => {
      const card = document.createElement('div');
      card.className = `gov-check-item ${ready ? 'gc-done' : 'gc-pending'}`;
      const actionHtml = (!ready && link) ? `<a class="btn gc-btn" href="${link}">${linkLabel}</a>` : '';
      card.innerHTML = `<div class="gc-icon">${icon}</div><div class="gc-body"><b class="gc-title"></b><span class="gc-detail"></span></div><span class="gc-badge ${ready ? 'ok' : 'warn'}">${ready ? 'Live' : 'Pending'}</span>${actionHtml}`;
      (card.querySelector('.gc-title') as HTMLElement).textContent = title;
      (card.querySelector('.gc-detail') as HTMLElement).textContent = detail;
      container.appendChild(card);
    });
  }

  private completion(modules: any[]): number {
    return Math.round((modules.filter((module) => module[1]).length / modules.length) * 100);
  }

  private configureNavigation(entityId: string, entityName: string): void {
    const query = `?entityId=${encodeURIComponent(entityId)}&entityName=${encodeURIComponent(entityName)}`;
    ['navRecon', 'navExceptions', 'navTxns', 'navAudit', 'navUsers', 'navClassify', 'navExtract'].forEach((id) => {
      const link = document.getElementById(id);
      if (link) link.setAttribute('href', `${link.getAttribute('href').split('?')[0]}${query}`);
    });
  }

  private applyMenu(menu: any[]): void {
    const visible = new Set(menu.filter((item) => item.visible !== false).map((item) => item.key));
    const menuIds: Record<string, string> = {
      dashboard: 'navDashboard',
      reconciliation: 'navRecon',
      exceptions: 'navExceptions',
      transactions: 'navTxns',
      audit: 'navAudit',
      users: 'navUsers',
      classification: 'navClassify',
      extraction: 'navExtract'
    };
    Object.entries(menuIds).forEach(([key, id]) => {
      const item = document.getElementById(id) as HTMLElement | null;
      if (item) item.hidden = !visible.has(key);
    });
  }

  private currentUserEmail(): string | undefined {
    try {
      const user = JSON.parse(localStorage.getItem('authUser') || '{}');
      return typeof user.email === 'string' && user.email.trim() ? user.email.trim() : undefined;
    } catch {
      return undefined;
    }
  }

  private showError(message: string): void {
    const subtitle = document.getElementById('heroSubtitle');
    if (subtitle) subtitle.textContent = message;
  }

  private setText(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  private setHtml(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.innerHTML = value;
  }

  private setStyle(id: string, property: string, value: string): void {
    const element = document.getElementById(id) as HTMLElement | null;
    if (element) element.style.setProperty(property, value);
  }
}
