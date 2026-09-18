// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-super-admin-console',
  standalone: true,
  imports: [],
  templateUrl: './super-admin-console.html',
  styleUrl: './super-admin-console.css',
  encapsulation: ViewEncapsulation.None
})
export class SuperAdminConsoleComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
    var api = this.api;

    api.getTenant().subscribe({
      next: function(res) {
        var tenant = res.data && res.data[0];
        if (!tenant) return;
        
        var el = document.getElementById('tenantName');
        if (el) el.textContent = tenant.name || tenant.tenant_key || 'Unknown';

        var idEl = document.getElementById('tenantId');
        if (idEl) idEl.textContent = tenant.id;

        api.getEntities(tenant.id).subscribe({
          next: function(entRes) {
            var countEl = document.getElementById('entityCount');
            if (countEl) countEl.textContent = (entRes.data || []).length + ' entities';
          },
          error: function() {}
        });
      },
      error: function() {}
    });

    var healthBtn = document.getElementById('checkHealthBtn');
    if (healthBtn) {
      healthBtn.addEventListener('click', function() {
        fetch('http://0.0.0.0:8080/health')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            var el = document.getElementById('healthStatus');
            if (el) el.innerHTML = '<span style="color:#1a7a4a">&#10003; Backend OK &mdash; DB: ' + (data.database || 'connected') + '</span>';
          })
          .catch(function() {
            var el = document.getElementById('healthStatus');
            if (el) el.innerHTML = '<span style="color:#b91c1c">&#x26A0; Backend unavailable on port 7070</span>';
          });
      });
    }
  }
}
