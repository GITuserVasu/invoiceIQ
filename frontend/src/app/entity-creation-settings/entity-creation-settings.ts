// @ts-nocheck
import { AfterViewInit, Component, ViewEncapsulation } from '@angular/core';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-entity-creation-settings',
  standalone: true,
  imports: [],
  templateUrl: './entity-creation-settings.html',
  styleUrl: './entity-creation-settings.css',
  encapsulation: ViewEncapsulation.None
})
export class EntityCreationSettingsComponent implements AfterViewInit {
  tenantName = environment.TENANTNAME;
  ngAfterViewInit(): void {
    initTopBar();

    var saveBtn = document.getElementById('saveDefaultsBtn');
    var toast = document.getElementById('ecs-toast');
    if (saveBtn && toast) {
      saveBtn.addEventListener('click', function() {
        toast.textContent = 'Defaults saved successfully.';
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 2800);
      });
    }
  }
}
