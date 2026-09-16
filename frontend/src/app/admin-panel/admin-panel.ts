// @ts-nocheck
import { AfterViewInit, Component, ViewEncapsulation } from '@angular/core';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [],
  templateUrl: './admin-panel.html',
  styleUrl: './admin-panel.css',
  encapsulation: ViewEncapsulation.None
})
export class AdminPanelComponent implements AfterViewInit {
  tenantName = environment.TENANTNAME;
  ngAfterViewInit(): void {
    initTopBar();
  }
}
