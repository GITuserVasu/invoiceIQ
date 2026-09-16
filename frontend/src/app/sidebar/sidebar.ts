// @ts-nocheck
import { Component, ViewEncapsulation, inject, computed } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';

/** Routes that belong to an entity workspace (not super-admin-only) */
const ENTITY_ROUTES = [
  '/entity-dashboard', '/transactions', '/reconciliation',
  '/exception-queue', '/approval-queue', '/entity-audit-logs',
  '/user-management', '/data-connectors', '/operations-command-center'
];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
  encapsulation: ViewEncapsulation.None
})
export class SidebarComponent {
  private readonly router = inject(Router);

  /** Reactive current URL — updates on every navigation */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );

  /** True when the current page is an entity-scoped route */
  readonly onEntityRoute = computed(() =>
    ENTITY_ROUTES.some(r => this.currentUrl().startsWith(r))
  );

  /** Show entity menu when: entity user OR super-admin navigated into an entity */
  readonly showEntityMenu = computed(() =>
    !this.isSuperAdmin() || this.onEntityRoute()
  );

  logout(): void {
    localStorage.clear();
    sessionStorage.clear();
    this.router.navigate(['/login']);
  }

  private getUser(): any {
    try { return JSON.parse(localStorage.getItem('authUser') || localStorage.getItem('lx_current_user') || '{}'); }
    catch { return {}; }
  }

  getUserName(): string {
    const u = this.getUser();
    return u.name || u.email || 'Admin User';
  }

  getUserRole(): string {
    const u = this.getUser();
    return u.role || 'Administrator';
  }

  getUserInitials(): string {
    const name = this.getUserName();
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

  getEntityName(): string {
    return localStorage.getItem('lx_entity_name') || 'Entity';
  }

  /** Build entity-scoped query params from localStorage context */
  entityParams(): Record<string, string> {
    const entityId   = localStorage.getItem('lx_entity_id')   || '';
    const entityName = localStorage.getItem('lx_entity_name') || '';
    const tenantId   = localStorage.getItem('lx_tenant_id')   || '';
    const p: Record<string, string> = {};
    if (entityId)   p['entityId']   = entityId;
    if (entityName) p['entityName'] = entityName;
    if (tenantId)   p['tenantId']   = tenantId;
    return p;
  }

  isSuperAdmin(): boolean {
    const u = this.getUser();
    return u.role === 'super_admin';
  }
}
