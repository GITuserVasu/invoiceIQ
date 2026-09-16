// @ts-nocheck
import { AfterViewInit, Component, inject } from '@angular/core';
import { ApiService } from '../api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent implements AfterViewInit {
  private readonly api = inject(ApiService);

  ngAfterViewInit(): void {
    var api = this.api;

    /* ── Splash auto-dismiss ─────────────────────── */
    var splash = document.getElementById('splashOverlay');
    var progressBar = document.getElementById('splashProgress');
    var DURATION = 7000;
    var start = Date.now();

    function dismissSplash() {
      if (!splash) return;
      splash.classList.add('hiding');
      setTimeout(function() { splash.style.display = 'none'; }, 600);
    }

    var skipBtn = document.getElementById('splashSkipBtn');
    if (skipBtn) skipBtn.addEventListener('click', dismissSplash);

    if (progressBar) {
      var raf: any;
      function tick() {
        var elapsed = Date.now() - start;
        var pct = Math.min(elapsed / DURATION * 100, 100);
        progressBar.style.width = pct + '%';
        if (elapsed >= DURATION) { dismissSplash(); return; }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }

    function postLoginAudit(user: any, success: boolean, reason?: string) {
      api.getTenant().subscribe({
        next: (tenantResponse: any) => {
          var tenant = tenantResponse.data?.[0];
          if (!tenant) return;
          var action = success ? "user.login.success" : "user.login.failed";
          api.logAudit(tenant.id, action, "user", null, {
            email: user.email,
            role: user.role || "unknown",
            reason: reason || null
          }).subscribe({ error: function() {} });
        },
        error: function() {}
      });
    }

    document.getElementById("loginBtn").addEventListener("click", function () {
      var email = document.getElementById("email").value.trim().toLowerCase();
      var password = document.getElementById("password").value;
      var statusEl = document.getElementById("statusText");
      var btn = document.getElementById("loginBtn");

      if (!email || !password) {
        statusEl.textContent = "Please enter your email and password.";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Signing in...";
      statusEl.textContent = "";

      api.login(email, password).subscribe({
        next: function(response) {
          var user = Object.assign({}, response.user, { loginAt: new Date().toISOString() });
          localStorage.setItem("accessToken", response.accessToken);
          localStorage.setItem("authUser", JSON.stringify(user));
          localStorage.setItem("lx_current_user", JSON.stringify(user));
          // Store tenantId globally for use in other screens
          if (response.user.tenantId) {
            localStorage.setItem("lx_tenant_id", response.user.tenantId);
          }
          postLoginAudit(user, true);
          statusEl.textContent = "Login successful. Redirecting...";
          window.location.href = response.redirectTo;
        },
        error: function(err) {
          btn.disabled = false;
          btn.textContent = "Sign In";
          var msg = err?.error?.error || "Invalid email or password.";
          statusEl.textContent = msg;
          postLoginAudit({ email: email, role: "unknown" }, false, msg);
        }
      });
    });
  }
}
