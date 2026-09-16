// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';

@Component({
  selector: 'app-entity-audit-logs',
  standalone: true,
  imports: [],
  templateUrl: './entity-audit-logs.html',
  styleUrl: './entity-audit-logs.css',
  encapsulation: ViewEncapsulation.None
})
export class EntityAuditLogsComponent implements AfterViewInit {
  private readonly api = inject(ApiService);

  ngAfterViewInit(): void {
    initTopBar();

    /* ── Data ─────────────────────────────────────────────── */
    var EVENTS = [
      { ts:"17-Jul-2026 11:42:18", actor:"Asha Menon",   action:"Role Changed",          module:"User Management",   target:"Collector Role → Approver", sev:"medium", result:"success",  trace:"TRC-9AF2-3188", before:"Role: Collector",  after:"Role: Approver",  reason:"Promotion approved by HR", ip:"10.45.2.11",  geo:"Mumbai, IN" },
      { ts:"17-Jul-2026 10:12:06", actor:"Vikram Kumar", action:"Approval Override",      module:"Accounts Payable",  target:"Invoice INV-88310",         sev:"high",   result:"success",  trace:"TRC-8BE1-9920", before:"Status: Pending L3", after:"Status: Approved", reason:"Urgent release for key client shipment", ip:"10.67.4.21", geo:"Bengaluru, IN" },
      { ts:"17-Jul-2026 09:49:51", actor:"System",       action:"Policy Violation",       module:"Accounts Payable",  target:"SoD Rule — Dual Approver",  sev:"high",   result:"fail",     trace:"TRC-7CP3-4201", before:"Status: Pending", after:"Blocked by rule", reason:"Same user attempted both L1 and L2 approval", ip:"—", geo:"—" },
      { ts:"16-Jul-2026 18:34:10", actor:"Fatima Khan",  action:"Invoice Approved",       module:"Accounts Receivable", target:"INV-NTL-2244",            sev:"low",    result:"success",  trace:"TRC-7AF5-1843", before:"Status: Pending",  after:"Status: Approved", reason:"3-way match passed", ip:"172.18.0.4", geo:"Delhi, IN" },
      { ts:"16-Jul-2026 14:05:26", actor:"Akash Iyer",   action:"Login / Session",        module:"Authentication",    target:"IP 10.67.4.21",             sev:"medium", result:"fail",     trace:"TRC-6GF8-6614", before:"Session inactive", after:"MFA failed (2x)", reason:"Incorrect OTP entered twice", ip:"10.67.4.21", geo:"Mumbai, IN" },
      { ts:"16-Jul-2026 12:28:09", actor:"Priya Nair",   action:"Document Classified",    module:"Classification",    target:"INV-NTL-2291 (35 pages)",   sev:"low",    result:"success",  trace:"TRC-6BA4-8820", before:"Unclassified",     after:"invoice (conf 97.4%)", reason:"Auto-classified by AI", ip:"10.11.0.3", geo:"Chennai, IN" },
      { ts:"16-Jul-2026 10:55:44", actor:"Vikram Kumar", action:"Extraction Override",    module:"Extraction",        target:"PO-NTL-0078 Field: Amount",  sev:"medium", result:"success",  trace:"TRC-6CA9-2210", before:"₹1,24,000",        after:"₹1,42,000",       reason:"Corrected OCR error after manual review", ip:"10.67.4.21", geo:"Bengaluru, IN" },
      { ts:"15-Jul-2026 17:10:33", actor:"System",       action:"Reconciliation Entry",   module:"Reconciliation",    target:"Batch RECON-2026-07-15",     sev:"low",    result:"success",  trace:"TRC-5FF3-7740", before:"Open",             after:"Reconciled (412 entries)", reason:"Automated daily reconciliation run", ip:"—", geo:"—" },
      { ts:"15-Jul-2026 15:48:12", actor:"Asha Menon",   action:"Provider Switched",      module:"API / Provider",    target:"GSTIN API → NIC Primary",   sev:"medium", result:"success",  trace:"TRC-5EC1-0019", before:"GSTN Fallback",    after:"NIC Primary",     reason:"Downtime on fallback endpoint resolved", ip:"10.45.2.11", geo:"Mumbai, IN" },
      { ts:"15-Jul-2026 11:22:07", actor:"Ravi Shankar", action:"Payment Released",       module:"Accounts Payable",  target:"Vendor PMT-8832-NTL",       sev:"low",    result:"success",  trace:"TRC-5DA7-4433", before:"Payment: Held",    after:"Payment: Disbursed ₹4,80,000", reason:"L3 approval granted", ip:"10.44.1.6", geo:"Pune, IN" },
      { ts:"14-Jul-2026 16:41:55", actor:"Fatima Khan",  action:"Invoice Rejected",       module:"Accounts Receivable", target:"INV-NTL-2198",            sev:"low",    result:"warn",     trace:"TRC-4FA8-6618", before:"Status: Pending",  after:"Status: Rejected", reason:"Duplicate invoice detected by AI", ip:"172.18.0.4", geo:"Delhi, IN" },
      { ts:"14-Jul-2026 09:30:00", actor:"System",       action:"Policy Violation",       module:"Accounts Payable",  target:"Approval Threshold Rule",   sev:"high",   result:"fail",     trace:"TRC-4CA2-8821", before:"Amount: ₹8,20,000", after:"Blocked — exceeds ₹5,00,000 threshold", reason:"Auto-enforcement of threshold policy", ip:"—", geo:"—" },
    ];

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

    var DOT_MAP = {
      low: "ok", medium: "warn", high: "bad", success: "ok", fail: "bad", warn: "warn"
    };

    var selectedIdx = -1;

    /* ── Render table ───────────────────────────────────── */
    function renderTable(data) {
      var tbody = document.getElementById("auditTbody");
      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#9aafc4;padding:24px">No events match the current filters.</td></tr>';
        return;
      }
      tbody.innerHTML = data.map(function (ev, i) {
        return '<tr data-idx="' + i + '" class="' + (selectedIdx === i ? "selected-row" : "") + '">'
          + '<td style="white-space:nowrap;font-size:11px">' + ev.ts + '</td>'
          + '<td style="font-weight:700">' + ev.actor + '</td>'
          + '<td>' + ev.action + '</td>'
          + '<td><span style="font-size:11px;color:#5e728b">' + ev.module + '</span></td>'
          + '<td style="font-size:11px">' + ev.target + '</td>'
          + '<td>' + (SEV_MAP[ev.sev] || ev.sev) + '</td>'
          + '<td>' + (RES_MAP[ev.result] || ev.result) + '</td>'
          + '<td style="font-family:monospace;font-size:10px;color:#7a8ea4">' + ev.trace + '</td>'
          + '</tr>';
      }).join("");

      tbody.querySelectorAll("tr").forEach(function (tr) {
        tr.addEventListener("click", function () {
          var idx = parseInt(tr.getAttribute("data-idx"), 10);
          selectEvent(data, idx);
        });
      });
    }

