// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

/* ── Action → Module + Severity + Result mapping ── */
var ACTION_META = {
  "entity.created":            { module: "Entity Management",  sev: "low",    result: "success", label: "Entity Created" },
  "entity.updated":            { module: "Entity Management",  sev: "medium", result: "success", label: "Entity Updated" },
  "entity.seeded":             { module: "Entity Management",  sev: "low",    result: "info",    label: "Entity Seeded" },
  "model.registered":          { module: "Classification",     sev: "low",    result: "success", label: "Model Registered" },
  "model.assigned":            { module: "Classification",     sev: "medium", result: "success", label: "Model Assigned" },
  "prompt_version.created":    { module: "Classification",     sev: "medium", result: "success", label: "Prompt Version Created" },
  "classification.configured": { module: "Classification",     sev: "low",    result: "success", label: "Classification Configured" },
  "classification.published":  { module: "Classification",     sev: "low",    result: "success", label: "Classification Published" },
  "classification.tested":     { module: "Classification",     sev: "low",    result: "info",    label: "Classification Tested" },
  "provider.registered":       { module: "API / Provider",     sev: "low",    result: "success", label: "Provider Registered" },
  "provider.assigned":         { module: "API / Provider",     sev: "medium", result: "success", label: "Provider Assigned" },
  "api_connection.created":    { module: "API / Provider",     sev: "low",    result: "success", label: "API Connection Created" },
  "api_connection.tested":     { module: "API / Provider",     sev: "low",    result: "info",    label: "API Connection Tested" },
  "api_assignment.saved":      { module: "API / Provider",     sev: "low",    result: "success", label: "API Assignment Saved" },
  "user.created":              { module: "User Management",    sev: "medium", result: "success", label: "User Created" },
  "user.role_changed":         { module: "User Management",    sev: "high",   result: "success", label: "Role Changed" },
  "policy.violation":          { module: "Governance",         sev: "high",   result: "fail",    label: "Policy Violation" },
  /* ── Frontend-tracked actions ── */
  "user.login.success":                   { module: "Authentication",    sev: "low",    result: "success", label: "Login Success" },
  "user.login.failed":                    { module: "Authentication",    sev: "medium", result: "fail",    label: "Login Failed" },
  "user.logout":                          { module: "Authentication",    sev: "low",    result: "info",    label: "Logout" },
  "entity.list.viewed":                   { module: "Entity Management", sev: "low",    result: "info",    label: "Entity List Viewed" },
  "entity.dashboard.viewed":              { module: "Entity Management", sev: "low",    result: "info",    label: "Dashboard Viewed" },
  "entity.dashboard.opened":              { module: "Entity Management", sev: "low",    result: "info",    label: "Dashboard Opened" },
  "entity.journey.started":              { module: "Entity Management", sev: "low",    result: "info",    label: "Journey Started" },
  "entity.journey.step_saved":            { module: "Entity Management", sev: "low",    result: "success", label: "Journey Step Saved" },
  "entity.journey.completed":             { module: "Entity Management", sev: "medium", result: "success", label: "Entity Journey Completed" },
  "entity.journey.updated":              { module: "Entity Management", sev: "medium", result: "success", label: "Entity Journey Updated" },
  "model.popup.register_opened":          { module: "Classification",    sev: "low",    result: "info",    label: "Register Model Opened" },
  "model.popup.version_opened":           { module: "Classification",    sev: "low",    result: "info",    label: "Create Version Opened" },
  "model.popup.assign_opened":            { module: "Classification",    sev: "low",    result: "info",    label: "Assign Model Opened" },
  "model.step_saved":                     { module: "Classification",    sev: "low",    result: "success", label: "Model Step Saved" },
  "model.step_completed":                 { module: "Classification",    sev: "low",    result: "success", label: "Model Step Completed" },
  "classification.popup.register_opened": { module: "Classification",    sev: "low",    result: "info",    label: "Register Class Model Opened" },
  "classification.popup.configure_opened":{ module: "Classification",    sev: "low",    result: "info",    label: "Configure Classification Opened" },
  "classification.step_saved":            { module: "Classification",    sev: "low",    result: "success", label: "Classification Step Saved" },
  "classification.step_completed":        { module: "Classification",    sev: "low",    result: "success", label: "Classification Completed" },
  "provider.popup.register_opened":       { module: "API / Provider",    sev: "low",    result: "info",    label: "Register Provider Opened" },
  "provider.popup.assign_opened":         { module: "API / Provider",    sev: "low",    result: "info",    label: "Assign Provider Opened" },
  "provider.step_saved":                  { module: "API / Provider",    sev: "low",    result: "success", label: "Provider Step Saved" },
  "provider.step_completed":              { module: "API / Provider",    sev: "low",    result: "success", label: "Provider Step Completed" },
  "api.popup.add_opened":                 { module: "API / Provider",    sev: "low",    result: "info",    label: "Add API Opened" },
  "api.popup.test_opened":                { module: "API / Provider",    sev: "low",    result: "info",    label: "Test API Opened" },
  "api.export.csv":                       { module: "Reporting",         sev: "low",    result: "info",    label: "CSV Exported" },
  "api.export.pdf":                       { module: "Reporting",         sev: "low",    result: "info",    label: "PDF Exported" },
  "api.export.pack":                      { module: "Reporting",         sev: "medium", result: "info",    label: "Audit Pack Generated" },
  "api.step_saved":                       { module: "API / Provider",    sev: "low",    result: "success", label: "API Step Saved" },
  "api.step_completed":                   { module: "API / Provider",    sev: "low",    result: "success", label: "API Step Completed" }
};

