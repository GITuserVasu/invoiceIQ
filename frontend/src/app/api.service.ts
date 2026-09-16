import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;
  tenantName = environment.TENANTNAME;

  getTenant(tenantKey?: string) {
    const storedTenantId = localStorage.getItem('lx_tenant_id');
    const params: Record<string, string> = {};
    if (tenantKey) params['tenantKey'] = tenantKey;
    else if (!storedTenantId) params['tenantKey'] = 'Northline Retail';
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants`, { params });
  }

  getCatalogs() {
    return this.http.get<any>(`${this.baseUrl}/catalogs`);
  }

  createEntity(tenantId: string, payload: any) {
    return this.http.post<any>(`${this.baseUrl}/tenants/${tenantId}/entities`, payload);
  }

  getEntity(tenantId: string, entityId: string) {
    return this.http.get<any>(`${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}`);
  }

  getEntityDashboard(tenantId: string, entityId: string) {
    return this.http.get<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/dashboard`
    );
  }

  getEntityMenu(tenantId: string, entityId: string, userEmail?: string) {
    const params: Record<string, string> = userEmail ? { userEmail } : {};
    return this.http.get<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/menu`,
      { params }
    );
  }

  getEntities(tenantId: string) {
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants/${tenantId}/entities`);
  }

  refreshRoles(tenantId: string, entityId: string) {
    return this.http.post<any>(`${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/roles/refresh`, {});
  }

  getModels(tenantId: string) {
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants/${tenantId}/models`);
  }

  registerModel(tenantId: string, payload: any) {
    return this.http.post<any>(`${this.baseUrl}/tenants/${tenantId}/models`, payload);
  }

  getPromptVersions(tenantId: string) {
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants/${tenantId}/prompt-versions`);
  }

  createPromptVersion(tenantId: string, promptKey: string, payload: any) {
    return this.http.post<any>(
      `${this.baseUrl}/tenants/${tenantId}/prompt-templates/${encodeURIComponent(promptKey)}/versions`,
      payload
    );
  }

  getModelAssignments(tenantId: string) {
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants/${tenantId}/model-assignments`);
  }

  createModelAssignment(tenantId: string, entityId: string, payload: any) {
    return this.http.post<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/model-assignments`,
      payload
    );
  }

  getClassificationModels(tenantId: string) {
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants/${tenantId}/classification-models`);
  }

  registerClassificationModel(tenantId: string, payload: any) {
    return this.http.post<any>(`${this.baseUrl}/tenants/${tenantId}/classification-models`, payload);
  }

  getAllClassificationMappings(tenantId: string) {
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants/${tenantId}/classification-mappings`);
  }

  getClassification(tenantId: string, entityId: string) {
    return this.http.get<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/classification`
    );
  }

  saveClassification(tenantId: string, entityId: string, payload: any) {
    return this.http.put<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/classification`,
      payload
    );
  }

  testClassification(tenantId: string, entityId: string, payload: any) {
    return this.http.post<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/classification/test`,
      payload
    );
  }

  publishClassification(tenantId: string, entityId: string, mappingKey: string) {
    return this.http.post<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/classification/publish`,
      { mappingKey }
    );
  }

  getProviders(tenantId: string) {
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants/${tenantId}/providers`);
  }

  registerProvider(tenantId: string, payload: any) {
    return this.http.post<any>(`${this.baseUrl}/tenants/${tenantId}/providers`, payload);
  }

  getProviderAssignments(tenantId: string, entityId: string) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/provider-assignments`
    );
  }

  assignProvider(tenantId: string, entityId: string, payload: any) {
    return this.http.post<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/provider-assignments`,
      payload
    );
  }

  getApiConnections(tenantId: string, entityId: string) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/api-connections`
    );
  }

  createApiConnection(tenantId: string, entityId: string, payload: any) {
    return this.http.post<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/api-connections`,
      payload
    );
  }

  testApiConnection(tenantId: string, entityId: string, apiKey: string) {
    return this.http.post<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/api-connections/test`,
      { apiKey }
    );
  }

  saveApiAssignments(tenantId: string, entityId: string, apiKeys: string[]) {
    return this.http.put<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/api-assignments`,
      { apiKeys }
    );
  }

  getAuditEvents(tenantId: string, filters: {
    actorEmail?: string; actorUserId?: string; action?: string;
    resourceType?: string; from?: string; to?: string; limit?: number; offset?: number;
  } = {}) {
    const params: Record<string, string> = {};
    if (filters.actorEmail)   params['actorEmail']   = filters.actorEmail;
    if (filters.actorUserId)  params['actorUserId']  = filters.actorUserId;
    if (filters.action)       params['action']       = filters.action;
    if (filters.resourceType) params['resourceType'] = filters.resourceType;
    if (filters.from)         params['from']         = filters.from;
    if (filters.to)           params['to']           = filters.to;
    if (filters.limit  != null) params['limit']  = String(filters.limit);
    if (filters.offset != null) params['offset'] = String(filters.offset);
    return this.http.get<{ data: any[]; total: number; limit: number; offset: number }>(
      `${this.baseUrl}/tenants/${tenantId}/audit-events`, { params }
    );
  }

  getAuditActors(tenantId: string) {
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants/${tenantId}/audit-events/actors`);
  }

  getTenantUsers(tenantId: string) {
    return this.http.get<{ data: any[] }>(`${this.baseUrl}/tenants/${tenantId}/users`);
  }

  createUser(tenantId: string, payload: { email: string; displayName?: string }) {
    return this.http.post<any>(`${this.baseUrl}/tenants/${tenantId}/users`, payload);
  }

  logAudit(tenantId: string, action: string, resourceType: string, resourceId?: string | null, metadata?: Record<string, unknown>) {
    return this.http.post<any>(`${this.baseUrl}/tenants/${tenantId}/audit-events`, {
      action,
      resourceType: resourceType || 'ui',
      resourceId: resourceId || null,
      metadata: metadata || {}
    });
  }

  seedEntityDemoData(tenantId: string, entityId: string) {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/seed-demo-data`,
      {}
    );
  }

  // ── Entity operational screens ──────────────────────────────────────────

  getEntityAuditEvents(tenantId: string, entityId: string, params: Record<string, string> = {}) {
    return this.http.get<{ data: any[]; total: number }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/audit-events`,
      { params }
    );
  }

  getEntityMembers(tenantId: string, entityId: string) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/members`
    );
  }

  getEntityInvoices(tenantId: string, entityId: string, params: Record<string, string> = {}) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/invoices`,
      { params }
    );
  }

  getActivePurchaseOrders(tenantId: string, entityId: string) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/purchase-orders`,
      { params: { status: 'active' } }
    );
  }

  assignInvoicePurchaseOrder(tenantId: string, entityId: string, invoiceId: string, poNumber: string) {
    return this.http.patch<{ success: boolean; po: any }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/invoices/${encodeURIComponent(invoiceId)}/po`,
      { poNumber }
    );
  }

  getEntityExceptions(tenantId: string, entityId: string, params: Record<string, string> = {}) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/exceptions`,
      { params }
    );
  }

  getEntityTransactions(tenantId: string, entityId: string, params: Record<string, string> = {}) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/transactions`,
      { params }
    );
  }

  getEntityCommandCenter(tenantId: string, entityId: string) {
    return this.http.get<{ data: {
      updatedAt: string;
      summary: any;
      invoices: any[];
      transactions: any[];
      exceptions: any[];
      approvals: any[];
      activity: any[];
    } }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/command-center`
    );
  }

  // ── Connector sync ──────────────────────────────────────────────────────

  getSyncStatus(tenantId: string, entityId: string) {
    return this.http.get<{ success: boolean; channels: Record<string, any> }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/sync/status`
    );
  }

  syncSap(tenantId: string, entityId: string) {
    return this.http.post<{ success: boolean; result: any }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/sync/sap`, {}
    );
  }

  syncMail(tenantId: string, entityId: string) {
    return this.http.post<{ success: boolean; result: any }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/sync/mail`, {}
    );
  }

  syncVendorPortal(tenantId: string, entityId: string) {
    return this.http.post<{ success: boolean; result: any }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/sync/vendor-portal`, {}
    );
  }

  uploadDocument(tenantId: string, entityId: string, payload: { filename: string; mimeType: string; dataBase64: string; sourceHint?: string }) {
    return this.http.post<{ success: boolean; result: any }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/documents/upload`,
      payload
    );
  }

  getDocuments(tenantId: string, entityId: string, params: Record<string, string> = {}) {
    return this.http.get<{ success: boolean; batches: any[]; total: number }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/documents`,
      { params }
    );
  }

  getTransactionPreview(tenantId: string, entityId: string, batchId: string) {
    return this.http.get(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/transactions/${encodeURIComponent(batchId)}/preview`,
      { responseType: 'blob' }
    );
  }

  // ── Matching ────────────────────────────────────────────────────────────

  runEntityMatch(tenantId: string, entityId: string, toleranceOverrides: Record<string, number> = {}) {
    return this.http.post<{ success: boolean; summary: any; results: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/match/run`,
      { toleranceOverrides }
    );
  }

  getMatchSummary(tenantId: string, entityId: string) {
    return this.http.get<any>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/match/summary`
    );
  }

  getMatchResults(tenantId: string, entityId: string, params: Record<string, string> = {}) {
    return this.http.get<{ data: any[]; total: number }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/match/results`,
      { params }
    );
  }

  getMatchVariances(tenantId: string, entityId: string) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/match/variances`
    );
  }

  resolveVariance(tenantId: string, entityId: string, varianceId: string, action: 'accept' | 'reject' | 'waive', notes?: string) {
    return this.http.patch<{ success: boolean; status: string }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/match/variances/${varianceId}`,
      { action, notes }
    );
  }

  approveInvoice(tenantId: string, entityId: string, invoiceId: string, notes?: string) {
    return this.http.patch<{ success: boolean }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/invoices/${invoiceId}/approve`,
      { notes }
    );
  }

  rejectInvoice(tenantId: string, entityId: string, invoiceId: string, reason: string, notes?: string) {
    return this.http.patch<{ success: boolean }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/invoices/${invoiceId}/reject`,
      { reason, notes }
    );
  }

  resolveException(tenantId: string, entityId: string, exceptionId: string, notes?: string) {
    return this.http.patch<{ success: boolean }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/exceptions/${exceptionId}/resolve`,
      { notes }
    );
  }

  escalateException(tenantId: string, entityId: string, exceptionId: string, notes?: string) {
    return this.http.patch<{ success: boolean }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/exceptions/${exceptionId}/escalate`,
      { notes }
    );
  }

  bulkExceptionAction(tenantId: string, entityId: string, exceptionIds: string[], action: 'resolve' | 'escalate' | 'assign', ownerName?: string) {
    return this.http.patch<{ success: boolean; updated: number }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/exceptions/bulk`,
      { exceptionIds, action, ownerName }
    );
  }

  updateIntakeChannel(tenantId: string, entityId: string, channelKey: string, payload: { connectionSettings?: Record<string,any>; isEnabled?: boolean; syncFrequency?: string }) {
    return this.http.patch<{ success: boolean }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/intake-channels/${channelKey}`,
      payload
    );
  }

  getEntityUsers(tenantId: string, entityId: string) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/users`
    );
  }

  createEntityUser(tenantId: string, entityId: string, payload: { email: string; fullName: string; phone?: string; department?: string; roleKey?: string }) {
    return this.http.post<{ success: boolean; userId: string }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/users`,
      payload
    );
  }

  updateEntityUser(tenantId: string, entityId: string, userId: string, payload: { roleKey?: string; status?: string; department?: string; phone?: string }) {
    return this.http.patch<{ success: boolean }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/users/${userId}`,
      payload
    );
  }

  login(email: string, password: string) {
    return this.http.post<{ success: boolean; user: any; accessToken: string; redirectTo: string }>(
      `${this.baseUrl.replace('/api/v1', '')}/api/v1/auth/login`,
      { email, password }
    );
  }

  supplierLogin(tenantId: string, entityId: string, email: string, password: string) {
    return this.http.post<{ success: boolean; accessToken: string; supplier: any }>(
      `${this.baseUrl.replace('/api/v1', '')}/api/v1/supplier/auth/login`,
      { tenantId, entityId, email, password }
    );
  }

  getSupplierSubmissions(tenantId: string, entityId: string) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl.replace('/api/v1', '')}/api/v1/supplier/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/submissions`
    );
  }

  submitSupplierDocument(tenantId: string, entityId: string, payload: {
    filename: string; mimeType: string; dataBase64: string; documentType?: string;
  }) {
    return this.http.post<{ success: boolean; submission: any; batchId: string }>(
      `${this.baseUrl.replace('/api/v1', '')}/api/v1/supplier/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/submissions`,
      payload
    );
  }

  getSupplierVendors(tenantId: string, entityId: string) {
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl.replace('/api/v1', '')}/api/v1/supplier/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/suppliers/vendors`
    );
  }

  createSupplierUser(tenantId: string, entityId: string, payload: {
    vendorId: string; email: string; fullName: string; password: string;
  }) {
    return this.http.post<{ success: boolean; user: any }>(
      `${this.baseUrl.replace('/api/v1', '')}/api/v1/supplier/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/suppliers/users`,
      payload
    );
  }

  getApprovals(tenantId: string, entityId: string, status?: string) {
    const params: Record<string, string> = {};
    if (status) params['status'] = status;
    return this.http.get<{ data: any[] }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/approvals`,
      { params }
    );
  }

  initializeInvoiceApprovals(tenantId: string, entityId: string, invoiceId: string) {
    return this.http.post<{ success: boolean; invoiceId: string }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/invoices/${invoiceId}/approvals/initialize`,
      {}
    );
  }

  actOnApproval(tenantId: string, entityId: string, invoiceId: string, approvalId: string, action: 'approve' | 'reject' | 'escalate', notes?: string) {
    return this.http.patch<{ success: boolean; status: string }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/invoices/${invoiceId}/approvals/${approvalId}`,
      { action, notes }
    );
  }

  deleteEntity(tenantId: string, entityId: string) {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}`
    );
  }

  deleteEntityUser(tenantId: string, entityId: string, userId: string) {
    return this.http.delete<{ success: boolean }>(
      `${this.baseUrl}/tenants/${tenantId}/entities/${encodeURIComponent(entityId)}/users/${userId}`
    );
  }
}
