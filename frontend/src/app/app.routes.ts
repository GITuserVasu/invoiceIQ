import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';
import { entityPermissionGuard } from './entity-permission.guard';
import { superAdminGuard } from './super-admin.guard';
import { ApiIntegrationsComponent } from './api-integrations/api-integrations';
import { AuditLogsComponent } from './audit-logs/audit-logs';
import { ClientCreationJourneyComponent } from './client-creation-journey/client-creation-journey';
import { DocumentClassificationComponent } from './document-classification/document-classification';
import { EntityAuditLogsComponent } from './entity-audit-logs/entity-audit-logs';
import { EntityDashboardComponent } from './entity-dashboard/entity-dashboard';
import { EntityShowcaseComponent } from './entity-showcase/entity-showcase';
import { ExceptionQueueComponent } from './exception-queue/exception-queue';
import { LoginComponent } from './login/login';
import { ModelsQualityComponent } from './models-quality/models-quality';
import { EntityCreationSettingsComponent } from './entity-creation-settings/entity-creation-settings';
import { ModelPromptAccessComponent } from './model-prompt-access-create-form/model-prompt-access-create-form';
import { ProviderAccessCreateComponent } from './provider-access-create-form/provider-access-create-form';
import { ProviderGovernanceComponent } from './provider-governance/provider-governance';
import { SuperAdminConsoleComponent } from './super-admin-console/super-admin-console';
import { ReconciliationComponent } from './reconciliation/reconciliation';
import { TransactionsComponent } from './transactions/transactions';
import { UserManagementComponent } from './user-management/user-management';
import { DataConnectorsComponent } from './data-connectors/data-connectors';
import { SupplierPortalComponent } from './supplier-portal';
import { ApprovalQueueComponent } from './approval-queue';
import { OperationsCommandCenterComponent } from './operations-command-center/operations-command-center';
import { AdminPanelComponent } from './admin-panel/admin-panel';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: LoginComponent },
  { path: 'supplier-portal', component: SupplierPortalComponent },
  { path: 'approval-queue', component: ApprovalQueueComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'ap.process|ar.process|ap.read|ar.read' } },
  { path: 'operations-command-center', component: OperationsCommandCenterComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'entity.read' } },
  { path: 'entities', component: EntityShowcaseComponent, canActivate: [authGuard, superAdminGuard] },
  { path: 'entities/create', component: ClientCreationJourneyComponent, canActivate: [authGuard, superAdminGuard] },
  { path: 'models-quality', component: ModelsQualityComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'models.manage', menuKey: 'extraction' } },
  { path: 'document-classification', component: DocumentClassificationComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'classification.manage', menuKey: 'classification' } },
  { path: 'provider-governance', component: ProviderGovernanceComponent, canActivate: [authGuard] },
  { path: 'api-integrations', component: ApiIntegrationsComponent, canActivate: [authGuard] },
  { path: 'entity-dashboard', component: EntityDashboardComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'entity.read', menuKey: 'dashboard' } },
  { path: 'entity-governance', component: EntityDashboardComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'entity.read', menuKey: 'dashboard' } },
  { path: 'audit-logs', component: AuditLogsComponent, canActivate: [authGuard] },
  { path: 'reconciliation', component: ReconciliationComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'ap.process|ar.process|ap.read|ar.read', menuKey: 'reconciliation' } },
  { path: 'exception-queue', component: ExceptionQueueComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'ap.process|ar.process|ap.read|ar.read', menuKey: 'exceptions' } },
  { path: 'transactions', component: TransactionsComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'ap.process|ar.process|ap.read|ar.read', menuKey: 'transactions' } },
  { path: 'entity-audit-logs', component: EntityAuditLogsComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'reports.read', menuKey: 'audit' } },
  { path: 'user-management', component: UserManagementComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'users.manage', menuKey: 'users' } },
  { path: 'data-connectors', component: DataConnectorsComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'providers.manage', menuKey: 'connectors' } },
  { path: 'super-admin-console', component: SuperAdminConsoleComponent, canActivate: [authGuard] },
  { path: 'admin-panel', component: AdminPanelComponent, canActivate: [authGuard] },
  { path: 'entity-creation-settings', component: EntityCreationSettingsComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'entity.manage' } },
  { path: 'access-assignment', component: UserManagementComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'users.manage', menuKey: 'users' } },
  { path: 'provider-access-create-form', component: ProviderAccessCreateComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'providers.manage' } },
  { path: 'model-prompt-access-create-form', component: ModelPromptAccessComponent, canActivate: [authGuard, entityPermissionGuard], data: { permission: 'models.manage' } },
  { path: '**', redirectTo: 'login' }
];