    /* ── Render event detail sidebar ───────────────────── */
    function selectEvent(data, idx) {
      selectedIdx = idx;
      var ev = data[idx];
      document.querySelectorAll("#auditTbody tr").forEach(function (tr, i) {
        tr.classList.toggle("selected-row", i === idx);
      });

      var rows = [
        ["Trace ID",   ev.trace],
        ["Timestamp",  ev.ts],
        ["Actor",      ev.actor],
        ["Action",     ev.action],
        ["Module",     ev.module],
        ["Target",     ev.target],
        ["Before",     ev.before],
        ["After",      ev.after],
        ["Reason",     ev.reason],
        ["Geo / IP",   ev.geo + (ev.ip !== "—" ? " / " + ev.ip : "")],
        ["Severity",   SEV_MAP[ev.sev] || ev.sev],
        ["Result",     RES_MAP[ev.result] || ev.result],
      ];

      document.getElementById("eventDetailBody").innerHTML = rows.map(function (r) {
        return '<div class="detail-row"><span class="detail-label">' + r[0] + '</span><span class="detail-val">' + r[1] + '</span></div>';
      }).join("");

      var actions = document.getElementById("complianceActions");
      if (actions) actions.style.display = ev.sev === "high" ? "flex" : "none";
    }

    /* ── Render activity feed ───────────────────────────── */
    function renderActivity() {
      var recent = EVENTS.slice(0, 6);
      document.getElementById("activityFeed").innerHTML = recent.map(function (ev) {
        return '<div class="act-item">'
          + '<div class="act-dot ' + (DOT_MAP[ev.result] || "info") + '"></div>'
          + '<div class="act-text"><b>' + ev.action + '</b>' + ev.actor + ' &mdash; ' + ev.module + '<br><time>' + ev.ts + '</time></div>'
          + '</div>';
      }).join("");
    }

