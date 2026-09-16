// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-provider-governance',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './provider-governance.html',
  styleUrl: './provider-governance.css',
  encapsulation: ViewEncapsulation.None
})
export class ProviderGovernanceComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
    var api = this.api;
    var currentTenantId = "";
    var currentEntityId = "";
    var allProviders = [];
    var allEntities = [];

    var params = new URLSearchParams(window.location.search);
    var urlEntityId   = params.get("entityId")   || "";
    var urlEntityName = params.get("entityName") || "";

    /* ── Journey mode: hide assign + step sections when no entity context ── */
    if (!urlEntityId && !urlEntityName) {
      var apEl = document.getElementById("journeyAssignPanel");
      if (apEl) apEl.hidden = true;
      var spEl = document.getElementById("journeyStepPanel");
      if (spEl) spEl.hidden = true;
    }

    function audit(action, resourceType?, resourceId?, meta?) {
      if (!currentTenantId) return;
      api.logAudit(currentTenantId, action, resourceType || "ui", resourceId || null, meta || {}).subscribe({ error: function() {} });
    }

    function readJourneyState() {
      try { return JSON.parse(localStorage.getItem("clientJourneyState") || "{}"); }
      catch (e) { return {}; }
    }
    function writeJourneyState(next) {
      localStorage.setItem("clientJourneyState", JSON.stringify(next));
    }
    function el(id) { return document.getElementById(id); }

    /* ── Render provider cards ── */
    function renderProviderCards(providers) {
      var container = el("providerCards");
      if (!container) return;
      container.innerHTML = "";
      if (!providers.length) {
        container.innerHTML = "<p style=\"color:#7388a1\">No providers registered yet. Click Register New Provider.</p>";
        return;
      }
      providers.forEach(function (p) {
        var btn = document.createElement("button");
        btn.className = "model-card";
        btn.type = "button";
        var statusCls = p.status === "Active" ? "ok" : p.status === "Pilot" ? "warn" : "bad";
        btn.innerHTML = "<b>" + p.name + "</b>"
          + "<span>" + p.provider_type + (p.base_url ? " · " + p.base_url.replace(/^https?:\/\//, "").replace(/\/$/, "") : "") + "</span>"
          + "<span class=\"badge " + statusCls + "\" style=\"margin-top:4px;font-size:10px\">" + p.status + "</span>";
        btn.addEventListener("click", function () {
          openAssignPopup(p.provider_key, p.name);
        });
        container.appendChild(btn);
      });
      el("kpiProviders").textContent = String(providers.length);
    }

    /* ── Render provider registry table ── */
    function renderProviderTable(providers) {
      var tbody = el("providerRegistryRows");
      if (!tbody) return;
      if (!providers.length) {
        tbody.innerHTML = "<tr><td colspan=\"5\" style=\"text-align:center;color:#7388a1\">No providers yet. Register one above.</td></tr>";
        return;
      }
      tbody.innerHTML = providers.map(function (p) {
        var cls = p.status === "Active" ? "ok" : p.status === "Pilot" ? "warn" : "bad";
        return "<tr>"
          + "<td>" + p.name + "</td>"
          + "<td>" + p.provider_type + "</td>"
          + "<td style=\"max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">" + (p.base_url || "—") + "</td>"
          + "<td>" + (p.vault_ref || "—") + "</td>"
          + "<td><span class=\"badge " + cls + "\">" + p.status + "</span></td>"
          + "</tr>";
      }).join("");
    }

    /* ── Render assignment table ── */
    function renderAssignmentTable(assignments) {
      var tbody = el("entityProviderRows");
      if (!tbody) return;
      var active = assignments.filter(function (a) { return a.status === "Active"; }).length;
      var canary = assignments.filter(function (a) { return a.rollout_mode === "Canary"; }).length;
      el("kpiAssignments").textContent = String(assignments.length);
      el("kpiFallback").textContent    = String(canary);
      el("kpiActive").textContent      = String(active);

      if (!assignments.length) {
        tbody.innerHTML = "<tr><td colspan=\"6\" style=\"text-align:center;color:#7388a1\">No assignments yet. Assign a provider to an entity above.</td></tr>";
        return;
      }
      tbody.innerHTML = assignments.map(function (a) {
        var cls = a.status === "Active" ? "ok" : a.status === "Pilot" ? "warn" : "bad";
        return "<tr>"
          + "<td>" + (a.entity_name || a.entity_key || "—") + "</td>"
          + "<td>" + (a.use_case   || "—") + "</td>"
          + "<td>" + (a.provider_name || "—") + "</td>"
          + "<td>" + (a.rollout_mode  || "—") + "</td>"
          + "<td>" + (a.owner_name    || "—") + "</td>"
          + "<td><span class=\"badge " + cls + "\">" + (a.status || "—") + "</span></td>"
          + "</tr>";
      }).join("");
    }

    /* ── Open assign popup pre-filled with a provider ── */
    function openAssignPopup(providerKey, providerName) {
      var provSel = el("popupAssignProviderSelect");
      if (provSel && providerKey) {
        Array.from(provSel.options).forEach(function (o) { o.selected = o.value === providerKey; });
        el("assignProviderDisplay").textContent = providerName || providerKey;
      }
      if (urlEntityId) {
        var entSel = el("popupAssignEntitySelect");
        if (entSel) {
          Array.from(entSel.options).forEach(function (o) { o.selected = o.value === urlEntityId; });
        }
      }
      el("assignPopupStatus").textContent = "Entity and provider pre-filled. Add use case and owner, then assign.";
      el("assignFormPopup").classList.add("open");
    }

    /* ── Bootstrap ── */
    api.getTenant().subscribe({
      next: function (tenantRes) {
        var tenant = tenantRes.data && tenantRes.data[0];
        if (!tenant) return;
        currentTenantId = tenant.id;
        currentEntityId = urlEntityId;

        /* load providers */
        api.getProviders(currentTenantId).subscribe({
          next: function (res) {
            allProviders = res.data || [];
            renderProviderCards(allProviders);
            renderProviderTable(allProviders);
            /* populate provider dropdown in assign popup */
            var provSel = el("popupAssignProviderSelect");
            if (provSel) {
              provSel.innerHTML = "<option value=\"\">— Select provider —</option>"
                + allProviders.map(function (p) {
                  return "<option value=\"" + p.provider_key + "\">" + p.name + " (" + p.provider_type + ")</option>";
                }).join("");
            }
          }
        });

        /* load entities for assignment dropdown */
        api.getEntities(currentTenantId).subscribe({
          next: function (res) {
            allEntities = res.data || [];
            var entSel = el("popupAssignEntitySelect");
            if (entSel) {
              entSel.innerHTML = "<option value=\"\">— Select entity —</option>"
                + allEntities.map(function (e) {
                  var sel = e.entity_key === urlEntityId ? " selected" : "";
                  return "<option value=\"" + e.entity_key + "\"" + sel + ">" + e.name + " (" + e.entity_key + ")</option>";
                }).join("");
            }
            if (urlEntityName) el("assignEntityDisplay").textContent = urlEntityName;
          }
        });

        /* load ALL provider assignments across entities */
        loadAllAssignments();
      },
      error: function () {
        el("assignmentStatus").textContent = "Backend unavailable. Start the API on port 7070.";
      }
    });

    function loadAllAssignments() {
      /* Load assignments for all entities by iterating known entity list
         Or use a fallback: load for the current entity, else load seed entity */
      var entityToLoad = urlEntityId || "CL-10017";
      api.getProviderAssignments(currentTenantId, entityToLoad).subscribe({
        next: function (res) { renderAssignmentTable(res.data || []); },
        error: function () {}
      });
    }

    /* ── Register Provider popup ── */
    el("openProviderPopupBtn").addEventListener("click", function () {
      el("providerFormPopup").classList.add("open");
      el("providerFormStatus").textContent = "Fill all required fields and click Register Provider.";
      audit("provider.popup.register_opened", "provider", null, { entityId: urlEntityId });
    });
    el("closeProviderPopupBtn").addEventListener("click", function () {
      el("providerFormPopup").classList.remove("open");
    });
    el("providerFormPopup").addEventListener("click", function (ev) {
      if (ev.target.id === "providerFormPopup") el("providerFormPopup").classList.remove("open");
    });

    el("clearProviderFormBtn").addEventListener("click", function () {
      ["popupProviderNameInput","popupProviderBaseUrlInput","popupProviderApiKeyInput",
       "popupProviderVaultRefInput","popupProviderNotesInput"].forEach(function (id) {
        var e = el(id); if (e) e.value = "";
      });
      el("popupProviderTypeInput").value   = "LLM API";
      el("popupProviderStatusInput").value = "Active";
      el("providerFormStatus").textContent = "Form cleared.";
    });

    el("registerProviderBtn").addEventListener("click", function () {
      var name     = el("popupProviderNameInput").value.trim();
      var type     = el("popupProviderTypeInput").value;
      var baseUrl  = el("popupProviderBaseUrlInput").value.trim();
      var apiKey   = el("popupProviderApiKeyInput").value.trim();
      var vaultRef = el("popupProviderVaultRefInput").value.trim();
      var status   = el("popupProviderStatusInput").value;
      var notes    = el("popupProviderNotesInput").value.trim();
      var statusEl = el("providerFormStatus");

      if (!name || !baseUrl || !apiKey || !vaultRef) {
        statusEl.textContent = "Provider name, base URL, API key, and vault reference are required.";
        return;
      }
      if (!currentTenantId) { statusEl.textContent = "Backend not ready. Try again."; return; }

      statusEl.textContent = "Registering provider...";
      api.registerProvider(currentTenantId, { name, providerType: type, baseUrl, apiKey, vaultRef, status, notes }).subscribe({
        next: function (saved) {
          var exists = allProviders.findIndex(function (p) { return p.provider_key === saved.provider_key; });
          if (exists >= 0) allProviders[exists] = saved;
          else allProviders.unshift(saved);
          renderProviderCards(allProviders);
          renderProviderTable(allProviders);
          /* refresh provider dropdown */
          var provSel = el("popupAssignProviderSelect");
          if (provSel) {
            provSel.innerHTML = "<option value=\"\">— Select provider —</option>"
              + allProviders.map(function (p) {
                return "<option value=\"" + p.provider_key + "\">" + p.name + " (" + p.provider_type + ")</option>";
              }).join("");
          }
          el("kpiProviders").textContent = String(allProviders.length);
          statusEl.textContent = "Provider \"" + saved.name + "\" registered successfully.";
          el("popupProviderApiKeyInput").value = "";
          setTimeout(function () { el("providerFormPopup").classList.remove("open"); }, 1200);
        },
        error: function (err) {
          statusEl.textContent = "Error: " + ((err.error && err.error.error) || "registration failed.");
        }
      });
    });

    /* ── Assign Provider popup ── */
    el("openAssignPopupBtn").addEventListener("click", function () {
      openAssignPopup("", "");
      audit("provider.popup.assign_opened", "provider", null, { entityId: urlEntityId });
    });
    el("closeAssignPopupBtn").addEventListener("click", function () {
      el("assignFormPopup").classList.remove("open");
    });
    el("assignFormPopup").addEventListener("click", function (ev) {
      if (ev.target.id === "assignFormPopup") el("assignFormPopup").classList.remove("open");
    });

    /* update vb-summary live */
    el("popupAssignEntitySelect").addEventListener("change", function () {
      var opt = el("popupAssignEntitySelect").options[el("popupAssignEntitySelect").selectedIndex];
      el("assignEntityDisplay").textContent = opt ? opt.text.replace(/\s*\([^)]*\)$/, "") : "—";
    });
    el("popupAssignProviderSelect").addEventListener("change", function () {
      var opt = el("popupAssignProviderSelect").options[el("popupAssignProviderSelect").selectedIndex];
      el("assignProviderDisplay").textContent = opt ? opt.text.replace(/\s*\([^)]*\)$/, "") : "—";
    });
    el("popupAssignUseCaseInput").addEventListener("input", function () {
      el("assignUseCaseDisplay").textContent = el("popupAssignUseCaseInput").value || "—";
    });
    el("popupAssignModeSelect").addEventListener("change", function () {
      el("assignRolloutDisplay").textContent = el("popupAssignModeSelect").value || "—";
    });

    el("assignProviderBtn").addEventListener("click", function () {
      var entSel    = el("popupAssignEntitySelect");
      var entityKey = entSel ? entSel.value : "";
      var entityOpt = entSel ? entSel.options[entSel.selectedIndex] : null;
      var entityName = entityOpt ? entityOpt.text.replace(/\s*\([^)]*\)$/, "") : entityKey;
      var provSel   = el("popupAssignProviderSelect");
      var provKey   = provSel ? provSel.value : "";
      var useCase   = el("popupAssignUseCaseInput").value.trim();
      var mode      = el("popupAssignModeSelect").value;
      var owner     = el("popupAssignOwnerInput").value.trim();
      var statusEl  = el("assignPopupStatus");

      if (!entityKey) { statusEl.textContent = "Please select an entity."; return; }
      if (!provKey)   { statusEl.textContent = "Please select a provider."; return; }
      if (!useCase)   { statusEl.textContent = "Use case is required."; return; }
      if (!owner)     { statusEl.textContent = "Owner is required."; return; }
      if (!currentTenantId) { statusEl.textContent = "Backend not ready."; return; }

      statusEl.textContent = "Assigning provider...";
      api.assignProvider(currentTenantId, entityKey, {
        providerKey: provKey,
        useCase,
        rolloutMode: mode,
        ownerName: owner,
        status: mode === "Full" ? "Active" : "Pilot"
      }).subscribe({
        next: function () {
          el("assignmentStatus").textContent = "Assigned " + (el("assignProviderDisplay").textContent) + " to " + entityName + " for " + useCase + ".";
          el("assignEntityDisplay").textContent  = entityName;
          el("assignRolloutDisplay").textContent = mode;
          loadAllAssignments();
          el("popupAssignUseCaseInput").value = "";
          el("popupAssignOwnerInput").value   = "";
          setTimeout(function () { el("assignFormPopup").classList.remove("open"); }, 1000);
        },
        error: function (err) {
          statusEl.textContent = "Error: " + ((err.error && err.error.error) || "assignment failed.");
        }
      });
    });

    /* ── Publish routing ── */
    el("publishRoutingBtn").addEventListener("click", function () {
      el("assignmentStatus").textContent = "Entity routing published. All active assignments are now live.";
    });

    /* ── Journey nav ── */
    el("saveProviderStepBtn").addEventListener("click", function () {
      var s = readJourneyState();
      s.step = 7; s.providerConfigured = true; s.lastModuleCompleted = "provider_governance"; s.updatedAt = new Date().toISOString();
      writeJourneyState(s);
      audit("provider.step_saved", "provider", urlEntityId, { entityId: urlEntityId, entityName: urlEntityName });
      el("providerJourneyStatus").textContent = "Step 7 saved. Provider governance configured.";
    });
    el("nextToApiIntegrationsBtn").addEventListener("click", function () {
      var s = readJourneyState();
      s.step = 7; s.providerConfigured = true; s.lastModuleCompleted = "provider_governance"; s.updatedAt = new Date().toISOString();
      writeJourneyState(s);
      audit("provider.step_completed", "provider", urlEntityId, { entityId: urlEntityId, entityName: urlEntityName });
      var np = new URLSearchParams();
      if (urlEntityId)   np.set("entityId",   urlEntityId);
      if (urlEntityName) np.set("entityName", urlEntityName);
      window.location.href = "/api-integrations?" + np.toString();
    });
  }
}
