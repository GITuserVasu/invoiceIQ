// @ts-nocheck
import { AfterViewInit, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-entity-showcase',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './entity-showcase.html',
  styleUrl: './entity-showcase.css'
})
export class EntityShowcaseComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
    document.getElementById("closeEntityCredentials")?.addEventListener("click", () => {
      document.getElementById("entityCredentialsOverlay")?.classList.add("hidden");
    });
    document.getElementById("entityCredentialsOverlay")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        (event.currentTarget as HTMLElement).classList.add("hidden");
      }
    });
(function () {
      var toggleButtons = document.querySelectorAll(".toggle-btn");
      var cardsView = document.getElementById("readinessCardsView");
      var tableView = document.getElementById("readinessTableView");

      /* ── View toggle ───────────────────────────────── */
      var switchView = function (targetView) {
        var showCards = targetView === "cards";
        cardsView.hidden = !showCards;
        tableView.hidden = showCards;
        toggleButtons.forEach(function (btn) {
          var isActive = btn.getAttribute("data-view") === targetView;
          btn.classList.toggle("active", isActive);
          btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
      };

      toggleButtons.forEach(function (btn) {
        btn.addEventListener("click", function () { switchView(btn.getAttribute("data-view")); });
      });

      /* ── Navigate to entity dashboard ─────────────── */
      var openDashboard = function (entityId, entityName, tenantId) {
        var params = new URLSearchParams();
        params.set("entityId", entityId || "");
        params.set("entityName", entityName || "");
        if (tenantId) params.set("tenantId", tenantId);
        window.location.href = "/entity-dashboard?" + params.toString();
      };

      document.querySelectorAll(".entity-link").forEach(function (card) {
        card.addEventListener("click", function (e) {
          if (e.target.closest(".icon-btn")) return;
          openDashboard(card.getAttribute("data-entity-id"), card.getAttribute("data-entity-name"), card.getAttribute("data-tenant-id"));
        });
        card.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDashboard(card.getAttribute("data-entity-id"), card.getAttribute("data-entity-name"), card.getAttribute("data-tenant-id"));
          }
        });
      });

      document.querySelectorAll(".entity-row-link").forEach(function (row) {
        row.addEventListener("click", function (e) {
          if (e.target.closest(".icon-btn")) return;
          openDashboard(row.getAttribute("data-entity-id"), row.getAttribute("data-entity-name"), row.getAttribute("data-tenant-id"));
        });
      });

      /* ── Filter logic ──────────────────────────────── */
      var filterSearch = document.getElementById("filterSearch");
      var filterStatus = document.getElementById("filterStatus");
      var filterRegion = document.getElementById("filterRegion");
      var filterIntake = document.getElementById("filterIntake");
      var filterCount  = document.getElementById("filterCount");

      function matches(el, search, status, region, intake) {
        var name   = (el.getAttribute("data-entity-name") || "").toLowerCase();
        var id     = (el.getAttribute("data-entity-id")   || "").toLowerCase();
        var eStatus = el.getAttribute("data-status") || "";
        var eRegion = el.getAttribute("data-region") || "";
        var eIntake = (el.getAttribute("data-intake") || "").split(",");

        if (search && !name.includes(search) && !id.includes(search)) return false;
        if (status && eStatus !== status) return false;
        if (region && eRegion !== region) return false;
        if (intake && eIntake.indexOf(intake) === -1) return false;
        return true;
      }

      function applyFilters() {
        var allCards = Array.from(document.querySelectorAll("#readinessCardsView .entity-card"));
        var allRows  = Array.from(document.querySelectorAll("#readinessTableView .entity-row-link"));
        var total    = allCards.length;
        var search = filterSearch.value.toLowerCase().trim();
        var status = filterStatus.value;
        var region = filterRegion.value;
        var intake = filterIntake.value;
        var visible = 0;

        allCards.forEach(function (card) {
          var show = matches(card, search, status, region, intake);
          card.style.display = show ? "" : "none";
          if (show) visible++;
        });

        allRows.forEach(function (row) {
          row.style.display = matches(row, search, status, region, intake) ? "" : "none";
        });

        filterCount.textContent = visible === total
          ? "Showing all " + total + " entities"
          : "Showing " + visible + " of " + total + " entities";
      }

      filterSearch.addEventListener("input",  applyFilters);
      filterStatus.addEventListener("change", applyFilters);
      filterRegion.addEventListener("change", applyFilters);
      filterIntake.addEventListener("change", applyFilters);

      applyFilters();
    })();
    this.loadEntities();
  }

  private _auditTenantId = '';

  private loadEntities(): void {
    this.api.getTenant().subscribe({
      next: (tenantResponse: any) => {
        var tenant = tenantResponse.data?.[0];
        if (!tenant) return;
        this._auditTenantId = tenant.id;
        this.api.getEntities(tenant.id).subscribe({
          next: (response: any) => {
            var entities = response.data || [];
            this.renderEntityCards(entities);
            this.renderEntityTable(entities);
            this.updateEntityKpis(entities);
            localStorage.setItem("lx_tenant_id", tenant.id);
            var filter = document.getElementById("filterSearch");
            if (filter) filter.dispatchEvent(new Event("input"));
            this.api.logAudit(tenant.id, 'entity.list.viewed', 'entity', null, { entityCount: entities.length }).subscribe({ error: () => {} });
          }
        });
      }
    });
  }

  private entityStatus(entity: any): { key: string; label: string; badge: string } {
    if (entity.status === "active") return { key: "go-live", label: "Active", badge: "ok" };
    if (entity.status === "suspended") return { key: "blocked", label: "Suspended", badge: "bad" };
    if (entity.status === "archived") return { key: "blocked", label: "Archived", badge: "bad" };
    return { key: "review", label: "Draft", badge: "warn" };
  }

  private readiness(entity: any): number {
    if (entity.status === "active") return 100;
    if (entity.status === "suspended") return 25;
    if (entity.status === "archived") return 0;
    return 50;
  }

  private renderEntityCards(entities: any[]): void {
    var container = document.getElementById("readinessCardsView");
    if (!container) return;
    var scopeAttribute = Array.from(container.attributes).find((attribute) => attribute.name.startsWith("_ngcontent-"))?.name;
    container.innerHTML = "";
    entities.forEach((entity) => {
      var status = this.entityStatus(entity);
      var readiness = this.readiness(entity);
      var region = String(entity.region_code || "—").toUpperCase();
      var intakeModes = Array.isArray(entity.intake_modes) ? entity.intake_modes : [];
      var card = document.createElement("article");
      card.className = "entity-card entity-link";
      card.dataset.entityId = entity.entity_key;
      card.dataset.entityName = entity.name;
      card.dataset.tenantId = entity.tenant_id || "";
      card.dataset.status = status.key;
      card.dataset.region = String(entity.region_code || "").toLowerCase();
      card.dataset.intake = intakeModes.join(",");
      card.tabIndex = 0;
      card.setAttribute("role", "link");
      card.setAttribute("aria-label", "Open " + entity.name + " dashboard");
      card.innerHTML =
        `<div class="entity-top"><div><h3 class="entity-title"></h3><p class="entity-meta"></p></div>` +
        `<div class="entity-head-right"><span class="tag ${status.badge}">${status.label}</span>` +
        `<div class="icon-actions"><button class="icon-btn edit" type="button" title="Edit Entity"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75l11-11.03-3.75-3.75L3 17.25zm17.71-10.04a1.41 1.41 0 0 0 0-1.99l-2.5-2.5a1.41 1.41 0 0 0-1.99 0l-1.83 1.83 3.75 3.75 1.99-1.83z"></path></svg></button>` +
        `<button class="icon-btn delete" type="button" title="Delete Entity"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z"></path></svg></button></div></div></div>` +
        `<div class="entity-credential-action"><button class="view-credentials-btn" type="button">View credentials</button></div>` +
        `<div class="mini-meta"><div class="info-row"><span>Users</span><strong>—</strong></div>` +
        `<div class="info-row"><span>Updated</span><strong>—</strong></div>` +
        `<div class="info-row readiness-cell"><span>Readiness</span><div class="readiness-wrap"><strong>${readiness}%</strong><div class="mini-bar"><div class="mini-bar-fill ${readiness > 75 ? "high" : readiness > 40 ? "mid" : "low"}" style="width:${readiness}%"></div></div></div></div>` +
        `<div class="info-row"><span>Approval</span><strong>—</strong></div></div>` +
        `<div class="service-row"><span class="service ${entity.accounts_payable_enabled ? "ok" : "warn"}">AP: ${entity.accounts_payable_enabled ? "Enabled" : "Off"}</span>` +
        `<span class="service ${entity.accounts_receivable_enabled ? "ok" : "warn"}">AR: ${entity.accounts_receivable_enabled ? "Enabled" : "Off"}</span>` +
        `<span class="service ${entity.rbac_enabled ? "ok" : "warn"}">RBAC: ${entity.rbac_enabled ? "Enabled" : "Off"}</span></div>` +
        `<div class="intake-row"><span class="intake-label">Intake</span><span class="intake-values"></span></div>`;
      var editButton = card.querySelector(".icon-btn.edit");
      editButton?.addEventListener("click", (event: Event) => {
        event.stopPropagation();
        const tid = entity.tenant_id || (this as any)._auditTenantId || localStorage.getItem("lx_tenant_id") || "";
        let url = "/entities/create?editEntityId=" + encodeURIComponent(entity.entity_key);
        if (tid) url += "&tenantId=" + encodeURIComponent(tid);
        window.location.href = url;
      });
      var deleteButton = card.querySelector(".icon-btn.delete");
      deleteButton?.addEventListener("click", (event: Event) => {
        event.stopPropagation();
        if (!confirm("Archive entity '" + entity.name + "'? This cannot be undone.")) return;
        var currentTenantId = localStorage.getItem("lx_tenant_id") || "";
        if (!currentTenantId) return;
        this.api.deleteEntity(currentTenantId, entity.entity_key).subscribe({
          next: function() {
            card.style.opacity = "0.4";
            card.style.pointerEvents = "none";
            var statusBadge = card.querySelector(".tag");
            if (statusBadge) { statusBadge.textContent = "Archived"; statusBadge.className = "tag bad"; }
          },
          error: function() { alert("Could not archive entity. Try again."); }
        });
      });
      var credentialsButton = card.querySelector(".view-credentials-btn");
      credentialsButton?.addEventListener("click", (event: Event) => {
        event.stopPropagation();
        this.showEntityCredentials(entity);
      });
      var title = card.querySelector(".entity-title");
      var meta = card.querySelector(".entity-meta");
      var strongs = card.querySelectorAll(".mini-meta strong");
      if (title) title.textContent = entity.name;
      if (meta) meta.textContent = `${entity.entity_key} · ${region}`;
      if (strongs[0]) strongs[0].textContent = entity.user_count != null ? String(entity.user_count) : "—";
      if (strongs[1]) strongs[1].textContent = entity.updated_at ? new Date(entity.updated_at).toLocaleDateString() : "—";
      if (strongs[2]) strongs[2].textContent = readiness + "%";
      if (strongs[3]) strongs[3].textContent = entity.rbac_enabled ? "RBAC" : "—";
      var intakeContainer = card.querySelector(".intake-values");
      intakeModes.forEach((mode: string) => {
        var badge = document.createElement("span");
        badge.className = "intake-badge " + mode;
        badge.textContent = mode === "sap" ? "SAP Touchless" : mode === "upload" ? "Document Upload" : mode === "vendor" ? "Vendor Portal" : mode;
        intakeContainer?.appendChild(badge);
      });
      this.applyComponentScope(card, scopeAttribute);
      container.appendChild(card);
    });
    this.bindEntityLinks();
  }

  private renderEntityTable(entities: any[]): void {
    var tbody = document.getElementById("readinessTableBody");
    if (!tbody) return;
    var scopeAttribute = Array.from(tbody.attributes).find((attribute) => attribute.name.startsWith("_ngcontent-"))?.name;
    tbody.innerHTML = "";
    entities.forEach((entity) => {
      var status = this.entityStatus(entity);
      var readiness = this.readiness(entity);
      var intakeModes = Array.isArray(entity.intake_modes) ? entity.intake_modes : [];
      var row = document.createElement("tr");
      row.className = "entity-row-link";
      row.dataset.entityId = entity.entity_key;
      row.dataset.entityName = entity.name;
      row.dataset.tenantId = entity.tenant_id || "";
      row.dataset.status = status.key;
      row.dataset.region = String(entity.region_code || "").toLowerCase();
      row.dataset.intake = intakeModes.join(",");
      row.innerHTML = `<td><strong></strong><br><small style="color:#7a90a8"></small></td>` +
        `<td></td><td></td><td>—</td><td><div class="readiness-wrap"><strong>${readiness}%</strong><div class="mini-bar" style="width:72px"><div class="mini-bar-fill ${readiness > 75 ? "high" : readiness > 40 ? "mid" : "low"}" style="width:${readiness}%"></div></div></div></td>` +
        `<td>${intakeModes.length ? intakeModes.join(", ") : "Not configured"}</td><td><span class="tag ${status.badge}">${status.label}</span></td><td>Open</td>`;
      var cells = row.querySelectorAll("td");
      cells[0].querySelector("strong").textContent = entity.name;
      cells[0].querySelector("small").textContent = entity.industry_code || "—";
      cells[1].textContent = entity.entity_key;
      cells[2].textContent = String(entity.region_code || "—").toUpperCase();
      this.applyComponentScope(row, scopeAttribute);
      tbody.appendChild(row);
    });
    this.bindEntityLinks();
  }

  private updateEntityKpis(entities: any[]): void {
    var values = [
      entities.length,
      entities.filter((entity) => entity.status === "active").length,
      entities.filter((entity) => entity.status === "draft").length,
      entities.filter((entity) => entity.status === "suspended").length
    ];
    var kpis = document.querySelectorAll(".kpi-grid .kpi b");
    values.forEach((value, index) => {
      if (kpis[index]) kpis[index].textContent = String(value);
    });
    const sapKpi = document.getElementById("entityIntakeKpi");
    if (sapKpi) {
      const sapCount = entities.filter((e) => Array.isArray(e.intake_modes) && e.intake_modes.includes("sap")).length;
      sapKpi.textContent = String(sapCount);
    }
  }

  private showEntityCredentials(entity: any): void {
    const overlay = document.getElementById("entityCredentialsOverlay");
    const email = document.getElementById("credentialEmail");
    const password = document.getElementById("credentialPassword");
    const note = document.getElementById("credentialNote");
    if (!overlay || !email || !password || !note) return;

    let saved: any = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(`entityCredentials:${entity.entity_key}`) || "null");
    } catch {}

    email.textContent = saved?.email || entity.primary_admin_email || "Not configured";
    password.textContent = saved?.password || "Unavailable";
    note.textContent = saved?.password
      ? "These credentials were entered during the latest entity creation in this browser session. Share them securely."
      : "The password is not stored or recoverable after creation. Edit this entity, enter a new Primary Admin Password, and save to make it available in this browser session.";
    overlay.classList.remove("hidden");
  }

  private applyComponentScope(root: HTMLElement, scopeAttribute?: string): void {
    if (!scopeAttribute) return;
    root.setAttribute(scopeAttribute, "");
    root.querySelectorAll("*").forEach((element) => element.setAttribute(scopeAttribute, ""));
  }

  private bindEntityLinks(): void {
    document.querySelectorAll(".entity-link, .entity-row-link").forEach((element: Element) => {
      var open = () => {
        var entityId   = element.getAttribute("data-entity-id") || "";
        var entityName = element.getAttribute("data-entity-name") || "";
        var tenantId   = element.getAttribute("data-tenant-id") || localStorage.getItem("lx_tenant_id") || "";
        if (this._auditTenantId) {
          this.api.logAudit(this._auditTenantId, 'entity.dashboard.opened', 'entity', entityId, { entityName }).subscribe({ error: () => {} });
        }
        var params = new URLSearchParams();
        params.set("entityId", entityId);
        params.set("entityName", entityName);
        if (tenantId) params.set("tenantId", tenantId);
        window.location.href = "/entity-dashboard?" + params.toString();
      };
      element.addEventListener("click", (event: Event) => {
        if ((event.target as Element)?.closest(".icon-btn")) return;
        open();
      });
      element.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }
}
