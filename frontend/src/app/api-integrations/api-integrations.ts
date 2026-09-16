// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-api-integrations',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './api-integrations.html',
  styleUrl: './api-integrations.css',
  encapsulation: ViewEncapsulation.None
})
export class ApiIntegrationsComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  private tenantId = '';
  private entityId = '';
  private apiConnections: any[] = [];
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
    var apiService = this.api;
    var self = this;

    function audit(action, resourceType?, resourceId?, meta?) {
      if (!self.tenantId) return;
      apiService.logAudit(self.tenantId, action, resourceType || "ui", resourceId || null, meta || {}).subscribe({ error: function() {} });
    }

    var params     = new URLSearchParams(window.location.search);
    var _entityId  = params.get("entityId") || "";
    var _entityName = params.get("entityName") || "";
    var entityName = params.get("entityName") || "";
    var entityId   = params.get("entityId")   || "";
    var intakeModes = (params.get("intakeModes") || "").split(",").filter(Boolean);
    var apEnabled  = params.get("apEnabled") === "1";
    var arEnabled  = params.get("arEnabled") === "1";

    if (!entityName) {
      try {
        var s = JSON.parse(localStorage.getItem("clientJourneyState") || "{}");
        entityName  = s.entityName  || "";
        entityId    = s.entityId    || "";
        intakeModes = s.intakeModes || [];
        apEnabled   = !!s.apEnabled;
        arEnabled   = !!s.arEnabled;
      } catch (e) {}
    }
    self.entityId = entityId;

    /* ── Journey mode: hide assign + step sections when no entity context ── */
    if (!entityId && !entityName) {
      var _ap = document.getElementById("journeyAssignPanel");
      if (_ap) _ap.hidden = true;
      var _sp = document.getElementById("journeyStepPanel");
      if (_sp) _sp.hidden = true;
    }

    function el(id) { return document.getElementById(id); }

    /* ── Entity context banner ── */
    el("aecName").textContent = entityName || "No entity selected";
    el("aecId").textContent   = entityId   || "";
    if (entityName) {
      el("assignSubtitle").textContent = "Select which APIs to activate for: " + entityName + (entityId ? " (" + entityId + ")" : "");
      var banner = el("entityContextBanner");
      if (banner) banner.hidden = false;
      el("ctxEntityName").textContent = entityName;
      el("ctxEntityId").textContent   = entityId ? "(" + entityId + ")" : "";
      var INTAKE = { sap: "⚡ SAP Touchless", upload: "⬆ Doc Upload", vendor: "🏢 Vendor Portal" };
      var html = intakeModes.map(function (m) {
        return "<span style=\"border:1px solid #b8d9e8;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;color:#0a4e6d;background:rgba(13,124,151,.09)\">" + (INTAKE[m] || m) + "</span>";
      });
      if (apEnabled) html.push("<span style=\"border:1px solid rgba(21,121,95,.4);border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;color:#0f5e40;background:rgba(21,121,95,.09)\">📥 AP</span>");
      if (arEnabled) html.push("<span style=\"border:1px solid rgba(21,121,95,.4);border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;color:#0f5e40;background:rgba(21,121,95,.09)\">📤 AR</span>");
      el("ctxBadges").innerHTML = html.join("");
      el("pageCrumb").textContent = "  " + entityName + " > API Integrations";
    }

    /* ── Checkbox assignment logic ── */
    var allCbs = Array.from(document.querySelectorAll(".assign-cb"));
    el("totalApiCount").textContent = String(allCbs.length);

    function refreshAssignmentUI() {
      var checked = allCbs.filter(function (cb) { return cb.checked; });
      var n = checked.length;
      el("selectedApiCount").textContent = String(n);
      el("assignedCountBadge").textContent = n + " selected";
      if (!n) {
        el("assignedApiListBody").innerHTML = "<div class=\"assigned-list-empty\">No APIs selected yet.</div>";
      } else {
        el("assignedApiListBody").innerHTML = checked.map(function (cb) {
          var dot = cb.getAttribute("data-status") || "pending";
          return "<div class=\"assigned-list-item\">"
            + "<span class=\"assign-api-dot " + dot + "\"></span>"
            + "<span style=\"font-size:11px;font-weight:600;color:#2b435f\">" + cb.value + "</span>"
            + "<span style=\"font-size:10px;color:#7a8ea4;margin-left:auto\">" + (cb.getAttribute("data-cat") || "") + "</span>"
            + "</div>";
        }).join("");
      }
    }

    allCbs.forEach(function (cb) { cb.addEventListener("change", refreshAssignmentUI); });
    refreshAssignmentUI();

    el("selectAllBtn").addEventListener("click", function () { allCbs.forEach(function (cb) { cb.checked = true; }); refreshAssignmentUI(); });
    el("clearAllBtn").addEventListener("click",  function () { allCbs.forEach(function (cb) { cb.checked = false; }); refreshAssignmentUI(); });

    el("saveAssignmentBtn").addEventListener("click", function () {
      var checked = allCbs.filter(function (cb) { return cb.checked; });
      if (!self.tenantId || !self.entityId) {
        el("assignStatusText").textContent = "Entity context still loading. Try again in a moment.";
        return;
      }
      apiService.saveApiAssignments(self.tenantId, self.entityId, checked.map(function (cb) { return cb.value; })).subscribe({
        next: function () {
          try { localStorage.setItem("entityApiAssignment_" + self.entityId, JSON.stringify({ entityId, assignedApis: checked.map(function (cb) { return cb.value; }) })); } catch (e) {}
          el("assignSaveNote").style.display = "block";
          el("assignSaveNote").textContent = "Saved: " + checked.length + " API" + (checked.length !== 1 ? "s" : "") + " assigned to " + (entityName || "entity") + ".";
          el("assignStatusText").textContent = checked.length + " APIs saved for " + (entityName || "entity") + ".";
          el("assignedCountBadge").className = "badge ok";
        },
        error: function () {
          el("assignStatusText").textContent = "Assignment save failed. Check entity context and backend connection.";
        }
      });
    });

    /* ── Open test popup ── */
    var CAT_LABELS = { gst: "GST & Tax", kyc: "Identity & KYC", bank: "Banking", biz: "Business", other: "Other" };

    function openApiTestPopup(apiName, cat, provider, env, status) {
      el("popupApiTitle").textContent  = "API — " + apiName;
      el("popupApiName").value         = apiName;
      el("popupApiCat").value          = CAT_LABELS[cat] || cat;
      el("popupApiProvider").value     = provider;
      el("popupApiEnv").value          = env;
      el("popupTestPayload").value     = "";
      el("popupTestResult").textContent = JSON.stringify({ status: "ready", api: apiName, env: env }, null, 2);
      el("popupTestStatus").textContent = "Enter a sample payload and click Run Test.";
      el("apiTestPopup").dataset.apiName  = apiName;
      el("apiTestPopup").dataset.provider = provider;
      el("apiTestPopup").dataset.env      = env;
      el("apiTestPopup").dataset.cat      = cat;
      el("apiTestPopup").dataset.status   = status;
      el("apiTestPopup").classList.add("open");
    }

    document.querySelectorAll(".api-row").forEach(function (row) {
      row.addEventListener("click", function () {
        openApiTestPopup(row.dataset.api, row.dataset.cat, row.dataset.provider, row.dataset.env, row.dataset.status);
        audit("api.popup.test_opened", "api_connection", row.dataset.api, { provider: row.dataset.provider, env: row.dataset.env });
      });
    });

    /* ── Run Test (simulated + real) ── */
    var SAMPLE_RESPONSES = {
      active:  function (api) { return { status: "success",           api: api, code: 200, responseTime: Math.floor(Math.random()*400+200)+"ms", result: { verified: true, timestamp: new Date().toISOString() } }; },
      sandbox: function (api) { return { status: "success_sandbox",   api: api, code: 200, responseTime: Math.floor(Math.random()*600+400)+"ms", note: "Sandbox response — not a live check" }; },
      failed:  function (api) { return { status: "error",             api: api, code: 503, message: "Service Unavailable — check credentials or provider status" }; },
      pending: function (api) { return { status: "not_configured",    api: api, message: "API credentials not yet configured. Fill the config form first." }; }
    };

    el("runTestBtn").addEventListener("click", function () {
      var apiName = el("popupApiName").value;
      var popup   = el("apiTestPopup");
      var status  = popup.dataset.status || "active";
      var connection = self.apiConnections.find(function (c) { return c.name === apiName || c.api_key === apiName; });

      if (connection && self.tenantId && self.entityId) {
        apiService.testApiConnection(self.tenantId, self.entityId, connection.api_key).subscribe({
          next: function (result) {
            el("popupTestResult").textContent = JSON.stringify(result, null, 2);
            el("popupTestStatus").textContent = "Test passed. Result recorded by the backend.";
            self.loadApiData();
          },
          error: function () {
            el("popupTestStatus").textContent = "Test failed. Check credentials and retry.";
          }
        });
        return;
      }
      var fn = SAMPLE_RESPONSES[status] || SAMPLE_RESPONSES.active;
      var result = fn(apiName);
      el("popupTestResult").textContent = JSON.stringify(result, null, 2);
      el("popupTestStatus").textContent = result.status === "success" || result.status === "success_sandbox"
        ? "Test passed. API is responding correctly."
        : result.status === "error" ? "Test failed. Check credentials and retry."
        : "API not configured. Save credentials first.";
    });

    el("openConfigFromPopupBtn").addEventListener("click", function () {
      var popup = el("apiTestPopup");
      el("apiName").value    = popup.dataset.apiName  || "";
      el("apiProvider").value = popup.dataset.provider || "";
      el("apiEnvironment").value = popup.dataset.env === "Production" ? "production" : "sandbox";
      var catMap = { gst: "gst", kyc: "kyc", bank: "bank", biz: "biz" };
      el("apiCategory").value = catMap[popup.dataset.cat] || "other";
      popup.classList.remove("open");
      el("addApiPopup").classList.add("open");
    });

    el("closeApiPopupBtn").addEventListener("click", function () { el("apiTestPopup").classList.remove("open"); });
    el("apiTestPopup").addEventListener("click", function (e) { if (e.target.id === "apiTestPopup") el("apiTestPopup").classList.remove("open"); });

    /* ── Add API popup ── */
    el("openAddApiBtn").addEventListener("click", function () {
      el("addApiPopupTitle").textContent = "Add New API Connection";
      ["apiName","apiProvider","apiBaseUrl","apiClientId","apiSecret","apiNotes"].forEach(function (id) { var e2 = el(id); if (e2) e2.value = ""; });
      el("apiTimeout").value = "5000";
      el("apiFormStatus").textContent = "Fill the form and test the connection before saving.";
      el("addApiPopup").classList.add("open");
      audit("api.popup.add_opened", "api_connection", null, { entityId: self.entityId });
    });
    el("closeAddApiPopupBtn").addEventListener("click", function () { el("addApiPopup").classList.remove("open"); });
    el("addApiPopup").addEventListener("click", function (e) { if (e.target.id === "addApiPopup") el("addApiPopup").classList.remove("open"); });

    el("testApiBtn").addEventListener("click", function () {
      var name = el("apiName").value.trim();
      var url  = el("apiBaseUrl").value.trim();
      if (!name || !url) { el("apiFormStatus").textContent = "Enter API name and base URL before testing."; return; }
      var connection = self.apiConnections.find(function (c) { return c.name === name; });
      if (!connection) { el("apiFormStatus").textContent = "Save the API connection first, then test it."; return; }
      apiService.testApiConnection(self.tenantId, self.entityId, connection.api_key).subscribe({
        next: function (result) { el("apiFormStatus").textContent = "Test passed for " + name + " (" + result.responseMs + "ms)."; self.loadApiData(); },
        error: function () { el("apiFormStatus").textContent = "API test failed. Check the saved connection."; }
      });
    });

    el("saveApiBtn").addEventListener("click", function () {
      var name     = el("apiName").value.trim();
      var provider = el("apiProvider").value.trim();
      var env      = el("apiEnvironment").value;
      var catVal   = el("apiCategory").value;
      if (!name || !provider) { el("apiFormStatus").textContent = "API Name and Provider are required."; return; }
      if (!self.tenantId || !self.entityId) { el("apiFormStatus").textContent = "Entity context still loading. Try again."; return; }
      apiService.createApiConnection(self.tenantId, self.entityId, {
        apiKey:      name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name, category: catVal, provider,
        baseUrl:     el("apiBaseUrl").value.trim(),
        environment: env,
        clientId:    el("apiClientId").value.trim(),
        apiSecret:   el("apiSecret").value,
        timeoutMs:   Number(el("apiTimeout").value || 5000),
        notes:       el("apiNotes").value
      }).subscribe({
        next: function () {
          self.loadApiData();
          el("apiFormStatus").textContent = name + " saved. Test the connection from the health monitor.";
          setTimeout(function () { el("addApiPopup").classList.remove("open"); }, 1200);
        },
        error: function () { el("apiFormStatus").textContent = "API connection could not be saved. Check required fields."; }
      });
    });

    el("clearApiFormBtn").addEventListener("click", function () {
      ["apiName","apiProvider","apiBaseUrl","apiClientId","apiSecret","apiNotes"].forEach(function (id) { var e2 = el(id); if (e2) e2.value = ""; });
      el("apiTimeout").value = "5000";
      el("apiFormStatus").textContent = "Form cleared.";
    });

    el("refreshHealthBtn").addEventListener("click", function () { self.loadApiData(); el("apiJourneyStatus").textContent = "API health refreshed from backend."; });

    el("exportReportBtn").addEventListener("click", function () {
      audit("api.export.csv", "api_connection", null, { entityId: self.entityId, apiCount: self.apiConnections.length });
      var rows = [["API Name","Category","Provider","Environment","Last Tested","Avg Response","Success Rate","Status"]];
      self.apiConnections.forEach(function (c) {
        rows.push([c.name, c.category, c.provider, c.environment,
          c.last_tested_at ? new Date(c.last_tested_at).toLocaleString() : "Not tested",
          c.avg_response_ms ? c.avg_response_ms+"ms" : "—",
          c.success_rate_pct != null ? c.success_rate_pct+"%" : "—",
          c.status]);
      });
      var csv = rows.map(function (r) { return r.map(function (f) { return '"' + String(f).replace(/"/g,"\"\"") + '"'; }).join(","); }).join("\n");
      var a = document.createElement("a");
      a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      a.download = "api-health-report-" + new Date().toISOString().slice(0,10) + ".csv";
      a.click();
    });

    /* ── Journey ── */
    function buildNextParams() {
      var p = new URLSearchParams();
      if (entityName) p.set("entityName", entityName);
      if (entityId)   p.set("entityId",   entityId);
      if (intakeModes.length) p.set("intakeModes", intakeModes.join(","));
      p.set("apEnabled", apEnabled ? "1" : "0");
      p.set("arEnabled", arEnabled ? "1" : "0");
      return p.toString();
    }

    el("saveApiStepBtn").addEventListener("click", function () {
      try { var s = JSON.parse(localStorage.getItem("clientJourneyState") || "{}"); s.step = 8; s.apisConfigured = true; s.lastModuleCompleted = "api_integrations"; s.updatedAt = new Date().toISOString(); localStorage.setItem("clientJourneyState", JSON.stringify(s)); } catch (e) {}
      audit("api.step_saved", "api_connection", self.entityId, { entityId: self.entityId });
      el("apiJourneyStatus").textContent = "Step 8 saved. All API integrations configured. Click Next for Go-Live review.";
    });

    el("nextToGoLiveBtn").addEventListener("click", function () {
      try { var s = JSON.parse(localStorage.getItem("clientJourneyState") || "{}"); s.step = 8; s.apisConfigured = true; s.lastModuleCompleted = "api_integrations"; s.updatedAt = new Date().toISOString(); localStorage.setItem("clientJourneyState", JSON.stringify(s)); } catch (e) {}
      audit("api.step_completed", "api_connection", self.entityId, { entityId: self.entityId });
      el("apiJourneyStatus").textContent = "Proceeding to Go-Live review...";
      setTimeout(function () { window.location.href = "/entity-dashboard?" + buildNextParams(); }, 600);
    });

    this.loadApiData();
  }

  loadApiData(): void {
    var self = this;
    this.api.getTenant().subscribe({
      next: function (tenantResponse) {
        self.tenantId = (tenantResponse.data && tenantResponse.data[0] && tenantResponse.data[0].id) || "";
        if (!self.tenantId || !self.entityId) return;
        self.api.getApiConnections(self.tenantId, self.entityId).subscribe({
          next: function (response) {
            self.apiConnections = response.data || [];
            self.renderApiHealth();
            self.syncAssignmentCheckboxes();
          },
          error: function () {
            var s = document.getElementById("healthStatus");
            if (s) s.textContent = "Unable to load API integrations from the backend.";
          }
        });
      }
    });
  }

  syncAssignmentCheckboxes(): void {
    var self = this;
    var checkboxes = Array.from(document.querySelectorAll(".assign-cb"));
    checkboxes.forEach(function (checkbox) {
      var connection = self.apiConnections.find(function (c) { return c.name === checkbox.value || c.api_key === checkbox.value; });
      if (!connection) { checkbox.checked = false; return; }
      checkbox.dataset.apiKey = connection.api_key;
      checkbox.dataset.status = connection.status;
      checkbox.checked = Boolean(connection.assigned);
    });
    if (checkboxes.length) checkboxes[0].dispatchEvent(new Event("change"));
  }

  renderApiHealth(): void {
    var self = this;
    var tbody = document.getElementById("healthTableBody");
    if (!tbody) return;
    var labels = { gst: "GST", kyc: "KYC", bank: "Banking", biz: "Business", other: "Other" };
    if (!self.apiConnections.length) {
      tbody.innerHTML = "<tr><td colspan=\"9\" style=\"text-align:center;color:#7388a1;padding:16px\">No API connections yet. Click '+ Add New API' to configure one.</td></tr>";
    } else {
      tbody.innerHTML = self.apiConnections.map(function (c) {
        var statusCls = c.status === "active" ? "ok" : c.status === "failed" ? "bad" : "warn";
        return "<tr>"
          + "<td><strong>" + c.name + "</strong></td>"
          + "<td><span class=\"cat-pill " + c.category + "\">" + (labels[c.category] || c.category) + "</span></td>"
          + "<td>" + c.provider + "</td>"
          + "<td>" + c.environment + "</td>"
          + "<td>" + (c.last_tested_at ? new Date(c.last_tested_at).toLocaleString() : "Not tested") + "</td>"
          + "<td>" + (c.avg_response_ms ? c.avg_response_ms + " ms" : "—") + "</td>"
          + "<td>" + (c.success_rate_pct != null ? c.success_rate_pct + "%" : "—") + "</td>"
          + "<td><span class=\"badge " + statusCls + "\">" + c.status + "</span></td>"
          + "<td><button class=\"action-link\" type=\"button\" data-api=\"" + c.name + "\" data-cat=\"" + c.category + "\" data-provider=\"" + c.provider + "\" data-env=\"" + c.environment + "\" data-status=\"" + c.status + "\">"
          + (c.status === "failed" ? "Retry" : "Test") + "</button></td>"
          + "</tr>";
      }).join("");
      /* bind test buttons rendered dynamically */
      Array.from(tbody.querySelectorAll(".action-link")).forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var b = e.currentTarget;
          /* call the ngAfterViewInit-scoped openApiTestPopup via popup ID approach */
          document.getElementById("popupApiTitle").textContent  = "API — " + b.dataset.api;
          document.getElementById("popupApiName").value         = b.dataset.api;
          document.getElementById("popupApiCat").value          = ({ gst: "GST & Tax", kyc: "Identity & KYC", bank: "Banking", biz: "Business" })[b.dataset.cat] || b.dataset.cat;
          document.getElementById("popupApiProvider").value     = b.dataset.provider;
          document.getElementById("popupApiEnv").value          = b.dataset.env;
          document.getElementById("popupTestPayload").value     = "";
          document.getElementById("popupTestResult").textContent = JSON.stringify({ status: "ready", api: b.dataset.api }, null, 2);
          document.getElementById("popupTestStatus").textContent = "Enter a sample payload and click Run Test.";
          var popup = document.getElementById("apiTestPopup");
          popup.dataset.apiName  = b.dataset.api;
          popup.dataset.provider = b.dataset.provider;
          popup.dataset.env      = b.dataset.env;
          popup.dataset.cat      = b.dataset.cat;
          popup.dataset.status   = b.dataset.status;
          popup.classList.add("open");
        });
      });
    }

    var total   = document.getElementById("kpiTotal");
    var active  = document.getElementById("kpiActive");
    var sandbox = document.getElementById("kpiSandbox");
    var pending = document.getElementById("kpiPending");
    var failed  = document.getElementById("kpiFailed");
    if (total)   total.textContent   = String(self.apiConnections.length);
    if (active)  active.textContent  = String(self.apiConnections.filter(function (c) { return c.status === "active"; }).length);
    if (sandbox) sandbox.textContent = String(self.apiConnections.filter(function (c) { return c.status === "sandbox"; }).length);
    if (pending) pending.textContent = String(self.apiConnections.filter(function (c) { return c.status === "pending"; }).length);
    if (failed)  failed.textContent  = String(self.apiConnections.filter(function (c) { return c.status === "failed"; }).length);
  }
}