var SEV_MAP = {
  low:    '<span class="sev low">Low</span>',
  medium: '<span class="sev medium">Medium</span>',
  high:   '<span class="sev high">High</span>'
};

var RES_MAP = {
  success: '<span class="result-tag success">Success</span>',
  fail:    '<span class="result-tag fail">Blocked / Failed</span>',
  warn:    '<span class="result-tag warn">Warning</span>',
  info:    '<span class="result-tag info">Info</span>'
};

var DOT_MAP = { low: "ok", medium: "warn", high: "bad", success: "ok", fail: "bad", warn: "warn", info: "info" };

function getMeta(action) {
  return ACTION_META[action] || { module: "System", sev: "low", result: "info", label: action };
}

function fmtTs(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  var dd = String(d.getDate()).padStart(2, "0");
  var mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()];
  var hh = String(d.getHours()).padStart(2, "0");
  var mm = String(d.getMinutes()).padStart(2, "0");
  var ss = String(d.getSeconds()).padStart(2, "0");
  return dd + "-" + mon + "-" + d.getFullYear() + " " + hh + ":" + mm + ":" + ss;
}

function targetFromMeta(ev) {
  var m = ev.metadata || {};
  return m.apiName || m.providerName || m.displayName || m.versionTag
      || m.mappingKey || m.modelKey || m.entityKey
      || (ev.entity_name ? ev.entity_name + (ev.entity_key ? " (" + ev.entity_key + ")" : "") : "")
      || (ev.resource_id ? ev.resource_id.slice(0, 12) + "…" : "—");
}

