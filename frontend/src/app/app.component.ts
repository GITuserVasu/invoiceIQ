import { Component, computed, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { LoadingService } from './loading.service';
import { SidebarComponent } from './sidebar/sidebar';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SidebarComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  readonly isLoading = inject(LoadingService).isLoading;
  private readonly router = inject(Router);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: window.location.pathname }
  );

  readonly showSidebar = computed(() => {
    const url = this.currentUrl() ?? '';
    return url.length > 1
      && !url.startsWith('/login')
      && !url.startsWith('/supplier-portal');
  });
}