    /* ── Filters ────────────────────────────────────────── */
    function applyFilters() {
      var fAction   = document.getElementById("filterAction").value;
      var fModule   = document.getElementById("filterModule").value;
      var fSeverity = document.getElementById("filterSeverity").value;
      var fActor    = document.getElementById("filterActor").value.toLowerCase();
      var fResult   = document.getElementById("filterResult").value;

      var filtered = EVENTS.filter(function (ev) {
        if (fAction   && ev.action.indexOf(fAction)       < 0) return false;
        if (fModule   && ev.module.indexOf(fModule)       < 0) return false;
        if (fSeverity && ev.sev !== fSeverity.toLowerCase()) return false;
        if (fActor    && ev.actor.toLowerCase().indexOf(fActor) < 0) return false;
        if (fResult   && ev.result !== fResult.toLowerCase().replace(" ", "")) return false;
        return true;
      });

      selectedIdx = -1;
      renderTable(filtered);
      document.getElementById("paginationInfo").textContent = "Showing 1–" + Math.min(15, filtered.length) + " of " + filtered.length + " events";
    }

    ["filterAction", "filterModule", "filterSeverity", "filterActor", "filterResult"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", applyFilters);
      if (el && el.tagName === "INPUT") el.addEventListener("input", applyFilters);
    });

    /* ── Export ─────────────────────────────────────────── */
    document.getElementById("exportCsvBtn").addEventListener("click", function () {
      var rows = EVENTS;
      if (!rows.length) { alert('No audit events to export.'); return; }
      var headers = ['Timestamp', 'Action', 'Actor', 'Module', 'Target', 'Result', 'Severity', 'Trace ID', 'Before', 'After', 'Reason', 'Geo / IP'];
      var csvLines = [headers.join(',')];
      rows.forEach(function(e) {
        csvLines.push([
          '"' + (e.ts     || '') + '"',
          '"' + (e.action || '') + '"',
          '"' + (e.actor  || '') + '"',
          '"' + (e.module || '') + '"',
          '"' + (e.target || '') + '"',
          '"' + (e.result || '') + '"',
          '"' + (e.sev    || '') + '"',
          '"' + (e.trace  || '') + '"',
          '"' + (e.before || '') + '"',
          '"' + (e.after  || '') + '"',
          '"' + (e.reason || '') + '"',
          '"' + (e.geo    || '') + (e.ip && e.ip !== '—' ? ' / ' + e.ip : '') + '"'
        ].join(','));
      });
      var blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url;
      a.download = 'audit-log-' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    document.getElementById("exportPdfBtn").addEventListener("click", function () {
      alert("Signed PDF export initiated. Document will be digitally signed with audit authority certificate.");
    });
    document.getElementById("auditPackBtn").addEventListener("click", function () {
      alert("Generating full audit pack (CSV + PDF + event manifest + integrity hash)…");
    });

    /* ── URL params: entity context ─────────────────────── */
    var params     = new URLSearchParams(window.location.search);
    var entityName = params.get("entityName") || "";
    var entityId   = params.get("entityId")   || "";

    if (entityName) {
      document.getElementById("entityCrumbName").textContent = entityName;
      document.getElementById("ebName").textContent          = entityName;
      document.getElementById("auditHeroTitle").textContent  = entityName + " — Audit Log";
      document.getElementById("auditEntityPill").textContent = "Entity: " + entityName;
      document.getElementById("ebSub").textContent           = "Audit trail for " + entityName + (entityId ? " (" + entityId + ")" : "");
      document.getElementById("ebIcon").textContent          = entityName.split(/[\s-]+/).slice(0,2).map(function(w){return w[0]||"";}).join("").toUpperCase() || "EN";
    }

    if (entityId) {
      document.getElementById("ebEntityId").textContent = "Entity ID: " + entityId;
    }

    /* ── Normalize a backend audit_events row to component shape ── */
    function normalizeAuditRow(row) {
      var meta = row.metadata || {};
      var d    = new Date(row.occurred_at);
      var ts   = isNaN(d.getTime()) ? row.occurred_at
               : d.getDate().toString().padStart(2,'0') + '-'
                 + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
                 + '-' + d.getFullYear() + ' '
                 + d.getHours().toString().padStart(2,'0') + ':'
                 + d.getMinutes().toString().padStart(2,'0') + ':'
                 + d.getSeconds().toString().padStart(2,'0');
      return {
        ts:     ts,
        actor:  row.actor_name || meta.actorEmail || 'System',
        action: meta.action    || row.action     || row.action,
        module: meta.module    || row.resource_type || '-',
        target: meta.target    || meta.entityId  || meta.entityName || '-',
        sev:    meta.severity  || 'low',
        result: meta.result    || 'success',
        trace:  meta.traceId   || ('TRC-' + row.id.slice(0,8).toUpperCase()),
        before: meta.before    || '-',
        after:  meta.after     || '-',
        reason: meta.reason    || '-',
        ip:     meta.ip        || '—',
        geo:    meta.geo       || '—'
      };
    }

    /* ── KPIs from loaded events ── */
    function updateKpis(events, total) {
      var highRisk   = events.filter(function(e) { return e.sev === 'high'; }).length;
      var failed     = events.filter(function(e) { return e.result === 'fail'; }).length;
      var actors     = [...new Set(events.map(function(e) { return e.actor; }).filter(Boolean))].length;
      var userChange = events.filter(function(e) { return (e.module || '').toLowerCase().indexOf('user') !== -1 || e.action.indexOf('user.') !== -1; }).length;
      var violations = events.filter(function(e) { return e.sev === 'high' && e.result === 'fail'; }).length;
      var set = function(id, val) { var el = document.getElementById(id); if(el) el.textContent = String(val); };
      set('kpiTotalEvents',  total || events.length);
      set('kpiHighRisk',     highRisk);
      set('kpiFailed',       failed);
      set('kpiUsers',        actors);
      set('kpiUserChanges',  userChange);
      var vp = document.getElementById('violationsPill');
      if (vp) vp.textContent = violations + ' Policy Violations';
    }

    /* ── Init with empty state, then load from API ── */
    renderTable([]);
    renderActivity();

    var apiRef = this.api;
    var tenantIdVal = params.get('tenantId') || '';

    function fetchEvents(tid) {
      apiRef.getEntityAuditEvents(tid, entityId).subscribe({
        next: function (response) {
          if (response.data) {
            EVENTS = response.data.map(normalizeAuditRow);
          } else {
            EVENTS = [];
          }
          selectedIdx = -1;
          renderTable(EVENTS);
          renderActivity();
          updateKpis(EVENTS, response.total || EVENTS.length);
          var pi = document.getElementById("paginationInfo");
          if (pi) pi.textContent = "Showing 1–" + Math.min(15, EVENTS.length) + " of " + (response.total || EVENTS.length) + " events";
        },
        error: function () { renderTable([]); updateKpis([], 0); }
      });
    }

    if (tenantIdVal && entityId) {
      fetchEvents(tenantIdVal);
    } else if (entityId) {
      apiRef.getTenant().subscribe({
        next: function (tenantResponse) {
          var tenant = tenantResponse.data && tenantResponse.data[0];
          if (tenant) fetchEvents(tenant.id);
          else { renderTable([]); updateKpis([], 0); }
        },
        error: function () { renderTable([]); updateKpis([], 0); }
      });
    } else {
      renderTable([]);
      updateKpis([], 0);
    }
  }
}