function shortTrace(id) {
  if (!id) return "—";
  var parts = id.replace(/-/g, "").toUpperCase();
  return "TRC-" + parts.slice(0, 4) + "-" + parts.slice(4, 8);
}

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './audit-logs.html',
  styleUrl: './audit-logs.css',
  encapsulation: ViewEncapsulation.None
})
export class AuditLogsComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
    var apiService = this.api;
    var tenantId = "";
    var allEvents = [];
    var filteredEvents = [];
    var selectedIdx = -1;
    var PAGE_SIZE = 15;
    var currentPage = 0;

    /* ── Current user ── */
    var currentUser = { email: "", name: "", role: "staff" };
    try { currentUser = JSON.parse(localStorage.getItem("lx_current_user") || "{}"); } catch (e) {}
    var isAdmin = currentUser.role === "super_admin" || currentUser.role === "admin";

    function el(id) { return document.getElementById(id); }

    /* ── URL params ── */
    var params = new URLSearchParams(window.location.search);
    var entityName = params.get("entityName") || "";
    var entityId   = params.get("entityId")   || "";

    /* ── Header setup ── */
    el("entityRoleChip").textContent = isAdmin ? "Super Admin" : "Entity Admin";
    el("auditRolePill").textContent  = "Role: " + (isAdmin ? "Super Admin" : "Entity Admin");
    if (entityName) {
      el("entityCrumbName").textContent = entityName;
      el("ebName").textContent          = entityName;
      el("auditHeroTitle").textContent  = entityName + " — Audit Log";
      el("auditEntityPill").textContent = "Entity: " + entityName;
      el("ebSub").textContent = "Audit trail for " + entityName + (entityId ? " (" + entityId + ")" : "");
      var initials = entityName.split(/[\s-]+/).slice(0, 2).map(function (w) { return w[0] || ""; }).join("").toUpperCase() || "EN";
      el("ebIcon").textContent = initials;
    }
    if (entityId) el("ebEntityId").textContent = "Entity ID: " + entityId;

    /* ── Show/hide user filter ── */
    if (!isAdmin) el("userFilterWrap").style.display = "none";

    /* ── Build filters from form ── */
    function buildApiFilters() {
      var filters = { limit: 200 };
      var days = parseInt(el("filterDate").value || "7", 10);
      if (days > 0) {
        var from = new Date(); from.setDate(from.getDate() - days);
        filters.from = from.toISOString();
      }
      if (!isAdmin && currentUser.email) {
        filters.actorEmail = currentUser.email;
      } else if (isAdmin) {
        var uid = el("filterUser").value;
        if (uid) {
          if (uid.includes("@")) filters.actorEmail = uid;
          else filters.actorUserId = uid;
        }
      }
      var action = el("filterAction").value;
      if (action) filters.action = action;
      return filters;
    }

    /* ── Client-side filter on loaded events ── */
    function applyClientFilters() {
      var fModule   = el("filterModule").value.toLowerCase();
      var fSeverity = el("filterSeverity").value.toLowerCase();
      var fActor    = (el("filterActor").value || "").toLowerCase().trim();

      filteredEvents = allEvents.filter(function (ev) {
        var meta = getMeta(ev.action);
        if (fModule   && meta.module.toLowerCase().indexOf(fModule) < 0) return false;
        if (fSeverity && meta.sev !== fSeverity) return false;
        if (fActor) {
          var actorStr = ((ev.actor_name || "") + " " + (ev.actor_email || "")).toLowerCase();
          if (actorStr.indexOf(fActor) < 0) return false;
        }
        return true;
      });

      selectedIdx = -1;
      currentPage = 0;
      renderTable();
      updateKpis();
    }

    /* ── Render table (paginated) ── */
    function renderTable() {
      var tbody = el("auditTbody");
      if (!filteredEvents.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#9aafc4;padding:24px">No events match the current filters.</td></tr>';
        el("paginationInfo").textContent = "0 events";
        el("pageBtns").innerHTML = "";
        return;
      }
      var total = filteredEvents.length;
      var start = currentPage * PAGE_SIZE;
      var pageData = filteredEvents.slice(start, start + PAGE_SIZE);

      tbody.innerHTML = pageData.map(function (ev, i) {
        var meta   = getMeta(ev.action);
        var actor  = ev.actor_name || ev.actor_email || "System";
        var target = targetFromMeta(ev);
        var trace  = shortTrace(ev.id);
        var globalIdx = start + i;
        return "<tr data-idx=\"" + globalIdx + "\" class=\"" + (selectedIdx === globalIdx ? "selected-row" : "") + "\">"
          + "<td style=\"white-space:nowrap;font-size:11px\">" + fmtTs(ev.occurred_at) + "</td>"
          + "<td style=\"font-weight:700\">" + actor + (ev.actor_email && ev.actor_name ? "<br><small style=\"font-weight:400;color:#8a9fb8;font-size:10px\">" + ev.actor_email + "</small>" : "") + "</td>"
          + "<td>" + meta.label + "</td>"
          + "<td><span style=\"font-size:11px;color:#5e728b\">" + meta.module + "</span></td>"
          + "<td style=\"font-size:11px\">" + target + "</td>"
          + "<td>" + (SEV_MAP[meta.sev] || meta.sev) + "</td>"
          + "<td>" + (RES_MAP[meta.result] || meta.result) + "</td>"
          + "<td style=\"font-family:monospace;font-size:10px;color:#7a8ea4\">" + trace + "</td>"
          + "</tr>";
      }).join("");

      el("paginationInfo").textContent = "Showing " + (start + 1) + "–" + Math.min(start + PAGE_SIZE, total) + " of " + total + " events";

      /* pagination buttons */
      var pages = Math.ceil(total / PAGE_SIZE);
      var btns = "";
      for (var p = 0; p < Math.min(pages, 5); p++) {
        btns += "<button class=\"page-btn" + (p === currentPage ? " active" : "") + "\" data-page=\"" + p + "\" type=\"button\">" + (p + 1) + "</button>";
      }
      if (currentPage < pages - 1) btns += "<button class=\"page-btn\" data-page=\"" + (currentPage + 1) + "\" type=\"button\">&rsaquo;</button>";
      el("pageBtns").innerHTML = btns;
      Array.from(el("pageBtns").querySelectorAll(".page-btn")).forEach(function (btn) {
        btn.addEventListener("click", function () {
          currentPage = parseInt(btn.dataset.page, 10);
          selectedIdx = -1;
          renderTable();
        });
      });

      /* row click */
      Array.from(tbody.querySelectorAll("tr")).forEach(function (tr) {
        tr.addEventListener("click", function () {
          var idx = parseInt(tr.dataset.idx, 10);
          selectEvent(idx);
        });
      });
    }

    /* ── Select event → show sidebar ── */
    function selectEvent(idx) {
      selectedIdx = idx;
      var ev = filteredEvents[idx];
      if (!ev) return;

      /* highlight row */
      Array.from(el("auditTbody").querySelectorAll("tr")).forEach(function (tr) {
        var ti = parseInt(tr.dataset.idx, 10);
        tr.classList.toggle("selected-row", ti === idx);
      });

      var meta   = getMeta(ev.action);
      var actor  = (ev.actor_name || "") + (ev.actor_email ? " <" + ev.actor_email + ">" : "") || "System";
      var m      = ev.metadata || {};
      var before = m.from || m.before || m.oldValue || "—";
      var after  = m.to   || m.after  || m.newValue || targetFromMeta(ev) || "—";

      var rows = [
        ["Trace ID",  shortTrace(ev.id)],
        ["Timestamp", fmtTs(ev.occurred_at)],
        ["Actor",     actor],
        ["Action",    meta.label],
        ["Module",    meta.module],
        ["Target",    targetFromMeta(ev)],
        ["Before",    before],
        ["After",     after],
        ["Resource",  (ev.resource_type || "—") + (ev.resource_id ? " · " + ev.resource_id.slice(0, 12) + "…" : "")],
        ["Severity",  SEV_MAP[meta.sev] || meta.sev],
        ["Result",    RES_MAP[meta.result] || meta.result],
        ["Entity",    ev.entity_name ? ev.entity_name + (ev.entity_key ? " (" + ev.entity_key + ")" : "") : "—"]
      ];

      el("eventDetailBody").innerHTML = rows.map(function (r) {
        return "<div class=\"detail-row\"><span class=\"detail-label\">" + r[0] + "</span><span class=\"detail-val\">" + r[1] + "</span></div>";
      }).join("");

      var actions = el("complianceActions");
      if (actions) actions.style.display = meta.sev === "high" ? "flex" : "none";
    }

    /* ── Render activity feed ── */
    function renderActivityFeed() {
      var recent = allEvents.slice(0, 8);
      el("activityFeed").innerHTML = recent.map(function (ev) {
        var meta = getMeta(ev.action);
        var dot  = DOT_MAP[meta.result] || "info";
        var actor = ev.actor_name || ev.actor_email || "System";
        return "<div class=\"act-item\">"
          + "<div class=\"act-dot " + dot + "\"></div>"
          + "<div class=\"act-text\"><b>" + meta.label + "</b>" + actor + " &mdash; " + meta.module + "<br><time>" + fmtTs(ev.occurred_at) + "</time></div>"
          + "</div>";
      }).join("") || "<div style=\"font-size:12px;color:#8a9fb8;text-align:center;padding:12px\">No recent activity</div>";
    }

    /* ── KPIs ── */
    function updateKpis() {
      el("kpiTotal").textContent = String(allEvents.length);
      var highCount = allEvents.filter(function (ev) { return getMeta(ev.action).sev === "high"; }).length;
      var violations = allEvents.filter(function (ev) { return getMeta(ev.action).result === "fail"; }).length;
      el("kpiHigh").textContent = String(highCount);
      el("kpiViolations").textContent = String(violations);
      el("ebViolations").textContent = violations + " Policy Violations";
      var uniqueActors = new Set(allEvents.map(function (ev) { return ev.actor_email || ev.actor_user_id; }).filter(Boolean));
      el("kpiUsers").textContent = String(uniqueActors.size);
    }

    /* ── Load events from API ── */
    function loadEvents() {
      el("explorerSubtitle").textContent = "Loading…";
      apiService.getAuditEvents(tenantId, buildApiFilters()).subscribe({
        next: function (res) {
          allEvents = res.data || [];
          filteredEvents = allEvents.slice();
          renderTable();
          renderActivityFeed();
          updateKpis();
          el("explorerSubtitle").textContent = "Filter by actor, module, action type, severity, and date range";
        },
        error: function () {
          el("auditTbody").innerHTML = "<tr><td colspan=\"8\" style=\"text-align:center;color:#9aafc4;padding:24px\">Failed to load audit events. Check backend connection.</td></tr>";
        }
      });
    }

    /* ── Filter event bindings ── */
    ["filterDate", "filterAction", "filterUser"].forEach(function (id) {
      var e = el(id); if (e) e.addEventListener("change", function () { loadEvents(); });
    });
    ["filterModule", "filterSeverity"].forEach(function (id) {
      var e = el(id); if (e) e.addEventListener("change", applyClientFilters);
    });
    el("filterActor").addEventListener("input", applyClientFilters);

    /* ── Export ── */
    el("exportCsvBtn").addEventListener("click", function () {
      var headers = ["timestamp","actor","actor_email","action","module","target","severity","result","trace_id","resource_type","resource_id","entity"];
      var rows = [headers];
      filteredEvents.forEach(function (ev) {
        var meta = getMeta(ev.action);
        rows.push([
          fmtTs(ev.occurred_at),
          ev.actor_name || ev.actor_email || "System",
          ev.actor_email || "",
          meta.label,
          meta.module,
          targetFromMeta(ev),
          meta.sev,
          meta.result,
          shortTrace(ev.id),
          ev.resource_type || "",
          ev.resource_id   || "",
          ev.entity_name ? ev.entity_name + (ev.entity_key ? " (" + ev.entity_key + ")" : "") : ""
        ]);
      });
      var csv = rows.map(function (r) { return r.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
      var a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      a.download = "audit-log-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
    });
    el("exportPdfBtn").addEventListener("click", function () {
      alert("Signed PDF export initiated. Document will be digitally signed with audit authority certificate.");
    });
    el("auditPackBtn").addEventListener("click", function () {
      alert("Generating full audit pack (CSV + PDF + event manifest + integrity hash)…");
    });

    /* ── Compliance action buttons ── */
    el("openIncidentBtn").addEventListener("click", function () { alert("Incident created for selected high-risk event."); });
    el("flagReviewBtn").addEventListener("click", function ()   { alert("Event flagged for compliance review."); });
    el("escalateBtn").addEventListener("click", function ()     { alert("Event escalated to compliance team."); });

    /* ── Bootstrap ── */
    apiService.getTenant().subscribe({
      next: function (res) {
        var tenant = res.data && res.data[0];
        if (!tenant) return;
        tenantId = tenant.id;

        if (isAdmin) {
          apiService.getAuditActors(tenantId).subscribe({
            next: function (actorsRes) {
              var actors = actorsRes.data || [];
              var sel = el("filterUser");
              sel.innerHTML = "<option value=\"\">— All users —</option>"
                + actors.map(function (a) {
                  var email = a.email || "";
                  var name  = a.name  || email;
                  return "<option value=\"" + email + "\">" + name + (email ? " &lt;" + email + "&gt;" : "") + "</option>";
                }).join("");
            }
          });
        }
        loadEvents();
      },
      error: function () {
        el("auditTbody").innerHTML = "<tr><td colspan=\"8\" style=\"text-align:center;color:#9aafc4;padding:24px\">Backend unavailable. Start the API on port 7070.</td></tr>";
      }
    });
  }
}
