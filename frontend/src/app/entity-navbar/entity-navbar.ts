// @ts-nocheck
import { OnInit, AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { EntityAccessService } from '../entity-access.service';

//const BACKEND = 'http://127.0.0.1:8080';
const BACKEND = '';

@Component({
  selector: 'app-entity-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './entity-navbar.html',
  styleUrl: './entity-navbar.css',
  encapsulation: ViewEncapsulation.None
})
export class EntityNavbarComponent implements OnInit {
  private http = inject(HttpClient);
  private access = inject(EntityAccessService);

  //added
  private isMenuLoaded = false;
  //add ends

  //ngAfterViewInit(): void {
  ngOnInit(): void {
    // Wrap the ENTIRE logic of this function inside a 10ms timeout
    //setTimeout(() => {
    const params     = new URLSearchParams(window.location.search);
    const entityId   = params.get('entityId')   || '';
    const entityName = params.get('entityName') || '';
    const tenantId   = params.get('tenantId')   || '';
    const qs = (entityId || entityName)
      ? '?entityId=' + encodeURIComponent(entityId)
        + '&entityName=' + encodeURIComponent(entityName)
        + (tenantId ? '&tenantId=' + encodeURIComponent(tenantId) : '')
      : '';

    // -- Active nav links ---------------------------------------------------
    const currentPath = window.location.pathname;
    document.querySelectorAll('[data-route]').forEach((el: any) => {
      const route = el.getAttribute('data-route');
      el.setAttribute('href', route + qs);
      if (currentPath === route || currentPath.startsWith(route + '/')) {
        el.classList.add('active');
      }
    });

    const settingsGroup = document.querySelector('[data-settings-menu]') as HTMLElement | null;
    const settingsButton = settingsGroup?.querySelector('.entity-menu-parent') as HTMLButtonElement | null;
    const settingsIsActive = currentPath === '/data-connectors'
      || currentPath.startsWith('/data-connectors/')
      || currentPath === '/exception-queue'
      || currentPath.startsWith('/exception-queue/');
    if (settingsGroup && settingsButton) {
      if (settingsIsActive) settingsGroup.classList.add('active');
      settingsButton.setAttribute('aria-expanded', String(settingsIsActive));

      // Added
      // ✅ SIMPLIFIED: No calculations, no window scroll/resize listener bombs
      settingsButton.addEventListener('click', () => {
        const isOpen = settingsGroup.classList.toggle('open');
        settingsButton.setAttribute('aria-expanded', String(isOpen));
      });
      // Add ends


      const submenu = settingsGroup.querySelector('.entity-submenu') as HTMLElement | null;
      // const positionSubmenu = () => {
      //   if (!submenu || !settingsGroup.classList.contains('open')) return;
      //   const rect = settingsButton.getBoundingClientRect();
      //   submenu.style.top = `${rect.bottom + 6}px`;
      //   submenu.style.left = 'auto';
      //   submenu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
      // };
      settingsButton.addEventListener('click', () => {
        const isOpen = settingsGroup.classList.toggle('open');
        settingsButton.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) positionSubmenu();
      });
      //window.addEventListener('resize', positionSubmenu);
      // window.addEventListener('scroll', positionSubmenu, true);
    }

    // -- Logout button ------------------------------------------------------
    const btn = document.getElementById('entityLogoutBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('authUser');
        localStorage.removeItem('lx_current_user');
        window.location.href = '/login';
      });
    }

    // -- Super admin bar ----------------------------------------------------
    let authUser: any = null;
    try {
      authUser = JSON.parse(localStorage.getItem('authUser') || localStorage.getItem('lx_current_user') || 'null');
    } catch { /* ignored */ }

    const isSuperAdmin = authUser?.role === 'super_admin';
    if (!isSuperAdmin && entityId && tenantId) {
      //added
      if (!this.isMenuLoaded) {
        this.isMenuLoaded = true; // Block subsequent structural passes instantly
        // add ends
        document.querySelectorAll('[data-route]').forEach((element: any) => {
          if (element.getAttribute('data-route') !== '/entity-dashboard') element.hidden = true;
        });
        const settings = document.querySelector('[data-settings-menu]') as HTMLElement | null;
        if (settings) settings.hidden = true;
        const emailQuery = authUser?.email
          ? `?userEmail=${encodeURIComponent(authUser.email)}`
          : '';
        this.http.get<any>(
          `${BACKEND}/api/v1/tenants/${encodeURIComponent(tenantId)}/entities/${encodeURIComponent(entityId)}/menu${emailQuery}`
        ).subscribe({
          next: (response) => {
            this.access.setPermissions(response.permissions || []);
            this.applyPermissionMenu(response.menu || []);
          },
          error: () => this.applyPermissionMenu([{ key: 'dashboard', visible: true }])
        });
      }
    }
    const saBar = document.getElementById('saAdminBar');
    if (isSuperAdmin && saBar) {
      saBar.style.display = 'flex';

      const saLabel = document.getElementById('saEntityLabel');
      if (saLabel) saLabel.textContent = entityName || entityId || '';

      const saAllEntities = document.getElementById('saAllEntitiesLink') as HTMLAnchorElement;
      if (saAllEntities) saAllEntities.href = '/entities';

      // Helper: get auth headers
      const authHeaders = () => {
        const token = localStorage.getItem('accessToken') || '';
        return new HttpHeaders({ 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' });
      };

      // Resolve tenant once then wire buttons
      this.http.get<any>(`${BACKEND}/api/v1/tenants`, { headers: authHeaders() }).subscribe({
        next: (res) => {
          const tid = res.data?.[0]?.id || tenantId;
          if (!tid || !entityId) return;

          // Seed Demo Data
          const seedBtn = document.getElementById('saSeedBtn');
          if (seedBtn) {
            seedBtn.addEventListener('click', () => {
              if (!confirm('Seed demo AP data (vendors, POs, GRNs, invoices) into ' + (entityName || entityId) + '?')) return;
              seedBtn.textContent = 'Seeding...';
              (seedBtn as HTMLButtonElement).disabled = true;
              this.http.post(`${BACKEND}/api/v1/tenants/${tid}/entities/${entityId}/seed-demo-data`, {},
                { headers: authHeaders() }).subscribe({
                next: (r: any) => {
                  seedBtn.textContent = '&#9654; Seed Demo Data';
                  (seedBtn as HTMLButtonElement).disabled = false;
                  alert('Demo data seeded: ' + (r.message || JSON.stringify(r)));
                },
                error: (e) => {
                  seedBtn.textContent = '&#9654; Seed Demo Data';
                  (seedBtn as HTMLButtonElement).disabled = false;
                  alert('Seed failed: ' + (e?.error?.error || 'Server error'));
                }
              });
            });
          }

          // Run Match Engine
          const matchBtn = document.getElementById('saMatchBtn');
          if (matchBtn) {
            matchBtn.addEventListener('click', () => {
              matchBtn.textContent = 'Running...';
              (matchBtn as HTMLButtonElement).disabled = true;
              this.http.post(`${BACKEND}/api/v1/tenants/${tid}/entities/${entityId}/match/run`, {},
                { headers: authHeaders() }).subscribe({
                next: (r: any) => {
                  matchBtn.textContent = '&#9881; Run Match';
                  (matchBtn as HTMLButtonElement).disabled = false;
                  const s = r.summary || {};
                  alert(`Match complete: ${s.matched || 0} matched, ${s.partial || 0} partial, ${s.unmatched || 0} unmatched out of ${s.total || 0}`);
                },
                error: (e) => {
                  matchBtn.textContent = '&#9881; Run Match';
                  (matchBtn as HTMLButtonElement).disabled = false;
                  alert('Match failed: ' + (e?.error?.error || 'Server error'));
                }
              });
            });
          }

          // Archive Entity
          const archBtn = document.getElementById('saArchiveBtn');
          if (archBtn) {
            archBtn.addEventListener('click', () => {
              if (!confirm('Archive entity ' + (entityName || entityId) + '? This will disable all access.')) return;
              this.http.delete(`${BACKEND}/api/v1/tenants/${tid}/entities/${entityId}`,
                { headers: authHeaders() }).subscribe({
                next: () => { alert('Entity archived.'); window.location.href = '/entities'; },
                error: (e) => { alert('Archive failed: ' + (e?.error?.error || 'Server error')); }
              });
            });
          }
        },
        error: () => { /* silently ignore if tenant lookup fails */ }
      });
      }
    //}, 10);
  }

  private applyPermissionMenu(menu: any[]): void {
    const visible = new Set(
      menu.filter((item) => item.visible !== false).map((item) => item.key)
    );
    const routeKeys: Record<string, string> = {
      '/entity-dashboard': 'dashboard',
      '/transactions': 'transactions',
      '/reconciliation': 'reconciliation',
      '/entity-audit-logs': 'audit',
      '/user-management': 'users',
      '/data-connectors': 'connectors',
      '/exception-queue': 'exceptions'
    };
    document.querySelectorAll('[data-route]').forEach((element: any) => {
      const key = routeKeys[element.getAttribute('data-route')];
      if (key) element.hidden = !visible.has(key);
    });
    const settings = document.querySelector('[data-settings-menu]') as HTMLElement | null;
    if (settings) settings.hidden = !visible.has('connectors') && !visible.has('exceptions');
  }
}
