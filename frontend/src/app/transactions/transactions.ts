// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { ApiService } from '../api.service';
import { EntityAccessService } from '../entity-access.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [],
  templateUrl: './transactions.html',
  styleUrl: './transactions.css',
  encapsulation: ViewEncapsulation.None
})
export class TransactionsComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(EntityAccessService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
    const canProcess = this.access.hasAny("ap.process", "ar.process");
    const uploadButton = document.getElementById("openUploadBtn");
    if (uploadButton) uploadButton.hidden = !canProcess;

    /* ── Pipeline steps definition ──────────────────── */
    var STEPS = [
      { key:"upload",      label:"Upload" },
      { key:"duplicate",   label:"Duplicate" },
      { key:"classify",    label:"Classify" },
      { key:"tariff",      label:"Tariff Map" },
      { key:"extract",     label:"Extract" },
      { key:"review",      label:"Review" }
    ];

    /* ── Source config ──────────────────────────────── */
    var SOURCE_META = {
      sap:    { label:"SAP Integration", icon:"⚡", cls:"sap",    color:"#0a5d72" },
      upload: { label:"Manual Upload",   icon:"⬆", cls:"upload", color:"#5b3fa8" },
      vendor: { label:"Vendor Master",   icon:"🏢", cls:"vendor", color:"#7a4a10" }
    };

    /* ── Document data ──────────────────────────────── */
    var DOCS = [];
    var INVOICES = [];
    var EXCEPTIONS = [];
    var AUDIT_EVENTS = [];

    /* ── Source badge HTML ──────────────────────────── */
    function sourceBadge(src) {
      var m = SOURCE_META[src] || { label:src, icon:"?", cls:"", color:"#666" };
      return '<span class="source-badge ' + m.cls + '">' + m.icon + ' ' + m.label + '</span>';
    }

    /* ── Update source strip counts ─────────────────── */
    function updateSourceStrip() {
      var all    = DOCS.length;
      var sapN   = DOCS.filter(function(d){ return d.source==="sap"; }).length;
      var uplN   = DOCS.filter(function(d){ return d.source==="upload"; }).length;
      var venN   = DOCS.filter(function(d){ return d.source==="vendor"; }).length;
      document.getElementById("srcCountAll").textContent    = all;
      document.getElementById("srcCountSap").textContent    = sapN;
      document.getElementById("srcCountUpload").textContent = uplN;
      document.getElementById("srcCountVendor").textContent = venN;
      document.getElementById("ebDocCount").textContent     = all + " Documents";
    }

    /* ── Active source filter state ─────────────────── */
    var activeSourceFilter = "";

    function setSourceFilter(src) {
      activeSourceFilter = src;
      ["srcCardAll","srcCardSap","srcCardUpload","srcCardVendor"].forEach(function(id) {
        var card = document.getElementById(id);
        if (!card) return;
        var val = card.getAttribute("data-src");
        card.classList.toggle("active-filter", val === src || (src === "" && val === ""));
      });
      var sel = document.getElementById("docFilterSource");
      if (sel) sel.value = src;
      applyDocFilters();
    }

    /* ── Build pipeline HTML ────────────────────────── */
    function buildPipeline(doc) {
      var html = '<div class="pipeline">';
      STEPS.forEach(function(step, i) {
        var isDone   = doc.completedSteps.indexOf(i) >= 0;
        var isActive = doc.activeStep === i;
        var cls = isDone ? "done" : (isActive ? "active" : "");
        var num = i + 1;
        html += '<div class="pipe-step">'
          + '<div class="pipe-circle ' + cls + '">' + num + '</div>'
          + '<div class="pipe-label ' + cls + '">' + step.label + '</div>'
          + '</div>';
        if (i < STEPS.length - 1) {
          var connCls = doc.completedSteps.indexOf(i) >= 0 ? (doc.activeStep === i + 1 ? "active" : "done") : "";
          html += '<div class="pipe-connector ' + connCls + '"></div>';
        }
      });
      html += '</div>';
      return html;
    }

    /* ── Render doc table ───────────────────────────── */
    function renderDocTable(data) {
      var tbody   = document.getElementById("docTbody");
      var footer  = document.getElementById("docTableFooter");

      if (footer) {
        footer.textContent = data.length === DOCS.length
          ? "Showing all " + data.length + " documents"
          : "Showing " + data.length + " of " + DOCS.length + " documents";
      }

      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9aafc4;padding:28px;font-size:12px">No documents match the current filters.</td></tr>';
        return;
      }

      tbody.innerHTML = data.map(function(doc, i) {
        var pipeline = buildPipeline(doc);
        return '<tr data-idx="' + i + '">'
          + '<td><span class="doc-id-cell">' + escHtml(doc.id) + '</span><br><a class="process-link" href="#" data-process-idx="' + i + '">View process <span aria-hidden="true">↗</span></a></td>'
          + '<td>' + sourceBadge(doc.source) + '</td>'
          + '<td style="font-size:11px;color:#5e728b">' + doc.type + '</td>'
          + '<td><span class="num-cell">' + doc.pdfs + '</span></td>'
          + '<td><span class="num-cell">' + doc.pages + '</span></td>'
          + '<td>' + pipeline + '</td>'
          + '<td><div class="action-btns">'
          + '<button class="icon-btn view-btn" type="button" data-idx="' + i + '" title="View process details">'
          + '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="#5b7a9a" stroke-width="1.5"/><path d="M2 8c1.5-4 8.5-4 12 0-3.5 4-10.5 4-12 0z" stroke="#5b7a9a" stroke-width="1.4"/></svg>'
          + '</button>'
          + '<button class="icon-btn danger delete-btn" type="button" data-idx="' + i + '" title="Delete">'
          + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M5 5.5v5M7 5.5v5M9 5.5v5M3 3.5l.7 8a1 1 0 001 .9h4.6a1 1 0 001-.9l.7-8" stroke="#b74444" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          + '</button>'
          + '</div></td>'
          + '</tr>';
      }).join("");

      tbody.querySelectorAll(".view-btn").forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          showDocDetail(data[parseInt(btn.getAttribute("data-idx"), 10)]);
        });
      });

      tbody.querySelectorAll(".process-link").forEach(function(link) {
        link.addEventListener("click", function(e) {
          e.preventDefault();
          e.stopPropagation();
          showDocDetail(data[parseInt(link.getAttribute("data-process-idx"), 10)]);
        });
      });

      tbody.querySelectorAll(".delete-btn").forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          var idx   = parseInt(btn.getAttribute("data-idx"), 10);
          var docEl = data[idx];
          if (confirm("Delete " + docEl.id + "?")) {
            var gi = DOCS.indexOf(docEl);
            if (gi >= 0) DOCS.splice(gi, 1);
            updateSourceStrip();
            applyDocFilters();
          }
        });
      });
    }

    /* ── Apply all doc filters ──────────────────────── */
    function applyDocFilters() {
      var fSearch = (document.getElementById("docFilterSearch")  || {value:""}).value.toLowerCase();
      var fSrc    = (document.getElementById("docFilterSource")  || {value:""}).value || activeSourceFilter;
      var fType   = (document.getElementById("docFilterType")    || {value:""}).value;
      var fStep   = (document.getElementById("docFilterStep")    || {value:""}).value;

      var filtered = DOCS.filter(function(d) {
        if (fSearch && d.id.toLowerCase().indexOf(fSearch) < 0) return false;
        if (fSrc    && d.source !== fSrc) return false;
        if (fType   && d.type !== fType)  return false;
        if (fStep !== "" && fStep !== undefined && d.activeStep !== parseInt(fStep, 10)) return false;
        return true;
      });

      renderDocTable(filtered);
    }

    /* ── Wire filter bar inputs ─────────────────────── */
    ["docFilterSearch","docFilterSource","docFilterType","docFilterStep"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener("input",  applyDocFilters);
        el.addEventListener("change", function() {
          if (id === "docFilterSource") activeSourceFilter = el.value;
          applyDocFilters();
        });
      }
    });

    /* ── Wire source strip cards ────────────────────── */
    ["srcCardAll","srcCardSap","srcCardUpload","srcCardVendor"].forEach(function(id) {
      var card = document.getElementById(id);
      if (card) {
        card.addEventListener("click", function() {
          setSourceFilter(card.getAttribute("data-src"));
        });
      }
    });

    /* ── Show doc detail ───────────────────────────── */
    function showDocDetail(doc) {
      var overlay = document.getElementById("docDetailOverlay");
      var title = document.getElementById("ddpDocId");
      var body = document.getElementById("ddpBody");
      if (!overlay || !title || !body || !doc) return;

      var invoice = findRelatedInvoice(doc);
      var outcome = getDocumentOutcome(doc, invoice);
      title.textContent = doc.id;
      body.innerHTML = buildDocDetail(doc, invoice, outcome);
      overlay.classList.remove("hidden");
      loadDocPreview(doc, body);
    }

    function findRelatedInvoice(doc) {
      var data = doc.data || {};
      var keys = [
        data.invoice_key, data.invoiceKey, data.invoice_id, data.invoiceId,
        data.invoice_ref, data.invoiceRef, data.batch_id, data.batchId, doc.id
      ].filter(Boolean).map(function(value) { return String(value).toLowerCase(); });
      return INVOICES.find(function(invoice) {
        var values = [invoice.id, invoice.invoice_key, invoice.batch_id, invoice.data && invoice.data.batch_id]
          .filter(Boolean).map(function(value) { return String(value).toLowerCase(); });
        return values.some(function(value) {
          return keys.some(function(key) { return value === key || value.indexOf(key) >= 0 || key.indexOf(value) >= 0; });
        });
      }) || null;
    }

    function getDocumentOutcome(doc, invoice) {
      var data = doc.data || {};
      var reason = String(doc.reason || data.reason || data.stop_reason || "").toLowerCase();
      var duplicate = data.duplicate === true
        || data.is_duplicate === true
        || String(data.duplicate_status || data.duplicateStatus || "").toLowerCase() === "duplicate"
        || reason.indexOf("duplicate") >= 0
        || (Number(doc.activeStep) === 1 && doc.status !== "Completed");
      var matchStatus = String(invoice && invoice.match_status || data.match_status || data.matchStatus || "").toLowerCase();
      if (duplicate) return { label: "Duplicate Block", cls: "blocked", icon: "!", detail: "Duplicate gate blocked this document before downstream processing." };
      if (matchStatus === "matched" || matchStatus === "approved" || data.touchless === true || doc.status === "Completed") {
        return { label: "Touchless", cls: "touchless", icon: "✓", detail: "All configured gates completed without manual intervention." };
      }
      if (doc.status === "Failed" || doc.status === "Stopped" || matchStatus === "partial" || matchStatus === "unmatched") {
        return { label: "Review", cls: "review", icon: "!", detail: "Processing stopped or requires an operator decision." };
      }
      return { label: "Processing", cls: "processing", icon: "…", detail: "The document is still moving through the AP pipeline." };
    }

    function buildDocDetail(doc, invoice, outcome) {
      var data = doc.data || {};
      var vendor = invoice && invoice.vendor_name || data.vendor_name || data.vendor || "Supplier not extracted";
      var amount = invoice && invoice.amount_num != null ? formatAmount(invoice.amount_num) : (data.amount ? formatAmount(data.amount) : "—");
      var matchStatus = invoice && invoice.match_status ? invoice.match_status : "Not matched";
      var duplicateReason = data.duplicate_reason || data.duplicateReason
        || (outcome.cls === "blocked" ? (doc.reason || "Duplicate gate stopped the document before classification.") : "No duplicate hit recorded.");
      var poRef = invoice && invoice.po_ref || data.po_ref || data.poRef || "Not linked";
      var grnRef = invoice && invoice.grn_ref || data.grn_ref || data.grnRef || "Not linked";
      var variance = invoice && invoice.variance_amount != null ? formatAmount(invoice.variance_amount) : "—";
      var gateStatus = outcome.cls === "touchless" ? "Passed" : outcome.cls === "blocked" ? "Blocked" : "Review";

      return '<div class="ddp-summary">'
        + '<div><span class="ddp-kicker">DOCUMENT</span><strong>' + escHtml(doc.id) + '</strong><small>' + escHtml(vendor) + ' · ' + escHtml(doc.type) + '</small></div>'
        + '<div class="ddp-summary-right"><strong>' + escHtml(amount) + '</strong><span class="ddp-badge source">' + escHtml((doc.source || "upload").toUpperCase()) + '</span><span class="ddp-badge ' + outcome.cls + '">' + escHtml(outcome.label.toUpperCase()) + '</span></div>'
        + '</div>'
        + '<section class="ddp-section"><h4>Processing timeline</h4><div class="ddp-timeline">' + buildTimeline(doc, outcome) + '</div></section>'
        + '<section class="ddp-evidence-grid">'
        + '<div class="ddp-preview-card"><h4>Document image</h4><div class="ddp-preview" id="ddpPreview"><span>Loading preview…</span></div><small>' + escHtml(doc.originalFilename || "Source document") + '</small></div>'
        + '<div class="ddp-section ddp-decision"><h4>Decision evidence</h4>'
        + '<div class="ddp-gate-row"><span class="ddp-gate-icon">A</span><div><strong>Duplicate gate</strong><small>' + escHtml(duplicateReason) + '</small></div><span class="ddp-state ' + (outcome.cls === "blocked" ? "fail" : "pass") + '">' + (outcome.cls === "blocked" ? "Fail" : "Pass") + '</span></div>'
        + '<div class="ddp-gate-row"><span class="ddp-gate-icon">B</span><div><strong>Document extraction</strong><small>' + escHtml(doc.type) + ' · ' + escHtml(String(doc.pages)) + ' page(s)</small></div><span class="ddp-state ' + (doc.activeStep > 3 || outcome.cls === "touchless" ? "pass" : "review") + '">' + (doc.activeStep > 3 || outcome.cls === "touchless" ? "Pass" : "Review") + '</span></div>'
        + '<div class="ddp-gate-row"><span class="ddp-gate-icon">C</span><div><strong>PO / GRN match</strong><small>PO: ' + escHtml(poRef) + ' · GRN: ' + escHtml(grnRef) + ' · Variance: ' + escHtml(variance) + '</small></div><span class="ddp-state ' + (matchStatus === "matched" || matchStatus === "approved" ? "pass" : "review") + '">' + escHtml(matchStatus) + '</span></div>'
        + '<div class="ddp-gate-row"><span class="ddp-gate-icon">D</span><div><strong>Final decision</strong><small>' + escHtml(outcome.detail) + '</small></div><span class="ddp-state ' + (outcome.cls === "touchless" ? "pass" : outcome.cls === "blocked" ? "fail" : "review") + '">' + gateStatus + '</span></div>'
        + '</div></section>'
        + '<div class="ddp-record"><span>Decision record</span><span>' + escHtml(outcome.detail) + ' · Evidence is retained for replay.</span></div>';
    }

    function buildTimeline(doc, outcome) {
      var steps = ["Received", "Duplicate gate", "Classified", "Tariff mapped", "Fields extracted", "Final review"];
      var html = "";
      var completed = doc.completedSteps || [];
      steps.forEach(function(label, index) {
        var isDone = completed.indexOf(index) >= 0 || (outcome.cls === "touchless" && index <= 5);
        var isCurrent = doc.activeStep === index && !isDone;
        var isFailed = outcome.cls === "blocked" && index === 1;
        var state = isFailed ? "fail" : isDone ? "pass" : isCurrent ? "current" : "pending";
        var detail = index === 0
          ? "Received via " + (doc.source === "sap" ? "SAP integration" : doc.source === "vendor" ? "vendor portal" : "manual upload")
          : index === 1
            ? (isFailed ? "Duplicate key or invoice fingerprint matched an existing posted document" : "No duplicate hit recorded")
            : index === 2 ? "Document type: " + doc.type
            : index === 3 ? "Tolerance and tariff rules evaluated"
            : index === 4 ? "Invoice fields and supplier identity extracted"
            : outcome.detail;
        html += '<div class="ddp-time-item ' + state + '"><span class="ddp-time-dot"></span><time>' + escHtml(doc.uploaded || "—") + '</time><div><strong>' + escHtml(label) + '</strong><small>' + escHtml(detail) + '</small></div></div>';
      });
      return html;
    }

    function loadDocPreview(doc, body) {
      var preview = body.querySelector("#ddpPreview");
      if (!preview) return;
      if (doc.previewUrl) {
        preview.innerHTML = '<img src="' + doc.previewUrl + '" alt="Preview of ' + escHtml(doc.id) + '" />';
        return;
      }
      if (!requestedTenantId || !entityId) {
        preview.innerHTML = '<span>No source image available for this batch.</span>';
        return;
      }
      apiRef.getTransactionPreview(requestedTenantId, entityId, doc.id).subscribe({
        next: function(blob) {
          if (blob && blob.type && blob.type.indexOf("image/") === 0) {
            var url = URL.createObjectURL(blob);
            doc.previewUrl = url;
            preview.innerHTML = '<img src="' + url + '" alt="Preview of ' + escHtml(doc.id) + '" />';
          } else {
            preview.innerHTML = '<span>No image preview available.</span>';
          }
        },
        error: function() {
          preview.innerHTML = '<span>No source image available for this batch.</span>';
        }
      });
    }

    /* ── Tab switching ──────────────────────────────── */
    document.querySelectorAll(".tab-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });
        btn.classList.add("active");
        var panelId = "tab-" + btn.getAttribute("data-tab");
        var panel = document.getElementById(panelId);
        if (panel) panel.classList.add("active");
      });
    });

    /* ── Upload modal ───────────────────────────────── */
    function openUpload() { document.getElementById("uploadModal").classList.remove("hidden"); }
    function closeUpload() { document.getElementById("uploadModal").classList.add("hidden"); }

    document.getElementById("openUploadBtn").addEventListener("click", openUpload);
    document.getElementById("closeUploadModal").addEventListener("click", closeUpload);
    document.getElementById("cancelUpload").addEventListener("click", closeUpload);
    document.getElementById("uploadModal").addEventListener("click", function(e) { if(e.target===this) closeUpload(); });

    document.getElementById("dropZone").addEventListener("click", function() {
      document.getElementById("fileInput").click();
    });

    /* ── Source option card selection ──────────────── */
    document.querySelectorAll("#sourceSelector label").forEach(function(label) {
      label.addEventListener("click", function() {
        document.querySelectorAll(".source-option-card").forEach(function(c) { c.classList.remove("selected"); });
        label.querySelector(".source-option-card").classList.add("selected");
        var radio = label.querySelector("input[type=radio]");
        if (radio) radio.checked = true;
      });
    });

    document.getElementById("submitUpload").addEventListener("click", function() {
      var type   = document.getElementById("uploadDocType").value || "Invoice";
      var srcRad = document.querySelector("input[name='uploadSource']:checked");
      var src    = srcRad ? srcRad.value : "upload";
      var fileInput = document.getElementById("fileInput") as HTMLInputElement;
      var file = fileInput && fileInput.files ? fileInput.files[0] : null;
      var submitBtn = this as HTMLButtonElement;
      if (!file) {
        alert("Select a document before uploading.");
        return;
      }
      if (!entityId) {
        alert("Open Transactions from an entity dashboard before uploading.");
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Uploading...";
      var sourceHint = type.toLowerCase()
        .replace("purchase order", "purchase_order")
        .replace("remittance advice", "remittance")
        .replace("credit note", "credit")
        .replace("debit note", "debit")
        .replace("bank statement", "bank_statement")
        .replace("proof of delivery", "proof_of_delivery");
      var reader = new FileReader();
      reader.onload = function(event) {
        var encoded = String(event.target?.result || "").split(",")[1] || "";
        apiRef.getTenant().subscribe({
          next: function(tenantResponse) {
            var tenant = tenantResponse.data && tenantResponse.data[0];
            if (!tenant) {
              submitBtn.disabled = false;
              submitBtn.textContent = "Upload";
              alert("No tenant is configured.");
              return;
            }
            apiRef.uploadDocument(tenant.id, entityId, {
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              dataBase64: encoded,
              sourceHint: sourceHint === "invoice" && !document.getElementById("uploadDocType").value ? undefined : sourceHint
            }).subscribe({
              next: function() {
                apiRef.getEntityTransactions(tenant.id, entityId).subscribe({
                  next: function(response) {
                    DOCS = (response.data || []).map(normalizeBatchRow);
                    initClPageData();
                    updateSourceStrip();
                    applyDocFilters();
                    loadClassificationPreviews(tenant.id);
                  }
                });
                submitBtn.disabled = false;
                submitBtn.textContent = "Upload";
                fileInput.value = "";
                closeUpload();
              },
              error: function(err) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Upload";
                alert("Upload failed: " + ((err && err.error && err.error.error) || "Server error"));
              }
            });
          },
          error: function() {
            submitBtn.disabled = false;
            submitBtn.textContent = "Upload";
            alert("Unable to load tenant information.");
          }
        });
      };
      reader.readAsDataURL(file);
    });

    /* ── Doc detail close ───────────────────────────── */
    document.getElementById("closeDocDetail").addEventListener("click", function() {
      document.getElementById("docDetailOverlay").classList.add("hidden");
    });
    document.getElementById("docDetailOverlay").addEventListener("click", function(e) {
      if(e.target===this) document.getElementById("docDetailOverlay").classList.add("hidden");
    });

    /* ── URL params ─────────────────────────────────── */
    var params     = new URLSearchParams(window.location.search);
    var entityName = params.get("entityName") || localStorage.getItem("lx_entity_name") || "";
    var entityId   = params.get("entityId")   || localStorage.getItem("lx_entity_id")   || "";
    var requestedTenantId = params.get("tenantId") || localStorage.getItem("lx_tenant_id") || "";

    if (entityName) {
      document.getElementById("entityCrumbName").textContent = entityName;
      document.getElementById("ebName").textContent          = entityName;
      document.getElementById("ebIcon").textContent          = entityName.split(/[\s-]+/).slice(0,2).map(function(w){return w[0]||"";}).join("").toUpperCase() || "EN";
      document.getElementById("ebSub").textContent           = "Document transactions for " + entityName + (entityId ? " (" + entityId + ")" : "");
    }
    if (entityId) { document.getElementById("ebEntityId").textContent = "Entity ID: " + entityId; }

    var entityQS = (entityName || entityId) ? "?entityId=" + encodeURIComponent(entityId) + "&entityName=" + encodeURIComponent(entityName) : "";
    ["navDashboard","navAudit","navUsers","navClassify","navExtract","navExceptions","backToDashboardLink"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el && entityQS) { var base = el.getAttribute("href").split("?")[0]; el.setAttribute("href", base + entityQS); }
    });

    /* ── Init ──────────────────────────────────────── */
    updateSourceStrip();
    setSourceFilter("");
    applyDocFilters();

    /* ── Normalize backend batch row to component DOCS shape ── */
    function normalizeBatchRow(row) {
      var d = row.data || {};
      var ts = row.uploaded_at
        ? new Date(row.uploaded_at).toLocaleString('en-IN', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
        : '';
      return {
        id:             row.batch_id,
        pdfs:           row.pdf_count,
        pages:          row.page_count,
        type:           row.document_type || d.type || 'Invoice',
        source:         row.source_channel || 'upload',
        data:            d,
        originalFilename: row.original_filename || d.original_filename || '',
        previewUrl:     null,
        uploaded:       ts,
        activeStep:     row.active_step,
        completedSteps: row.completed_steps || [],
        status:         row.status === 'completed' ? 'Completed' :
                        row.status === 'failed' ? 'Failed' :
                        row.status === 'processing' ? 'Processing' : 'Stopped',
        reason:         row.stop_reason || d.reason || ''
      };
    }

    /* ── Load real data from API ── */
    var apiRef = this.api;
    function loadTransactionsForTenant(tenantId) {
      if (!tenantId || !entityId) return;
      apiRef.getEntityInvoices(tenantId, entityId).subscribe({
        next: function(response) { INVOICES = response.data || []; },
        error: function() { INVOICES = []; }
      });
      apiRef.getEntityExceptions(tenantId, entityId).subscribe({
        next: function(response) { EXCEPTIONS = response.data || []; },
        error: function() { EXCEPTIONS = []; }
      });
      apiRef.getEntityAuditEvents(tenantId, entityId, { limit: "100" }).subscribe({
        next: function(response) { AUDIT_EVENTS = response.data || []; },
        error: function() { AUDIT_EVENTS = []; }
      });
      apiRef.getEntityTransactions(tenantId, entityId).subscribe({
        next: function (response) {
          DOCS = (response.data || []).map(normalizeBatchRow);
          initClPageData();
          updateSourceStrip();
          renderDocTable(DOCS);
          loadClassificationPreviews(tenantId);
        },
        error: function () {
          DOCS = [];
          updateSourceStrip();
          renderDocTable(DOCS);
        }
      });
    }

    if (requestedTenantId) {
      loadTransactionsForTenant(requestedTenantId);
    } else {
      apiRef.getTenant().subscribe({
        next: function (tenantResponse) {
          var tenant = tenantResponse.data && tenantResponse.data[0];
          if (tenant) loadTransactionsForTenant(tenant.id);
        },
        error: function () {}
      });
    }

    /* ════════════════════════════════════════════════
       CLASSIFICATION TAB
    ════════════════════════════════════════════════ */

    // Vendor names come from real DOCS data (doc.vendor from DB batch rows)
    // No hardcoded fallback vendor list needed

    var CL_TYPES = [
      { label:"Invoice",          cls:"t-invoice",     dot:"#5b3fa8" },
      { label:"Purchase Order",   cls:"t-po",          dot:"#0a5d72" },
      { label:"Credit Note",      cls:"t-credit-note", dot:"#15795f" },
      { label:"Debit Note",       cls:"t-debit-note",  dot:"#b36d1e" },
      { label:"Remittance Advice",cls:"t-remittance",  dot:"#1a5aa0" },
      { label:"GRN",              cls:"t-grn",         dot:"#15795f" },
      { label:"Bank Statement",   cls:"t-bank-stmt",   dot:"#374f6a" },
      { label:"Proof of Delivery",cls:"t-pod",         dot:"#6a3e75" },
      { label:"Others",           cls:"t-others",      dot:"#6d8097" }
    ];

    function clTypeInfo(label) {
      for (var i = 0; i < CL_TYPES.length; i++) {
        if (CL_TYPES[i].label === label) return CL_TYPES[i];
      }
      return CL_TYPES[CL_TYPES.length - 1];
    }

    var clConfBase = {
      "Invoice": 97, "Purchase Order": 95, "Credit Note": 93,
      "Debit Note": 91, "Remittance Advice": 89,
      "GRN": 88, "Bank Statement": 92, "Proof of Delivery": 86, "Others": 72
    };

    function clConf(type, pageIdx) {
      var base = clConfBase[type] || 80;
      var jitter = ((pageIdx * 37 + 11) % 5) - 2;
      return Math.min(99, Math.max(60, base + jitter));
    }

    /* Per-batch page data: { batchId -> [{type, filename, conf}] } */
    var clPageData = {};

    function initClPageData() {
      DOCS.forEach(function(doc) {
        var pages = [];
        for (var p = 1; p <= doc.pages; p++) {
          var fname = doc.originalFilename || (doc.id + "_page_" + p + ".png");
          pages.push({
            type: doc.type,
            filename: fname,
            conf: clConf(doc.type, p),
            previewUrl: doc.previewUrl
          });
        }
        clPageData[doc.id] = pages;
      });
    }

    function loadClassificationPreviews(tenantId) {
      DOCS.forEach(function(doc) {
        apiRef.getTransactionPreview(tenantId, entityId, doc.id).subscribe({
          next: function(blob) {
            if (!blob.type || blob.type.indexOf("image/") !== 0) return;
            doc.previewUrl = URL.createObjectURL(blob);
            initClPageData();
            renderClassificationTab(document.getElementById("clSearch").value);
          },
          error: function() {}
        });
      });
    }

    var CL_VENDORS = {};

    function confColor(conf) {
      if (conf >= 95) return "#15795f";
      if (conf >= 85) return "#1a5aa0";
      if (conf >= 70) return "#b36d1e";
      return "#c0392b";
    }

    function clTypeBadgeHTML(type) {
      var info = clTypeInfo(type);
      return '<span class="cl-type-badge ' + info.cls + '" title="Click to change type">'
           + '<span class="cl-edit-hint">✎</span>' + type + '</span>';
    }

    function clSourceCls(src) {
      if (src === "sap")    return "source-sap";
      if (src === "upload") return "source-upload";
      if (src === "vendor") return "source-vendor";
      return "";
    }

    function renderClassificationTab(filter) {
      var list = document.getElementById("clBatchList");
      if (!list) return;
      filter = (filter || "").toLowerCase().trim();

      var html = "";
      DOCS.forEach(function(doc) {
        if (filter && doc.id.toLowerCase().indexOf(filter) === -1) return;
        var pages = clPageData[doc.id] || [];
        var srcCls = clSourceCls(doc.source);
        var srcLabel = doc.source === "sap" ? "SAP" : doc.source === "upload" ? "Upload" : "Vendor";
        var isOpen = clOpenState[doc.id] ? " open" : "";

        html += '<div class="cl-batch-accordion" data-batch="' + doc.id + '">'
              +   '<div class="cl-batch-head" data-toggle="' + doc.id + '">'
              +     '<span class="cl-bl">Batch ID</span>'
              +     '<span class="cl-bv batch-id">' + doc.id + '</span>'
              +     '<span class="cl-head-sep"></span>'
              +     '<span class="cl-bl">Pages</span>'
              +     '<span class="cl-bv page-count" style="margin-right:16px">' + doc.pages + '</span>'
              +     '<span class="cl-bl">Source</span>'
              +     '<span class="cl-bv ' + srcCls + '" style="margin-right:16px">' + srcLabel + '</span>'
              +     '<span class="cl-bl">Review</span>'
              +     '<button class="cl-review-btn" type="button" title="Review batch" onclick="event.stopPropagation();reviewBatch(\'' + doc.id + '\')">'
              +       '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5h9M7 2.5l4 4-4 4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
              +     '</button>'
              +     '<div class="cl-chevron' + (isOpen ? " open" : "") + '" data-toggle="' + doc.id + '">'
              +       '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
              +     '</div>'
              +   '</div>'
              +   '<div class="cl-batch-inner' + isOpen + '" id="cl-inner-' + doc.id + '">'
              +     '<div class="cl-inner-table"><table class="cl-table">'
              +       '<thead><tr>'
              +         '<th>IMAGE</th>'
              +         '<th>DOC TYPE</th>'
              +         '<th>CONFIDENCE</th>'
              +         '<th>ACTION</th>'
              +       '</tr></thead>'
              +       '<tbody>';

        pages.forEach(function(pg, pi) {
          var conf = pg.conf;
          var cc   = confColor(conf);
          var pct  = conf + "%";
          var thumb = pg.previewUrl
            ? '<img class="cl-img-preview" src="' + pg.previewUrl + '" alt="' + escHtml(pg.filename) + '" />'
            : '<div class="cl-img-thumb">🖼</div>';
          html += '<tr>'
                +   '<td><div class="cl-img-cell">'
                +     thumb
                +     '<div class="cl-img-name">' + escHtml(pg.filename)
                +       '<small>Page ' + (pi+1) + ' of ' + doc.pages + '</small></div>'
                +   '</div></td>'
                +   '<td>' + clTypeBadgeHTML(pg.type) + '</td>'
                +   '<td><div class="conf-bar">'
                +     '<div class="conf-track"><div class="conf-fill" style="width:' + pct + ';background:' + cc + '"></div></div>'
                +     '<span class="conf-label" style="color:' + cc + '">' + pct + '</span>'
                +   '</div></td>'
                +   '<td><button class="cl-action-btn" type="button" title="Change type" data-batch="' + doc.id + '" data-page="' + pi + '">'
                +     '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5h9M7 2.5l4 4-4 4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                +   '</button></td>'
                + '</tr>';
        });

        html += '</tbody></table></div></div></div>';
      });

      if (!html) {
        html = '<div class="tab-empty"><div class="tab-empty-icon"><svg width="26" height="26" viewBox="0 0 26 26" fill="none"><circle cx="13" cy="13" r="10" stroke="#8a9fb8" stroke-width="1.8"/><path d="M9 13h8M13 9v8" stroke="#8a9fb8" stroke-width="1.5" stroke-linecap="round"/></svg></div><h3>No Batches Found</h3><p>No batches match your search.</p></div>';
      }

      list.innerHTML = html;

      /* bind action buttons after render */
      list.querySelectorAll(".cl-action-btn, .cl-type-badge").forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          var batchId = btn.getAttribute("data-batch") || btn.closest("tr").querySelector(".cl-action-btn").getAttribute("data-batch");
          var pageIdx = parseInt(btn.getAttribute("data-page") || btn.closest("tr").querySelector(".cl-action-btn").getAttribute("data-page"), 10);
          openTypePopup(e, batchId, pageIdx);
        });
      });

      /* bind accordion heads */
      list.querySelectorAll("[data-toggle]").forEach(function(el) {
        el.addEventListener("click", function(e) {
          e.stopPropagation();
          var id = el.getAttribute("data-toggle");
          toggleBatchAccordion(id);
        });
      });
    }

    function escHtml(s) {
      return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }

    function formatAmount(value) {
      var amount = Number(value);
      if (!Number.isFinite(amount)) return "—";
      return "₹" + amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    }

    var clOpenState = {};

    function toggleBatchAccordion(batchId) {
      clOpenState[batchId] = !clOpenState[batchId];
      var inner   = document.getElementById("cl-inner-" + batchId);
      var chevrons = document.querySelectorAll("[data-toggle='" + batchId + "'] .cl-chevron, .cl-chevron[data-toggle='" + batchId + "']");
      if (inner) inner.classList.toggle("open", !!clOpenState[batchId]);
      chevrons.forEach(function(c) { c.classList.toggle("open", !!clOpenState[batchId]); });
      /* also update chevron inside batch head */
      var acc = document.querySelector('[data-batch="' + batchId + '"]');
      if (acc) {
        var chev = acc.querySelector(".cl-chevron");
        if (chev) chev.classList.toggle("open", !!clOpenState[batchId]);
      }
    }

    function reviewBatch(batchId) {
      /* open the accordion so user sees the pages */
      clOpenState[batchId] = true;
      renderClassificationTab(document.getElementById("clSearch").value);
    }

    /* Type popup */
    var clActivePopupTarget = null;

    function openTypePopup(event, batchId, pageIdx) {
      var popup = document.getElementById("typePopup");
      var currentType = (clPageData[batchId] && clPageData[batchId][pageIdx]) ? clPageData[batchId][pageIdx].type : "";

      var inner = '<div class="type-popup-title">Change Doc Type</div>';
      CL_TYPES.forEach(function(t) {
        var isActive = t.label === currentType ? ' active' : '';
        inner += '<div class="type-opt' + isActive + '" data-batch="' + batchId + '" data-page="' + pageIdx + '" data-type="' + t.label + '">'
               + '<span class="type-opt-dot" style="background:' + t.dot + '"></span>' + t.label + '</div>';
      });
      popup.innerHTML = inner;

      var rect = event.target.getBoundingClientRect ? event.target.getBoundingClientRect() : { left:0, bottom:0, right:0 };
      var pw   = 195;
      var left = Math.min(rect.left, window.innerWidth - pw - 8);
      popup.style.top  = (rect.bottom + 6) + "px";
      popup.style.left = left + "px";
      popup.classList.remove("hidden");

      popup.querySelectorAll(".type-opt").forEach(function(opt) {
        opt.addEventListener("click", function(e) {
          e.stopPropagation();
          var b = opt.getAttribute("data-batch");
          var p = parseInt(opt.getAttribute("data-page"), 10);
          var newType = opt.getAttribute("data-type");
          if (clPageData[b] && clPageData[b][p]) {
            clPageData[b][p].type = newType;
            clPageData[b][p].conf = clConf(newType, p);
          }
          popup.classList.add("hidden");
          renderClassificationTab(document.getElementById("clSearch").value);
        });
      });

      clActivePopupTarget = { batchId: batchId, pageIdx: pageIdx };
    }

    document.addEventListener("click", function(e) {
      var popup = document.getElementById("typePopup");
      if (popup && !popup.classList.contains("hidden")) {
        if (!popup.contains(e.target)) {
          popup.classList.add("hidden");
        }
      }
    });

    /* Search */
    var clSearchEl = document.getElementById("clSearch");
    if (clSearchEl) {
      clSearchEl.addEventListener("input", function() {
        renderClassificationTab(this.value);
      });
    }

    /* Wire classification tab click to render */
    document.querySelectorAll(".tab-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        if (btn.getAttribute("data-tab") === "classification") {
          renderClassificationTab("");
        }
      });
    });

    /* Init classification data */
    initClPageData();
  }
}
