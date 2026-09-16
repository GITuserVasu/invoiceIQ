import { AfterViewInit, Component, ViewEncapsulation } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
  encapsulation: ViewEncapsulation.None
})
export class NavbarComponent implements AfterViewInit {
  ngAfterViewInit(): void {
    const btn = document.getElementById('logoutBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('authUser');
        localStorage.removeItem('lx_current_user');
        window.location.href = '/login';
      });
    }
  }
}
