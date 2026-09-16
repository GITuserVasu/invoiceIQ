// @ts-nocheck
import { AfterViewInit, Component, ViewEncapsulation } from '@angular/core';
import { initTopBar } from '../shared/topbar';

@Component({
  selector: 'app-provider-access-create',
  standalone: true,
  imports: [],
  templateUrl: './provider-access-create-form.html',
  styleUrl: './provider-access-create-form.css',
  encapsulation: ViewEncapsulation.None
})
export class ProviderAccessCreateComponent implements AfterViewInit {
  ngAfterViewInit(): void {
    initTopBar();

    var submitBtn = document.getElementById('submitProviderBtn');
    var status = document.getElementById('providerCreateStatus');
    if (submitBtn && status) {
      submitBtn.addEventListener('click', function() {
        var name = (document.getElementById('providerName') as HTMLInputElement).value.trim();
        if (!name) { status.textContent = 'Provider name is required.'; status.className = 'pac-status error'; return; }
        status.textContent = 'Provider "' + name + '" created. Go to Provider Governance to assign it to an entity.';
        status.className = 'pac-status ok';
      });
    }
  }
}
