// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { ApiService } from '../api.service';
import { EntityAccessService } from '../entity-access.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-reconciliation',
  standalone: true,
  imports: [],
  templateUrl: './reconciliation.html',
  styleUrl: './reconciliation.css',
  encapsulation: ViewEncapsulation.None
})
export class ReconciliationComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(EntityAccessService);
  tenantName = environment.TENANTNAME;
  ngAfterViewInit(): void {
    initTopBar();
    document.getElementById("reconModal")?.classList.toggle(
      "read-only",
      !this.access.hasAny("ap.process", "ar.process")
    );

    /* ── Invoice data ──────────────────────────────────── */
    var INVOICES = [
      { id:"INV-NTL-2291", vendor:"Tata Consultancy",  gstin:"27AABCT1332L1ZA", amount:"$482,000",  amtNum:482000, po:"PO-NTL-0078", grn:"GRN-NTL-0311", status:"matched",   variance:"$0",      variancePct:"0%",   date:"17-Jul-2026",
        lineItems:[
          { line:1, desc:"Software License — Enterprise", hsn:"99831",  poQty:10,  poRate:"$24,100",  poAmt:"$241,000", invQty:10,  invRate:"$24,100",  invAmt:"$241,000", grnQty:10,  grnRate:"$24,100",  grnAmt:"$241,000", match:"matched" },
          { line:2, desc:"Implementation Services",       hsn:"99833",  poQty:40,  poRate:"$3,000",   poAmt:"$120,000", invQty:40,  invRate:"$3,000",   invAmt:"$120,000", grnQty:40,  grnRate:"$3,000",   grnAmt:"$120,000", match:"matched" },
          { line:3, desc:"Support & Maintenance (12mo)",  hsn:"99831",  poQty:12,  poRate:"$10,083",  poAmt:"$121,000", invQty:12,  invRate:"$10,083",  invAmt:"$121,000", grnQty:12,  grnRate:"$10,083",  grnAmt:"$121,000", match:"matched" },
        ],
        poData:  { amount:"$482,000", qty:"120 Units",  vendor:"Tata Consultancy",  tax:"18% GST", date:"10-Jul-2026", terms:"Net 30" },
        invData: { amount:"$482,000", qty:"120 Units",  vendor:"Tata Consultancy",  tax:"18% GST", date:"17-Jul-2026", terms:"Net 30" },
        grnData: { amount:"$482,000", qty:"120 Units",  vendor:"Tata Consultancy",  tax:"18% GST", date:"14-Jul-2026", terms:"Net 30" },
        approvals:[
          { step:"Invoice Received",     who:"System",         when:"17-Jul 09:12", status:"done",   action:"Auto-ingested via SAP" },
          { step:"PO Verification",      who:"System AI",      when:"17-Jul 09:13", status:"done",   action:"PO-NTL-0078 matched" },
          { step:"GRN Verification",     who:"System AI",      when:"17-Jul 09:14", status:"done",   action:"GRN-NTL-0311 matched" },
          { step:"Amount Validation",    who:"System AI",      when:"17-Jul 09:14", status:"done",   action:"3-way match: PASS" },
          { step:"L2 Approval",          who:"Fatima Khan",    when:"17-Jul 10:30", status:"done",   action:"Approved" },
          { step:"Payment Release",      who:"Pending",        when:"",             status:"active", action:"Awaiting L3" },
        ]
      },
      { id:"INV-NTL-2244", vendor:"Infosys Ltd",       gstin:"29AABCI3014N1Z3", amount:"$820,000",  amtNum:820000, po:"PO-NTL-0065", grn:"GRN-NTL-0298", status:"partial",   variance:"$2,000",  variancePct:"0.24%", date:"16-Jul-2026",
        lineItems:[
          { line:1, desc:"Cloud Hosting Services (Annual)", hsn:"99831", poQty:12,  poRate:"$42,000",  poAmt:"$5,04,000", invQty:12,  invRate:"$42,000",  invAmt:"$5,04,000", grnQty:12,  grnRate:"$42,000",  grnAmt:"$5,04,000", match:"matched" },
          { line:2, desc:"Data Migration Project",          hsn:"99833", poQty:1,   poRate:"$180,000", poAmt:"$1,80,000", invQty:1,   invRate:"$1,78,000", invAmt:"$1,78,000", grnQty:1,   grnRate:"$1,80,000", grnAmt:"$1,80,000", match:"partial" },
          { line:3, desc:"Training Sessions (4 batches)",   hsn:"99835", poQty:4,   poRate:"$9,500",   poAmt:"$38,000",   invQty:4,   invRate:"$9,500",   invAmt:"$38,000",   grnQty:4,   grnRate:"$9,500",   grnAmt:"$38,000",   match:"matched" },
        ],
        poData:  { amount:"$822,000", qty:"200 Units",  vendor:"Infosys Ltd",       tax:"18% GST", date:"05-Jul-2026", terms:"Net 45" },
        invData: { amount:"$820,000", qty:"200 Units",  vendor:"Infosys Ltd",       tax:"18% GST", date:"16-Jul-2026", terms:"Net 45" },
        grnData: { amount:"$822,000", qty:"200 Units",  vendor:"Infosys Ltd",       tax:"18% GST", date:"12-Jul-2026", terms:"Net 45" },
        approvals:[
          { step:"Invoice Received",     who:"System",       when:"16-Jul 11:00", status:"done",    action:"Auto-ingested" },
          { step:"PO Verification",      who:"System AI",    when:"16-Jul 11:01", status:"done",    action:"PO matched" },
          { step:"GRN Verification",     who:"System AI",    when:"16-Jul 11:02", status:"done",    action:"GRN matched" },
          { step:"Amount Validation",    who:"System AI",    when:"16-Jul 11:02", status:"warn",    action:"Amount variance $2,000 detected" },
          { step:"Exception Review",     who:"Vikram Kumar", when:"",             status:"active",  action:"Pending review" },
          { step:"Payment Release",      who:"Pending",      when:"",             status:"wait",    action:"On hold" },
        ]
      },
      { id:"INV-NTL-2198", vendor:"Wipro Technologies",gstin:"29AABCW0013L1ZN", amount:"$124,000",  amtNum:124000, po:"PO-NTL-0052", grn:"GRN-NTL-0280", status:"unmatched", variance:"$6,000",  variancePct:"4.84%", date:"14-Jul-2026",
        lineItems:[
          { line:1, desc:"Network Switches (24-port)",   hsn:"85176", poQty:20,  poRate:"$4,000",  poAmt:"$80,000",  invQty:18,  invRate:"$4,000",  invAmt:"$72,000",  grnQty:20,  grnRate:"$4,000",  grnAmt:"$80,000",  match:"unmatched" },
          { line:2, desc:"Installation & Config",        hsn:"99833", poQty:10,  poRate:"$2,000",  poAmt:"$20,000",  invQty:10,  invRate:"$2,000",  invAmt:"$20,000",  grnQty:10,  grnRate:"$2,000",  grnAmt:"$20,000",  match:"matched" },
          { line:3, desc:"Cabling & Accessories",        hsn:"85444", poQty:1,   poRate:"$30,000", poAmt:"$30,000",  invQty:1,   invRate:"$32,000", invAmt:"$32,000",  grnQty:1,   grnRate:"$30,000", grnAmt:"$30,000",  match:"partial" },
        ],
        poData:  { amount:"$130,000", qty:"30 Units",   vendor:"Wipro Technologies",tax:"12% GST", date:"01-Jul-2026", terms:"Net 30" },
        invData: { amount:"$124,000", qty:"28 Units",   vendor:"Wipro Technologies",tax:"12% GST", date:"14-Jul-2026", terms:"Net 30" },
        grnData: { amount:"$130,000", qty:"30 Units",   vendor:"Wipro Technologies",tax:"12% GST", date:"08-Jul-2026", terms:"Net 30" },
        approvals:[
          { step:"Invoice Received",   who:"System",       when:"14-Jul 14:00", status:"done",   action:"Auto-ingested" },
          { step:"PO Verification",    who:"System AI",    when:"14-Jul 14:01", status:"done",   action:"PO found" },
          { step:"GRN Verification",   who:"System AI",    when:"14-Jul 14:02", status:"fail",   action:"Qty mismatch: PO=30, INV=28" },
          { step:"Exception Review",   who:"Asha Menon",   when:"",             status:"active", action:"Under review" },
          { step:"Resolution",         who:"Pending",      when:"",             status:"wait",   action:"Waiting for vendor clarification" },
          { step:"Payment Release",    who:"Pending",      when:"",             status:"wait",   action:"Blocked" },
        ]
      },
      { id:"INV-NTL-2310", vendor:"HCL Technologies",  gstin:"06AABCH4617E1ZK", amount:"$218,500",  amtNum:218500, po:"PO-NTL-0081", grn:"GRN-NTL-0318", status:"matched",   variance:"$0",      variancePct:"0%",   date:"17-Jul-2026",
        lineItems:[
          { line:1, desc:"IT Consulting (50 days)",       hsn:"99833", poQty:50,  poRate:"$3,500",  poAmt:"$175,000", invQty:50,  invRate:"$3,500",  invAmt:"$175,000", grnQty:50,  grnRate:"$3,500",  grnAmt:"$175,000", match:"matched" },
          { line:2, desc:"Project Management",            hsn:"99835", poQty:1,   poRate:"$28,000", poAmt:"$28,000",   invQty:1,   invRate:"$28,000", invAmt:"$28,000",   grnQty:1,   grnRate:"$28,000", grnAmt:"$28,000",   match:"matched" },
          { line:3, desc:"Technical Documentation",       hsn:"99833", poQty:1,   poRate:"$15,500", poAmt:"$15,500",   invQty:1,   invRate:"$15,500", invAmt:"$15,500",   grnQty:1,   grnRate:"$15,500", grnAmt:"$15,500",   match:"matched" },
        ],
        poData:  { amount:"$218,500", qty:"50 Units",   vendor:"HCL Technologies",  tax:"18% GST", date:"12-Jul-2026", terms:"Net 30" },
        invData: { amount:"$218,500", qty:"50 Units",   vendor:"HCL Technologies",  tax:"18% GST", date:"17-Jul-2026", terms:"Net 30" },
        grnData: { amount:"$218,500", qty:"50 Units",   vendor:"HCL Technologies",  tax:"18% GST", date:"15-Jul-2026", terms:"Net 30" },
        approvals:[
          { step:"Invoice Received",  who:"System",       when:"17-Jul 08:00", status:"done",   action:"Auto-ingested via SAP" },
          { step:"PO Verification",   who:"System AI",    when:"17-Jul 08:01", status:"done",   action:"PO matched" },
          { step:"GRN Verification",  who:"System AI",    when:"17-Jul 08:02", status:"done",   action:"GRN matched" },
          { step:"Amount Validation", who:"System AI",    when:"17-Jul 08:02", status:"done",   action:"3-way match: PASS" },
          { step:"L2 Approval",       who:"Fatima Khan",  when:"17-Jul 09:15", status:"done",   action:"Approved" },
          { step:"Payment Release",   who:"Ravi Shankar", when:"17-Jul 11:00", status:"done",   action:"Payment disbursed" },
        ]
      },
      { id:"INV-NTL-2188", vendor:"Mahindra Logistics", gstin:"27AABCM3095F1ZQ", amount:"$67,200",   amtNum:67200,  po:"PO-NTL-0041", grn:"GRN-NTL-0260", status:"disputed",  variance:"$12,800", variancePct:"19.0%", date:"13-Jul-2026",
        lineItems:[
          { line:1, desc:"Freight Services — Mumbai–Delhi", hsn:"99652", poQty:160, poRate:"$500",    poAmt:"$80,000",  invQty:160, invRate:"$420",    invAmt:"$67,200",  grnQty:160, grnRate:"$500",    grnAmt:"$80,000",  match:"disputed" },
        ],
        poData:  { amount:"$80,000",  qty:"160 Units",  vendor:"Mahindra Logistics", tax:"5% GST",  date:"28-Jun-2026", terms:"Net 15" },
        invData: { amount:"$67,200",  qty:"160 Units",  vendor:"Mahindra Logistics", tax:"5% GST",  date:"13-Jul-2026", terms:"Net 15" },
        grnData: { amount:"$80,000",  qty:"160 Units",  vendor:"Mahindra Logistics", tax:"5% GST",  date:"05-Jul-2026", terms:"Net 15" },
        approvals:[
          { step:"Invoice Received",  who:"System",       when:"13-Jul 10:00", status:"done",   action:"Auto-ingested" },
          { step:"PO Verification",   who:"System AI",    when:"13-Jul 10:01", status:"done",   action:"PO matched" },
          { step:"GRN Verification",  who:"System AI",    when:"13-Jul 10:02", status:"fail",   action:"Amount variance 19%: PO $80K vs INV $67.2K" },
          { step:"Dispute Raised",    who:"Asha Menon",   when:"13-Jul 11:30", status:"fail",   action:"Formal dispute raised with vendor" },
          { step:"Resolution",        who:"Pending",      when:"",             status:"active", action:"Awaiting vendor response" },
          { step:"Payment Release",   who:"Pending",      when:"",             status:"wait",   action:"Frozen pending resolution" },
        ]
      },
      { id:"INV-NTL-2275", vendor:"Tata Consultancy",  gstin:"27AABCT1332L1ZA", amount:"$310,000",  amtNum:310000, po:"PO-NTL-0071", grn:"GRN-NTL-0304", status:"pending",   variance:"—",       variancePct:"—",    date:"15-Jul-2026",
        lineItems:[
          { line:1, desc:"Software Subscription (Annual)", hsn:"99831", poQty:1,   poRate:"$180,000", poAmt:"$180,000", invQty:1,   invRate:"$180,000", invAmt:"$180,000", grnQty:"—", grnRate:"—",         grnAmt:"—",         match:"pending" },
          { line:2, desc:"API License Pack (50 calls/s)",  hsn:"99831", poQty:1,   poRate:"$90,000",   poAmt:"$90,000",   invQty:1,   invRate:"$90,000",   invAmt:"$90,000",   grnQty:"—", grnRate:"—",         grnAmt:"—",         match:"pending" },
          { line:3, desc:"Technical Support SLA",          hsn:"99835", poQty:12,  poRate:"$3,333",    poAmt:"$40,000",   invQty:12,  invRate:"$3,333",    invAmt:"$40,000",   grnQty:"—", grnRate:"—",         grnAmt:"—",         match:"pending" },
        ],
        poData:  { amount:"$310,000", qty:"80 Units",   vendor:"Tata Consultancy",  tax:"18% GST", date:"08-Jul-2026", terms:"Net 30" },
        invData: { amount:"$310,000", qty:"80 Units",   vendor:"Tata Consultancy",  tax:"18% GST", date:"15-Jul-2026", terms:"Net 30" },
        grnData: { amount:"—",         qty:"—",           vendor:"—",                 tax:"—",        date:"Awaited",     terms:"—" },
        approvals:[
          { step:"Invoice Received",  who:"System",       when:"15-Jul 16:00", status:"done",   action:"Auto-ingested" },
          { step:"PO Verification",   who:"System AI",    when:"15-Jul 16:01", status:"done",   action:"PO matched" },
          { step:"GRN Verification",  who:"System AI",    when:"",             status:"active", action:"Awaiting GRN from warehouse" },
          { step:"Amount Validation", who:"Pending",      when:"",             status:"wait",   action:"On hold" },
          { step:"L2 Approval",       who:"Pending",      when:"",             status:"wait",   action:"On hold" },
          { step:"Payment Release",   who:"Pending",      when:"",             status:"wait",   action:"On hold" },
        ]
      },
    ];

    /* ── Build vendor bars chart ─────────────────────── */
    var vendors = [
      { name:"Tata Consultancy",   amount:"$7.92L",  pct:82 },
      { name:"Infosys Ltd",        amount:"$8.20L",  pct:100 },
      { name:"HCL Technologies",   amount:"$2.18L",  pct:27 },
      { name:"Wipro Technologies", amount:"$1.24L",  pct:15 },
      { name:"Mahindra Logistics", amount:"$0.67L",  pct:8  },
    ];

    var vendorBars = document.getElementById("vendorBars");
    if (vendorBars) {
      vendorBars.innerHTML = vendors.map(function(v) {
        return '<div class="bar-row">'
          + '<div class="bar-row-label"><span>' + v.name + '</span><span>' + v.amount + '</span></div>'
          + '<div class="bar-track"><div class="bar-fill" style="width:' + v.pct + '%;background:linear-gradient(90deg,#0d7c97,#2ab0c8)"></div></div>'
          + '</div>';
      }).join("");
    }

    /* ── Match status badge ──────────────────────────── */
    var STATUS_MAP = {
      matched:   { label:"3-Way Matched",  cls:"matched",   icon:"✓" },
      approved:  { label:"3-Way Matched",  cls:"matched",   icon:"✓" },
      paid:      { label:"Paid",           cls:"matched",   icon:"✓" },
      partial:   { label:"Partial Match",  cls:"partial",   icon:"⚠" },
      unmatched: { label:"Unmatched",      cls:"unmatched", icon:"✗" },
      disputed:  { label:"Disputed",       cls:"disputed",  icon:"!" },
      pending:   { label:"Pending Review", cls:"pending",   icon:"○" },
    };

    function matchBadge(status) {
      var m = STATUS_MAP[status] || { label:status, cls:"pending", icon:"?" };
      return '<span class="match-badge ' + m.cls + '">' + m.icon + ' ' + m.label + '</span>';
    }

    function updateReconciliationSummary(invoices, exceptions) {
      var total = invoices.length;
      var matched = invoices.filter(function(inv) { return ["matched", "approved", "paid"].indexOf(inv.status) >= 0; }).length;
      var partial = invoices.filter(function(inv) { return ["partial", "partially_matched", "under_review"].indexOf(inv.status) >= 0; }).length;
      var unmatched = invoices.filter(function(inv) { return ["unmatched", "disputed", "rejected"].indexOf(inv.status) >= 0; }).length;
      var totalValue = invoices.reduce(function(sum, inv) { return sum + Number(inv.amtNum || 0); }, 0);
      var matchRate = total ? (matched / total) * 100 : 0;
      var exceptionCount = (exceptions || []).filter(function(item) {
        return ["resolved", "closed"].indexOf(String(item.status || "").toLowerCase()) < 0;
      }).length;
      var dates = invoices.map(function(inv) { return new Date(inv.rawDate || ""); }).filter(function(date) { return !isNaN(date.getTime()); });
      var latestDate = dates.sort(function(a, b) { return b.getTime() - a.getTime(); })[0];

      document.getElementById("kpiTotal").textContent = String(total);
      document.getElementById("kpiMatched").textContent = String(matched);
      document.getElementById("kpiPartial").textContent = String(partial);
      document.getElementById("kpiUnmatched").textContent = String(unmatched);
      document.getElementById("kpiValue").textContent = "$" + totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 });
      document.getElementById("kpiTotalTrend").textContent = "Live from entity data";
      document.getElementById("kpiMatchedTrend").textContent = matchRate.toFixed(1) + "% match rate";
      document.getElementById("kpiPartialTrend").textContent = "Amount or quantity variance";
      document.getElementById("kpiUnmatchedTrend").textContent = exceptionCount + " open exception" + (exceptionCount === 1 ? "" : "s");
      document.getElementById("kpiValueTrend").textContent = "Live from entity data";
      document.getElementById("autoMatchPill").textContent = "Auto-Match: " + matchRate.toFixed(1) + "%";
      document.getElementById("exceptionsPill").textContent = "Exceptions Pending: " + exceptionCount;
      document.getElementById("periodPill").textContent = latestDate
        ? "Period: " + latestDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
        : "Period: —";
    }

    /* ── Render invoice table ────────────────────────── */
    var displayedInvoices = INVOICES.slice();
    var ACTIVE_PURCHASE_ORDERS = [];
    var ACTIVE_TENANT_ID = "";
    var CURRENT_ENTITY_ID = "";
    var currentReconInvoice = null;

    function renderTable(data) {
      var tbody = document.getElementById("invoiceTbody");
      document.getElementById("tableFooter").textContent = "Showing " + data.length + " of " + INVOICES.length + " invoices";

      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9aafc4;padding:24px">No invoices match the filters.</td></tr>';
        return;
      }

      tbody.innerHTML = data.map(function(inv, i) {
        var varStyle = inv.status === "matched" ? "color:var(--ok);font-weight:700" : (inv.status === "unmatched" || inv.status === "disputed") ? "color:var(--bad);font-weight:700" : "color:var(--warn);font-weight:700";
        return '<tr data-idx="' + i + '">'
          + '<td><span class="inv-id">' + inv.id + '</span></td>'
          + '<td><div class="vendor-cell">' + inv.vendor + '</div><div class="vendor-sub">' + inv.gstin + '</div></td>'
          + '<td><span class="amount-cell">' + inv.amount + '</span></td>'
          + '<td style="font-family:monospace;font-size:11px;color:#5a7289">' + inv.po + '</td>'
          + '<td style="font-family:monospace;font-size:11px;color:#5a7289">' + inv.grn + '</td>'
          + '<td>' + matchBadge(inv.status) + '</td>'
          + '<td style="font-size:11px;' + varStyle + '">' + inv.variance + '</td>'
          + '<td style="font-size:11px;color:#5e728b;white-space:nowrap">' + inv.date + '</td>'
          + '<td><button class="view-btn primary-btn recon-btn" type="button" data-idx="' + i + '">View Reconciliation</button></td>'
          + '</tr>';
      }).join("");

      tbody.querySelectorAll(".recon-btn").forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          openRecon(data[parseInt(btn.getAttribute("data-idx"), 10)]);
        });
      });

      tbody.querySelectorAll("tr").forEach(function(tr) {
        tr.addEventListener("click", function(e) {
          if (e.target.closest("button")) return;
          var idx = parseInt(tr.getAttribute("data-idx"), 10);
          openRecon(data[idx]);
        });
      });
    }

    /* ── Document viewer state ──────────────────────── */
    var viewerState = { inv:null, docType:"po", page:0, zoom:1, markersOn:true, docActions:{} };

    /* ── Generate SVG document ───────────────────────── */
    function buildDocSVG(type, inv, pageIdx) {
      var W = 595, H = 842;
      var isInv = type === "inv", isPO = type === "po", isGRN = type === "grn";
      var accentColor = isPO ? "#0d7c97" : isInv ? "#5b3fa8" : "#15795f";
      var lightColor  = isPO ? "#e6f6fb" : isInv ? "#f0ebfd" : "#e6f9f2";
      var docLabel    = isPO ? "PURCHASE ORDER" : isInv ? "TAX INVOICE" : "GOODS RECEIPT NOTE";
      var docId       = isPO ? inv.po : isInv ? inv.id : inv.grn;
      var data        = isPO ? inv.poData : isInv ? inv.invData : inv.grnData;
      var dateLabel   = data.date || "—";
      var lines       = inv.lineItems || [];

      /* Page 2 is a continuation / stamp page */
      if (pageIdx === 1) {
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:595px;height:842px">'
          + '<rect width="' + W + '" height="' + H + '" fill="#fff"/>'
          + '<rect width="' + W + '" height="6" fill="' + accentColor + '"/>'
          + '<text x="' + W/2 + '" y="80" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-size="13" fill="' + accentColor + '" font-weight="700">' + docLabel + ' (Continued)</text>'
          + '<text x="' + W/2 + '" y="100" text-anchor="middle" font-family="monospace" font-size="11" fill="#8a9fb8">' + docId + '</text>'
          + '<line x1="40" y1="120" x2="555" y2="120" stroke="#dce8f0" stroke-width="1"/>'
          + buildTermsBlock(W, accentColor, data)
          + buildSignatureBlock(W, H, accentColor, isInv ? "AUTHORISED SIGNATORY" : isPO ? "PROCUREMENT OFFICER" : "WAREHOUSE MANAGER", inv.vendor)
          + '</svg>';
      }

      var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:595px;height:842px">';

      /* White background */
      svg += '<rect width="' + W + '" height="' + H + '" fill="#fff" rx="2"/>';

      /* Top colour bar */
      svg += '<rect width="' + W + '" height="8" fill="' + accentColor + '"/>';

      /* Header section */
      svg += '<rect x="0" y="8" width="' + W + '" height="90" fill="' + lightColor + '"/>';

      /* Company logo placeholder */
      svg += '<rect x="36" y="22" width="44" height="44" rx="10" fill="' + accentColor + '"/>';
      svg += '<text x="58" y="50" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-size="18" fill="#fff" font-weight="900">' + (inv.vendor.split(" ").slice(0,2).map(function(w){return w[0];}).join("")) + '</text>';

      /* Doc type label */
      svg += '<text x="94" y="42" font-family="Plus Jakarta Sans,sans-serif" font-size="19" fill="' + accentColor + '" font-weight="800">' + docLabel + '</text>';
      svg += '<text x="94" y="58" font-family="monospace" font-size="11" fill="#7a8ea4">' + docId + ' · ' + dateLabel + '</text>';
      svg += '<text x="94" y="74" font-family="monospace" font-size="10" fill="#9aafc4">GSTIN: ' + inv.gstin + '</text>';

      /* From / To block */
      svg += '<rect x="36" y="110" width="240" height="75" rx="7" fill="' + lightColor + '" stroke="' + accentColor + '" stroke-opacity=".2" stroke-width="1"/>';
      svg += '<text x="46" y="127" font-family="Plus Jakarta Sans,sans-serif" font-size="9" fill="' + accentColor + '" font-weight="800">' + (isPO ? "TO (VENDOR)" : "FROM (VENDOR)") + '</text>';
      svg += '<text x="46" y="143" font-family="Plus Jakarta Sans,sans-serif" font-size="12" fill="#1e3550" font-weight="700">' + inv.vendor + '</text>';
      svg += '<text x="46" y="158" font-family="monospace" font-size="10" fill="#7a8ea4">' + inv.gstin + '</text>';
      svg += '<text x="46" y="172" font-family="monospace" font-size="10" fill="#7a8ea4">India · Net ' + (data.terms || "30") + '</text>';

      svg += '<rect x="310" y="110" width="245" height="75" rx="7" fill="' + lightColor + '" stroke="' + accentColor + '" stroke-opacity=".2" stroke-width="1"/>';
      svg += '<text x="320" y="127" font-family="Plus Jakarta Sans,sans-serif" font-size="9" fill="' + accentColor + '" font-weight="800">BILL TO</text>';
      svg += '<text x="320" y="143" font-family="Plus Jakarta Sans,sans-serif" font-size="12" fill="#1e3550" font-weight="700">' + (viewerState.inv ? viewerState.inv.vendor : "NTL India Pvt Ltd") + '</text>';
      svg += '<text x="320" y="158" font-family="monospace" font-size="10" fill="#7a8ea4">27AABCN1234L1ZA</text>';
      svg += '<text x="320" y="172" font-family="monospace" font-size="10" fill="#7a8ea4">Mumbai, Maharashtra 400001</text>';

      /* Line items table header */
      var tY = 206;
      svg += '<rect x="36" y="' + tY + '" width="523" height="24" rx="4" fill="' + accentColor + '"/>';
      var cols = [{x:46,w:180,label:"DESCRIPTION"},{x:230,w:60,label:"HSN"},{x:292,w:60,label:"QTY"},{x:354,w:80,label:"RATE"},{x:436,w:50,label:"TAX"},{x:488,w:71,label:"AMOUNT"}];
      cols.forEach(function(c){
        svg += '<text x="' + (c.x + c.w/2) + '" y="' + (tY+15) + '" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-size="9" fill="#fff" font-weight="800">' + c.label + '</text>';
      });

      /* Line item rows */
      var rowY = tY + 24;
      lines.forEach(function(li, i) {
        var bg = i % 2 === 0 ? "#f8fbfe" : "#fff";
        svg += '<rect x="36" y="' + rowY + '" width="523" height="30" fill="' + bg + '"/>';
        svg += '<text x="46" y="' + (rowY+18) + '" font-family="DM Sans,sans-serif" font-size="10" fill="#1e3550" font-weight="700">' + li.desc.substring(0,28) + '</text>';
        svg += '<text x="46" y="' + (rowY+28) + '" font-family="monospace" font-size="9" fill="#9aafc4">HSN ' + li.hsn + '</text>';
        var qty  = type === "po" ? li.poQty  : type === "inv" ? li.invQty  : li.grnQty;
        var rate = type === "po" ? li.poRate : type === "inv" ? li.invRate : li.grnRate;
        var amt  = type === "po" ? li.poAmt  : type === "inv" ? li.invAmt  : li.grnAmt;
        var mismatch = li.match !== "matched" && li.match !== "pending";
        var numColor = mismatch && type === "inv" ? "#b74444" : "#2b3f57";
        svg += '<text x="' + (292+30) + '" y="' + (rowY+18) + '" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="11" fill="' + numColor + '" font-weight="700">' + qty + '</text>';
        svg += '<text x="' + (354+40) + '" y="' + (rowY+18) + '" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="11" fill="' + numColor + '" font-weight="700">' + rate + '</text>';
        svg += '<text x="' + (436+25) + '" y="' + (rowY+18) + '" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="10" fill="#6a8099">' + data.tax + '</text>';
        svg += '<text x="' + (488+35) + '" y="' + (rowY+18) + '" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-size="11" fill="' + numColor + '" font-weight="800">' + amt + '</text>';
        rowY += 30;
      });

      /* Bottom border of table */
      svg += '<line x1="36" y1="' + rowY + '" x2="559" y2="' + rowY + '" stroke="#dce8f0" stroke-width="1.5"/>';
      rowY += 12;

      /* Subtotal / Total block */
      var totY = rowY + 10;
      svg += '<rect x="360" y="' + totY + '" width="199" height="66" rx="6" fill="' + lightColor + '" stroke="' + accentColor + '" stroke-opacity=".2" stroke-width="1"/>';
      svg += '<text x="370" y="' + (totY+18) + '" font-family="DM Sans,sans-serif" font-size="11" fill="#6d8097">Sub Total</text>';
      svg += '<text x="550" y="' + (totY+18) + '" text-anchor="end" font-family="DM Sans,sans-serif" font-size="11" fill="#2b3f57" font-weight="700">' + data.amount + '</text>';
      svg += '<text x="370" y="' + (totY+36) + '" font-family="DM Sans,sans-serif" font-size="11" fill="#6d8097">GST (' + data.tax + ')</text>';
      svg += '<text x="550" y="' + (totY+36) + '" text-anchor="end" font-family="DM Sans,sans-serif" font-size="11" fill="#2b3f57" font-weight="700">Included</text>';
      svg += '<line x1="370" y1="' + (totY+44) + '" x2="550" y2="' + (totY+44) + '" stroke="' + accentColor + '" stroke-opacity=".3" stroke-width="1"/>';
      svg += '<text x="370" y="' + (totY+58) + '" font-family="Plus Jakarta Sans,sans-serif" font-size="13" fill="' + accentColor + '" font-weight="800">Total Amount</text>';
      svg += '<text x="550" y="' + (totY+58) + '" text-anchor="end" font-family="Plus Jakarta Sans,sans-serif" font-size="13" fill="' + accentColor + '" font-weight="900">' + data.amount + '</text>';

      /* Amount in words */
      svg += '<rect x="36" y="' + (totY) + '" width="310" height="66" rx="6" fill="#f8fbfe" stroke="#dce8f0" stroke-width="1"/>';
      svg += '<text x="46" y="' + (totY+18) + '" font-family="DM Sans,sans-serif" font-size="9" fill="' + accentColor + '" font-weight="800">AMOUNT IN WORDS</text>';
      svg += '<text x="46" y="' + (totY+34) + '" font-family="DM Sans,sans-serif" font-size="10" fill="#374f6a">Rupees ' + data.amount + ' Only</text>';
      svg += '<text x="46" y="' + (totY+50) + '" font-family="DM Sans,sans-serif" font-size="9" fill="#9aafc4">Subject to ' + (data.terms || "Net 30") + ' payment terms</text>';

      /* Bank details for invoice */
      if (isInv) {
        var bY = totY + 80;
        svg += '<rect x="36" y="' + bY + '" width="523" height="55" rx="6" fill="#f8fbfe" stroke="#dce8f0" stroke-width="1"/>';
        svg += '<text x="46" y="' + (bY+15) + '" font-family="DM Sans,sans-serif" font-size="9" fill="' + accentColor + '" font-weight="800">BANK DETAILS</text>';
        svg += '<text x="46" y="' + (bY+30) + '" font-family="monospace" font-size="10" fill="#374f6a">Bank: HDFC Bank | A/C: 50200012345678 | IFSC: HDFC0001234 | Branch: Andheri West, Mumbai</text>';
        svg += '<text x="46" y="' + (bY+45) + '" font-family="monospace" font-size="9" fill="#9aafc4">SWIFT: HDFCINBB · UPI: vendor@hdfcbank</text>';
      }

      svg += '</svg>';
      return svg;
    }

    function buildTermsBlock(W, color, data) {
      return '<text x="40" y="155" font-family="DM Sans,sans-serif" font-size="9" fill="' + color + '" font-weight="800">TERMS &amp; CONDITIONS</text>'
        + '<text x="40" y="173" font-family="DM Sans,sans-serif" font-size="9" fill="#6a8099">1. Payment due within ' + (data.terms || "Net 30") + ' days of invoice date.</text>'
        + '<text x="40" y="188" font-family="DM Sans,sans-serif" font-size="9" fill="#6a8099">2. Goods remain property of vendor until full payment received.</text>'
        + '<text x="40" y="203" font-family="DM Sans,sans-serif" font-size="9" fill="#6a8099">3. Disputes must be raised within 7 working days of receipt.</text>'
        + '<text x="40" y="218" font-family="DM Sans,sans-serif" font-size="9" fill="#6a8099">4. Subject to jurisdiction of courts at Mumbai, India.</text>';
    }

    function buildSignatureBlock(W, H, color, role, vendor) {
      var sY = H - 130;
      return '<line x1="40" y1="' + sY + '" x2="' + (W-40) + '" y2="' + sY + '" stroke="#dce8f0" stroke-width="1"/>'
        + '<rect x="' + (W-200) + '" y="' + (sY+15) + '" width="160" height="1" stroke="#1e3550" stroke-width="1" fill="none"/>'
        + '<text x="' + (W-120) + '" y="' + (sY+30) + '" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="9" fill="#6d8097">' + role + '</text>'
        + '<text x="' + (W-120) + '" y="' + (sY+45) + '" text-anchor="middle" font-family="DM Sans,sans-serif" font-size="10" fill="#374f6a" font-weight="700">' + vendor + '</text>'
        + '<text x="40" y="' + (H-20) + '" font-family="monospace" font-size="8" fill="#c0ccd9">This is a computer generated document · No signature required for digital submission</text>';
    }

    /* ── Render viewer ───────────────────────────────── */
    function renderDocViewer(inv, docType, pageIdx) {
      viewerState.inv     = inv;
      viewerState.docType = docType;
      viewerState.page    = pageIdx || 0;

      var totalPages = inv.lineItems && inv.lineItems.length > 2 ? 2 : 1;
      var docId = docType === "po" ? inv.po : docType === "inv" ? inv.id : inv.grn;
      var state = viewerState.docActions[inv.id + "_" + docType];

      /* Tab IDs */
      document.getElementById("tabBadgePo").textContent  = inv.po;
      document.getElementById("tabBadgeInv").textContent = inv.id;
      document.getElementById("tabBadgeGrn").textContent = inv.grn;

      /* Toolbar */
      document.getElementById("docViewerName").textContent  = docId;
      document.getElementById("docViewerPages").textContent = "Page " + (pageIdx + 1) + " of " + totalPages;
      document.getElementById("prevPageBtn").disabled = pageIdx === 0;
      document.getElementById("nextPageBtn").disabled = pageIdx >= totalPages - 1;

      /* Status dot */
      var dot = document.getElementById("docStatusDot");
      dot.style.background = state === "approved" ? "#15795f" : state === "rejected" ? "#b74444" : state === "flagged" ? "#b36d1e" : "#9aafc4";

      /* Action status */
      var statusEl = document.getElementById("docActionStatus");
      statusEl.textContent = state === "approved" ? "✓ Document Approved" : state === "rejected" ? "✗ Document Rejected" : state === "flagged" ? "⚠ Discrepancy Flagged" : "No action taken";
      statusEl.style.color = state === "approved" ? "#4ecca3" : state === "rejected" ? "#f07070" : state === "flagged" ? "#f0b44a" : "rgba(255,255,255,.35)";

      /* Thumbnails */
      var thumbsEl = document.getElementById("docThumbs");
      thumbsEl.innerHTML = "";
      for (var p = 0; p < totalPages; p++) {
        var thumbSvg = buildDocSVG(docType, inv, p);
        var div = document.createElement("div");
        div.className = "doc-thumb" + (p === pageIdx ? " active-thumb" : "");
        div.innerHTML = '<svg viewBox="0 0 595 842" style="pointer-events:none">' + thumbSvg.replace(/<svg[^>]*>/,"").replace("</svg>","") + '</svg>';
        div.innerHTML += '<div class="doc-thumb-label">Pg ' + (p+1) + '</div>';
        (function(pg){ div.addEventListener("click", function(){ renderDocViewer(inv, docType, pg); }); })(p);
        thumbsEl.appendChild(div);
      }

      /* Main document */
      var pageWrap = document.getElementById("docPageWrap");
      pageWrap.innerHTML = buildDocSVG(docType, inv, pageIdx);
      pageWrap.style.transform = "scale(" + viewerState.zoom + ")";

      /* Discrepancy markers */
      renderMarkers(inv, docType, pageWrap);

      /* Stamp overlay */
      var oldStamp = pageWrap.querySelector(".doc-approved-stamp, .doc-rejected-stamp");
      if (oldStamp) oldStamp.remove();
      if (state === "approved") {
        var stamp = document.createElement("div");
        stamp.className = "doc-approved-stamp";
        stamp.textContent = "APPROVED";
        pageWrap.appendChild(stamp);
      } else if (state === "rejected") {
        var stamp2 = document.createElement("div");
        stamp2.className = "doc-rejected-stamp";
        stamp2.textContent = "REJECTED";
        pageWrap.appendChild(stamp2);
      }
    }

    function renderMarkers(inv, docType, pageWrap) {
      pageWrap.querySelectorAll(".disc-marker").forEach(function(m){ m.remove(); });
      if (!viewerState.markersOn) return;
      if (docType !== "inv") return;

      (inv.lineItems || []).forEach(function(li, i) {
        if (li.match === "matched" || li.match === "pending") return;
        var topPx  = 230 + i * 30;
        var marker = document.createElement("div");
        marker.className = "disc-marker";
        marker.style.cssText = "left:470px;top:" + topPx + "px;width:90px;height:28px";
        var lbl = document.createElement("div");
        lbl.className = "disc-marker-label";
        lbl.textContent = li.match === "partial" ? "⚠ Variance" : "✗ Mismatch";
        marker.appendChild(lbl);
        pageWrap.appendChild(marker);
      });
    }

    /* ── Tab switching ───────────────────────────────── */
    document.querySelectorAll(".doc-type-tab").forEach(function(btn) {
      btn.addEventListener("click", function() {
        document.querySelectorAll(".doc-type-tab").forEach(function(b){ b.classList.remove("active"); });
        btn.classList.add("active");
        if (viewerState.inv) renderDocViewer(viewerState.inv, btn.getAttribute("data-doctype"), 0);
      });
    });

    /* Zoom */
    document.getElementById("zoomInBtn").addEventListener("click", function() {
      viewerState.zoom = Math.min(2, viewerState.zoom + 0.25);
      document.getElementById("zoomLabel").textContent = Math.round(viewerState.zoom * 100) + "%";
      document.getElementById("docPageWrap").style.transform = "scale(" + viewerState.zoom + ")";
      document.getElementById("docPageWrap").style.transformOrigin = "top center";
    });

    document.getElementById("zoomOutBtn").addEventListener("click", function() {
      viewerState.zoom = Math.max(0.5, viewerState.zoom - 0.25);
      document.getElementById("zoomLabel").textContent = Math.round(viewerState.zoom * 100) + "%";
      document.getElementById("docPageWrap").style.transform = "scale(" + viewerState.zoom + ")";
      document.getElementById("docPageWrap").style.transformOrigin = "top center";
    });

    /* Page navigation */
    document.getElementById("prevPageBtn").addEventListener("click", function() {
      if (viewerState.page > 0 && viewerState.inv) renderDocViewer(viewerState.inv, viewerState.docType, viewerState.page - 1);
    });

    document.getElementById("nextPageBtn").addEventListener("click", function() {
      var total = viewerState.inv && viewerState.inv.lineItems && viewerState.inv.lineItems.length > 2 ? 2 : 1;
      if (viewerState.page < total - 1 && viewerState.inv) renderDocViewer(viewerState.inv, viewerState.docType, viewerState.page + 1);
    });

    /* Toggle markers */
    document.getElementById("toggleMarkersBtn").addEventListener("click", function() {
      viewerState.markersOn = !viewerState.markersOn;
      this.style.background = viewerState.markersOn ? "rgba(183,68,68,.2)" : "";
      if (viewerState.inv) renderMarkers(viewerState.inv, viewerState.docType, document.getElementById("docPageWrap"));
    });

    /* Document actions */
    function setDocAction(action) {
      if (!viewerState.inv) return;
      var key = viewerState.inv.id + "_" + viewerState.docType;
      viewerState.docActions[key] = action;
      renderDocViewer(viewerState.inv, viewerState.docType, viewerState.page);
    }

    document.getElementById("docApproveBtn").addEventListener("click", function() { setDocAction("approved"); });
    document.getElementById("docRejectBtn").addEventListener("click",  function() { setDocAction("rejected"); });
    document.getElementById("docFlagBtn").addEventListener("click",    function() { setDocAction("flagged"); });

    /* Note panel */
    document.getElementById("docNoteBtn").addEventListener("click", function() {
      document.getElementById("notePanel").classList.toggle("hidden");
    });

    document.getElementById("saveNoteBtn").addEventListener("click", function() {
      var txt = document.getElementById("noteText").value.trim();
      if (txt) {
        document.getElementById("docActionStatus").textContent = "📝 Note: " + txt.substring(0, 60);
        document.getElementById("docActionStatus").style.color = "rgba(255,255,255,.6)";
      }
      document.getElementById("notePanel").classList.add("hidden");
      document.getElementById("noteText").value = "";
    });

    document.getElementById("cancelNoteBtn").addEventListener("click", function() {
      document.getElementById("notePanel").classList.add("hidden");
    });

    /* ── Line item state (per invId + lineNum) ──────── */
    var lineState = {};

    function liKey(invId, line) { return invId + "__" + line; }

    function renderLineItems(inv) {
      var tbody = document.getElementById("lineItemTbody");
      if (!inv.lineItems || !inv.lineItems.length) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:#9aafc4;padding:18px;font-size:12px">No line item data available.</td></tr>';
        return;
      }

      var MATCH_ICON = { matched:"✅", partial:"⚠️", unmatched:"❌", disputed:"🚫", pending:"⏳" };
      var MATCH_CLS  = { matched:"ok", partial:"warn", unmatched:"bad", disputed:"warn", pending:"muted" };

      tbody.innerHTML = inv.lineItems.map(function(li) {
        var key      = liKey(inv.id, li.line);
        var state    = lineState[key];
        var rowCls   = state ? "li-" + state : "";
        var matchCls = MATCH_CLS[li.match] || "";
        var icon     = MATCH_ICON[li.match]  || "?";

        var qtyMatch  = li.poQty   === li.invQty;
        var rateMatch = li.poRate  === li.invRate;
        var amtMatch  = li.poAmt   === li.invAmt;

        var invQtyCls  = qtyMatch  ? "" : "bad";
        var invRateCls = rateMatch ? "" : "bad";
        var invAmtCls  = amtMatch  ? "" : "bad";

        var grnPending = li.grnQty === "—";

        var actionHtml;
        if (state === "approved") {
          actionHtml = '<span class="li-approved-tag">✓ Approved</span> <button class="li-btn undo" data-key="' + key + '" data-inv="' + inv.id + '">Undo</button>';
        } else if (state === "rejected") {
          actionHtml = '<span class="li-rejected-tag">✗ Rejected</span> <button class="li-btn undo" data-key="' + key + '" data-inv="' + inv.id + '">Undo</button>';
        } else if (state === "disputed") {
          actionHtml = '<span class="li-disputed-tag">! Disputed</span> <button class="li-btn undo" data-key="' + key + '" data-inv="' + inv.id + '">Undo</button>';
        } else {
          actionHtml = '<div class="li-action-group">'
            + '<button class="li-btn approve" data-key="' + key + '" data-action="approved" data-inv="' + inv.id + '">✓ Approve</button>'
            + '<button class="li-btn reject"  data-key="' + key + '" data-action="rejected" data-inv="' + inv.id + '">✗ Reject</button>'
            + (li.match !== "matched" ? '<button class="li-btn dispute" data-key="' + key + '" data-action="disputed" data-inv="' + inv.id + '">! Dispute</button>' : '')
            + '</div>';
        }

        return '<tr class="' + rowCls + '" data-key="' + key + '">'
          + '<td style="font-weight:800;color:#6d8097;text-align:center">' + li.line + '</td>'
          + '<td><div class="li-desc">' + li.desc + '<small>HSN: ' + li.hsn + '</small></div></td>'
          + '<td>' + li.poQty + '</td>'
          + '<td>' + li.poRate + '</td>'
          + '<td style="font-weight:700">' + li.poAmt + '</td>'
          + '<td class="li-num-cell ' + invQtyCls  + '">' + li.invQty + '</td>'
          + '<td class="li-num-cell ' + invRateCls + '">' + li.invRate + '</td>'
          + '<td class="li-num-cell ' + invAmtCls  + '">' + li.invAmt + '</td>'
          + '<td class="li-num-cell grn-col ' + (grnPending ? "muted" : "") + '">' + li.grnQty + '</td>'
          + '<td class="li-num-cell grn-col ' + (grnPending ? "muted" : "") + '">' + li.grnRate + '</td>'
          + '<td class="li-num-cell grn-col ' + (grnPending ? "muted" : "") + '">' + li.grnAmt + '</td>'
          + '<td style="text-align:center;font-size:16px">' + icon + '</td>'
          + '<td>' + actionHtml + '</td>'
          + '</tr>';
      }).join("");

      /* Wire buttons */
      tbody.querySelectorAll("[data-action]").forEach(function(btn) {
        btn.addEventListener("click", function() {
          lineState[btn.getAttribute("data-key")] = btn.getAttribute("data-action");
          renderLineItems(inv);
          updateLineProgress(inv);
        });
      });

      tbody.querySelectorAll(".li-btn.undo").forEach(function(btn) {
        btn.addEventListener("click", function() {
          delete lineState[btn.getAttribute("data-key")];
          renderLineItems(inv);
          updateLineProgress(inv);
        });
      });

      updateLineProgress(inv);
      updateLineSummary(inv);
    }

    function updateLineSummary(inv) {
      if (!inv.lineItems) return;
      var matched   = inv.lineItems.filter(function(li){ return li.match === "matched"; }).length;
      var partial   = inv.lineItems.filter(function(li){ return li.match === "partial"; }).length;
      var unmatched = inv.lineItems.filter(function(li){ return li.match === "unmatched" || li.match === "disputed"; }).length;
      var pending   = inv.lineItems.filter(function(li){ return li.match === "pending"; }).length;
      var html = "";
      if (matched)   html += '<span class="li-stat ok">✅ ' + matched   + ' Matched</span>';
      if (partial)   html += '<span class="li-stat warn">⚠️ ' + partial  + ' Partial</span>';
      if (unmatched) html += '<span class="li-stat bad">❌ ' + unmatched + ' Unmatched</span>';
      if (pending)   html += '<span class="li-stat muted">⏳ ' + pending  + ' Pending</span>';
      var el = document.getElementById("liSummaryBar");
      if (el) el.innerHTML = html;
    }

    function updateLineProgress(inv) {
      if (!inv.lineItems) return;
      var total    = inv.lineItems.length;
      var actioned = inv.lineItems.filter(function(li){ return !!lineState[liKey(inv.id, li.line)]; }).length;
      var pct      = total ? Math.round(actioned / total * 100) : 0;
      var label    = document.getElementById("liProgressLabel");
      var pctEl    = document.getElementById("liProgressPct");
      var fill     = document.getElementById("liProgressFill");
      var progEl   = document.getElementById("liApproveProgress");
      if (label) label.textContent = actioned + " of " + total + " lines actioned";
      if (pctEl) pctEl.textContent = pct + "%";
      if (fill)  fill.style.width  = pct + "%";
      if (progEl) progEl.textContent = actioned + " / " + total + " lines actioned";
    }

    /* ── Open reconciliation detail ──────────────────── */
    function openRecon(inv) {
      currentReconInvoice = inv;
      document.getElementById("reconModalTitle").textContent = "Reconciliation — " + inv.id;
      document.getElementById("reconModalSub").textContent   = inv.vendor + " · " + inv.po + (ACTIVE_MATCHING_POLICY.matchingMode === "two_way" ? "" : " · " + inv.grn);
      renderManualPoAssignment(inv);

      var sb = document.getElementById("reconStatusBadge");
      var m  = STATUS_MAP[inv.status] || STATUS_MAP.pending;
      sb.className     = "match-badge " + m.cls;
      sb.textContent   = m.icon + " " + m.label;

      /* Header match summary */
      var headerFields = [
        { name:"Amount",   po:inv.poData.amount, inv:inv.invData.amount, grn:ACTIVE_MATCHING_POLICY.matchingMode === "two_way" ? "—" : inv.grnData.amount },
        { name:"Quantity", po:inv.poData.qty,    inv:inv.invData.qty,    grn:ACTIVE_MATCHING_POLICY.matchingMode === "two_way" ? "—" : inv.grnData.qty    },
        { name:"Vendor",   po:inv.poData.vendor, inv:inv.invData.vendor, grn:ACTIVE_MATCHING_POLICY.matchingMode === "two_way" ? "—" : inv.grnData.vendor },
        { name:"Tax Rate", po:inv.poData.tax,    inv:inv.invData.tax,    grn:ACTIVE_MATCHING_POLICY.matchingMode === "two_way" ? "—" : inv.grnData.tax    },
        { name:"Terms",    po:inv.poData.terms,  inv:inv.invData.terms,  grn:ACTIVE_MATCHING_POLICY.matchingMode === "two_way" ? "—" : inv.grnData.terms  },
      ];
      var headerPassCount = headerFields.filter(function(f) {
        return ACTIVE_MATCHING_POLICY.matchingMode === "two_way"
          ? f.po === f.inv
          : f.po === f.inv && f.inv === f.grn;
      }).length;
      var headerStateCls = headerPassCount === headerFields.length ? "ok" : headerPassCount >= 3 ? "warn" : "bad";
      var headerStateText = headerPassCount === headerFields.length ? "All headers match" : headerPassCount + " of " + headerFields.length + " headers match";
      document.getElementById("reconSummaryStrip").innerHTML =
        '<div class="recon-summary-card">'
        + '<div><div class="recon-summary-label">Invoice header</div><div class="recon-summary-sub">' + inv.vendor + ' · ' + inv.gstin + '</div></div>'
        + '<div class="recon-summary-value">' + inv.id + '</div>'
        + '</div>'
        + '<div class="recon-summary-card">'
        + '<div><div class="recon-summary-label">Header match</div><div class="recon-summary-sub">PO / Invoice / GRN · ' + headerStateText + '</div></div>'
        + '<div class="recon-summary-value ' + headerStateCls + '">' + headerPassCount + '/' + headerFields.length + '</div>'
        + '</div>'
        + '<div class="recon-summary-card">'
        + '<div><div class="recon-summary-label">Amount variance</div><div class="recon-summary-sub">' + inv.variancePct + ' from configured tolerance</div></div>'
        + '<div class="recon-summary-value ' + (inv.status === "matched" ? "ok" : inv.status === "partial" ? "warn" : "bad") + '">' + inv.variance + '</div>'
        + '</div>';

      /* Stepper */
      var RECON_STEPS = ["Invoice Received","PO Verification"];
      if (ACTIVE_MATCHING_POLICY.matchingMode !== "two_way") RECON_STEPS.push("GRN Verification");
      if (ACTIVE_MATCHING_POLICY.matchingMode === "four_way") RECON_STEPS.push("Inspection Verification");
      RECON_STEPS.push("Amount Validation","Exception Review","Payment Release");
      var stepStatuses = inv.approvals.map(function(a) { return a.status; });
      document.getElementById("reconStepper").innerHTML = RECON_STEPS.map(function(s, i) {
        var st = stepStatuses[i] || "wait";
        var cls = st === "done" ? "done" : st === "active" ? "active" : st === "fail" ? "fail" : st === "warn" ? "warn" : "";
        var connCls = i < RECON_STEPS.length - 1 ? (stepStatuses[i] === "done" ? "done" : stepStatuses[i] === "warn" ? "warn" : "") : "";
        var html = '<div class="rcon-step"><div class="rcon-circle ' + cls + '">' + (i + 1) + '</div><div class="rcon-label ' + cls + '">' + s + '</div></div>';
        if (i < RECON_STEPS.length - 1) html += '<div class="rcon-connector ' + connCls + '"></div>';
        return html;
      }).join("");

      /* 3-way comparison cards */
      var cards = [
        { key:"po",  title:"Purchase Order", id:inv.po,  icon:"📋", data:inv.poData  },
        { key:"inv", title:"Invoice",        id:inv.id,  icon:"🧾", data:inv.invData }
      ];
      if (ACTIVE_MATCHING_POLICY.matchingMode !== "two_way") {
        cards.push({ key:"grn", title:"Goods Receipt", id:inv.grn, icon:"📦", data:inv.grnData });
      }
      if (ACTIVE_MATCHING_POLICY.matchingMode === "four_way") {
        cards.push({ key:"inspection", title:"Inspection / Service Entry", id:"Configured source", icon:"🔎", data:{ status:"Awaiting inspection result", source:policySourceLabel(ACTIVE_MATCHING_POLICY.inspectionSource) } });
      }
      var comparisonDocs = cards.filter(function(c) { return c.key !== "inspection"; }).map(function(c) { return c.data; });
      document.getElementById("threeWayGrid").innerHTML = cards.map(function(c) {
        var fields = Object.entries(c.data);
        var amtMatch = comparisonDocs.every(function(d) { return d.amount === comparisonDocs[0].amount; });
        var qtyMatch = comparisonDocs.every(function(d) { return d.qty === comparisonDocs[0].qty; });
        return '<div class="doc-card ' + c.key + '-card">'
          + '<div class="doc-card-head">'
          + '<div class="doc-card-icon ' + c.key + '">' + c.icon + '</div>'
          + '<div><div class="doc-card-title">' + c.title + '</div><div class="doc-card-id">' + c.id + '</div></div>'
          + '</div>'
          + '<div class="doc-card-body">'
          + fields.map(function(kv) {
              var isAmtWarn = kv[0] === "amount" && !amtMatch;
              var isQtyWarn = kv[0] === "qty"    && !qtyMatch;
              var valCls = (isAmtWarn || isQtyWarn) ? (inv.status === "unmatched" || inv.status === "disputed" ? "bad" : "warn") : "";
              return '<div class="doc-field"><span class="doc-field-label">' + kv[0].charAt(0).toUpperCase() + kv[0].slice(1) + '</span><span class="doc-field-val ' + valCls + '">' + kv[1] + '</span></div>';
            }).join("")
          + '</div>'
          + '</div>';
      }).join("");

      /* Match table */
      var fields = headerFields;
      document.getElementById("matchTableBody").innerHTML = fields.map(function(f) {
        var match = ACTIVE_MATCHING_POLICY.matchingMode === "two_way"
          ? f.po === f.inv
          : f.po === f.inv && f.inv === f.grn;
        var partialMatch = !match && (f.po === f.inv || (ACTIVE_MATCHING_POLICY.matchingMode !== "two_way" && (f.inv === f.grn || f.po === f.grn)));
        var icon = match ? "✅" : partialMatch ? "⚠️" : "❌";
        var resultCls = match ? "ok" : partialMatch ? "warn" : "bad";
        var result    = match ? "Match" : partialMatch ? "Partial" : "Mismatch";
        var variance  = match ? "—" : (f.name === "Amount" ? inv.variance : "Differs");
        return '<tr>'
          + '<td class="match-icon">' + icon + '</td>'
          + '<td class="field-name">' + f.name + '</td>'
          + '<td class="po-val">'  + f.po  + '</td>'
          + '<td class="inv-val">' + f.inv + '</td>'
          + '<td class="grn-val">' + (f.grn === "—" ? '<span style="color:#9aafc4">—</span>' : f.grn) + '</td>'
          + '<td><span class="diff-tag ' + resultCls + '">' + result + '</span></td>'
          + '<td style="font-size:11px;font-weight:700;color:' + (match ? "var(--ok)" : "var(--bad)") + '">' + variance + '</td>'
          + '</tr>';
      }).join("");

      /* Variance summary */
      var varZero   = inv.variance === "$0" || inv.variance === "—";
      var varHigh   = !varZero && parseFloat(inv.variancePct) > 5;
      var varCard1Cls = varZero ? "" : varHigh ? "bad" : "warn";
      var varCard2Cls = varCard1Cls;
      var varAmtColor = varZero ? "var(--ok)" : varHigh ? "var(--bad)" : "var(--warn)";
      var varPctColor = varAmtColor;
      document.getElementById("varianceRow").innerHTML =
        '<div class="var-card ' + varCard1Cls + '">'
        + '<div class="var-card-label">Amount Variance</div>'
        + '<div class="var-card-val" style="color:' + varAmtColor + '">' + inv.variance + '</div>'
        + '<div class="var-card-sub">' + (ACTIVE_MATCHING_POLICY.matchingMode === "two_way" ? "PO vs Invoice" : ACTIVE_MATCHING_POLICY.matchingMode === "four_way" ? "PO vs Invoice vs GRN vs Inspection" : "PO vs Invoice vs GRN") + '</div>'
        + '</div>'
        + '<div class="var-card ' + varCard2Cls + '">'
        + '<div class="var-card-label">Variance %</div>'
        + '<div class="var-card-val" style="color:' + varPctColor + '">' + inv.variancePct + '</div>'
        + '<div class="var-card-sub">Tolerance threshold: &lt;2%</div>'
        + '</div>'
        + '<div class="var-card">'
        + '<div class="var-card-label">Invoice Value</div>'
        + '<div class="var-card-val">' + inv.amount + '</div>'
        + '<div class="var-card-sub">' + inv.vendor + '</div>'
        + '</div>';

      /* Approval flow */
      document.getElementById("approvalFlow").innerHTML = inv.approvals.map(function(a) {
        var dotCls  = a.status === "done" ? "done" : a.status === "active" ? "active" : a.status === "fail" ? "fail" : "wait";
        var actCls  = a.status === "done" ? "ok"   : a.status === "active" ? "pending" : a.status === "fail" ? "fail" : "wait";
        var rowCls  = a.status === "done" ? "step-done" : a.status === "active" ? "step-active" : a.status === "fail" ? "step-fail" : "";
        var prefix  = a.status === "done" ? "✓ " : a.status === "fail" ? "✗ " : a.status === "active" ? "● " : "○ ";
        return '<div class="approval-step ' + rowCls + '">'
          + '<div class="appr-dot ' + dotCls + '"></div>'
          + '<div class="appr-content"><div class="appr-title">' + a.step + '</div><div class="appr-meta">' + a.who + (a.when ? " · " + a.when : "") + '</div></div>'
          + '<div class="appr-action ' + actCls + '">' + prefix + a.action + '</div>'
          + '</div>';
      }).join("");

      /* Document viewer — reset tab to PO, zoom to 1 */
      viewerState.zoom = 1;
      document.getElementById("zoomLabel").textContent = "100%";
      document.querySelectorAll(".doc-type-tab").forEach(function(b){ b.classList.remove("active"); });
      document.querySelector(".doc-type-tab[data-doctype='po']").classList.add("active");
      renderDocViewer(inv, "po", 0);

      /* Line items */
      renderLineItems(inv);

      /* Bulk approve / reject / reset */
      document.getElementById("approveAllMatchedBtn").onclick = function() {
        (inv.lineItems || []).forEach(function(li) {
          if (li.match === "matched") lineState[liKey(inv.id, li.line)] = "approved";
        });
        renderLineItems(inv);
      };

      document.getElementById("rejectAllUnmatchedBtn").onclick = function() {
        (inv.lineItems || []).forEach(function(li) {
          if (li.match === "unmatched" || li.match === "disputed") lineState[liKey(inv.id, li.line)] = "rejected";
        });
        renderLineItems(inv);
      };

      document.getElementById("clearAllLineBtn").onclick = function() {
        (inv.lineItems || []).forEach(function(li) {
          delete lineState[liKey(inv.id, li.line)];
        });
        renderLineItems(inv);
      };

      document.getElementById("reconOverlay").classList.remove("hidden");
    }

    function renderManualPoAssignment(inv) {
      var panel = document.getElementById("manualPoPanel");
      var select = document.getElementById("manualPoSelect");
      var message = document.getElementById("manualPoMessage");
      if (!panel || !select || !message) return;

      message.textContent = "";
      if (inv.po) {
        panel.classList.add("hidden");
        return;
      }

      panel.classList.remove("hidden");
      select.innerHTML = "";
      var placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = ACTIVE_PURCHASE_ORDERS.length ? "Select active PO" : "No active POs available";
      select.appendChild(placeholder);
      ACTIVE_PURCHASE_ORDERS.forEach(function(po) {
        var option = document.createElement("option");
        option.value = po.po_number;
        option.textContent = po.po_number + " · " + (po.vendor_name || "Vendor unavailable")
          + " · $" + Number(po.total_amount || 0).toLocaleString("en-IN");
        select.appendChild(option);
      });
    }

    /* ── Close modal ─────────────────────────────────── */
    function closeRecon() { document.getElementById("reconOverlay").classList.add("hidden"); }

    document.getElementById("closeRecon").addEventListener("click", closeRecon);
    document.getElementById("closeReconBottom").addEventListener("click", closeRecon);
    document.getElementById("reconOverlay").addEventListener("click", function(e) { if(e.target===this) closeRecon(); });

    document.getElementById("approveReconBtn").addEventListener("click", function() {
      var inv = viewerState.inv;
      if (!inv) return;
      apiRef.getTenant().subscribe({
        next: function(tenantResponse) {
          var tenant = tenantResponse.data && tenantResponse.data[0];
          if (!tenant) return;
          apiRef.approveInvoice(tenant.id, entityId, inv.id, '').subscribe({
            next: function() {
              inv.status = 'matched';
              renderTable(INVOICES);
              closeRecon();
              alert('Invoice ' + inv.id + ' approved. Payment release initiated.');
            },
            error: function(err) {
              alert('Approve failed: ' + ((err && err.error && err.error.error) || 'Server error'));
            }
          });
        },
        error: function() { alert('Unable to reach server. Please try again.'); }
      });
    });

    document.getElementById("rejectReconBtn").addEventListener("click", function() {
      var inv = viewerState.inv;
      if (!inv) return;
      apiRef.getTenant().subscribe({
        next: function(tenantResponse) {
          var tenant = tenantResponse.data && tenantResponse.data[0];
          if (!tenant) return;
          apiRef.rejectInvoice(tenant.id, entityId, inv.id, 'Disputed', '').subscribe({
            next: function() {
              inv.status = 'disputed';
              renderTable(INVOICES);
              closeRecon();
              alert('Invoice ' + inv.id + ' rejected. Dispute raised. Vendor notification sent.');
            },
            error: function(err) {
              alert('Reject failed: ' + ((err && err.error && err.error.error) || 'Server error'));
            }
          });
        },
        error: function() { alert('Unable to reach server. Please try again.'); }
      });
    });

    document.getElementById("escalateReconBtn").addEventListener("click", function(){ alert("Escalated to L3 Controller for review."); });

    /* ── Filters ─────────────────────────────────────── */
    function applyFilters() {
      var fSearch = document.getElementById("filterSearch").value.toLowerCase();
      var fStatus = document.getElementById("filterStatus").value;
      var fVendor = document.getElementById("filterVendor").value;
      displayedInvoices = INVOICES.filter(function(inv) {
        if (fSearch && inv.id.toLowerCase().indexOf(fSearch) < 0 && inv.vendor.toLowerCase().indexOf(fSearch) < 0 && inv.po.toLowerCase().indexOf(fSearch) < 0) return false;
        if (fStatus && inv.status !== fStatus) return false;
        if (fVendor && inv.vendor !== fVendor) return false;
        return true;
      });
      renderTable(displayedInvoices);
    }

    ["filterSearch","filterStatus","filterVendor","filterDate","filterAmount"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener("input", applyFilters); el.addEventListener("change", applyFilters); }
    });

    document.getElementById("runMatchBtn").addEventListener("click", function() {
      var btn = this as HTMLButtonElement;
      if (!entityId) {
        alert("Open reconciliation from an entity dashboard before running auto-match.");
        return;
      }
      btn.disabled = true;
      btn.textContent = "Running...";
      apiRef.getTenant().subscribe({
        next: function(tenantResponse) {
          var tenant = tenantResponse.data && tenantResponse.data[0];
          if (!tenant) {
            btn.disabled = false;
            btn.textContent = "Run Auto-Match";
            alert("No tenant is configured.");
            return;
          }
          apiRef.runEntityMatch(tenant.id, entityId).subscribe({
            next: function(response) {
              var summary = response.summary || {};
              apiRef.getEntityInvoices(tenant.id, entityId).subscribe({
                next: function(invoiceResponse) {
                  if (invoiceResponse.data && invoiceResponse.data.length) {
                    INVOICES = invoiceResponse.data.map(normalizeInvoiceRow);
                    renderTable(INVOICES);
                  }
                  btn.disabled = false;
                  btn.textContent = "Run Auto-Match";
                  alert("Auto-match complete. " + (summary.matched || 0) + " matched, " + (summary.disputed || 0) + " disputed.");
                },
                error: function() {
                  btn.disabled = false;
                  btn.textContent = "Run Auto-Match";
                  alert("Auto-match completed, but invoices could not be refreshed.");
                }
              });
            },
            error: function(err) {
              btn.disabled = false;
              btn.textContent = "Run Auto-Match";
              alert("Auto-match failed: " + ((err && err.error && err.error.error) || "Server error"));
            }
          });
        },
        error: function() {
          btn.disabled = false;
          btn.textContent = "Run Auto-Match";
          alert("Unable to load tenant information.");
        }
      });
    });
    document.getElementById("exportBtn").addEventListener("click", function() { alert("Exporting reconciliation report as CSV…"); });

    /* ── URL params ──────────────────────────────────── */
    var params = new URLSearchParams(window.location.search);
    var entityName = params.get("entityName") || localStorage.getItem("lx_entity_name") || "";
    var entityId   = params.get("entityId")   || localStorage.getItem("lx_entity_id")   || "";

    function readMatchingPolicy() {
      var policy = {};
      try {
        var draft = JSON.parse(localStorage.getItem("clientJourneyState") || "{}");
        if (draft.matchingPolicy) policy = draft.matchingPolicy;
        var created = JSON.parse(localStorage.getItem("createdEntitiesList") || "[]");
        var entity = created.find(function (item) {
          return (entityId && item.entityId === entityId) || (entityName && item.entityName === entityName);
        });
        if (entity && entity.matchingPolicy) policy = entity.matchingPolicy;
      } catch (e) {}
      if (params.get("matchingMode")) policy.matchingMode = params.get("matchingMode");
      if (params.get("ewayBillMode")) policy.ewayBillMode = params.get("ewayBillMode");
      if (params.get("ewayBillThreshold")) policy.ewayBillThreshold = Number(params.get("ewayBillThreshold"));
      return {
        matchingMode: policy.matchingMode || "three_way",
        poSource: policy.poSource || "sap",
        grnSource: policy.grnSource || "sap",
        inspectionSource: policy.inspectionSource || "not_applicable",
        ewayBillMode: policy.ewayBillMode || "required_above_threshold",
        ewayBillThreshold: Number(policy.ewayBillThreshold || 50000)
      };
    }

    function policySourceLabel(source) {
      return {
        sap: "SAP / ERP",
        excel: "Excel Upload",
        manual: "Manual Upload",
        vendor_portal: "Vendor Portal",
        quality_api: "Quality API",
        not_applicable: "Not Applicable"
      }[source] || source;
    }

    function applyMatchingPolicy(policy) {
      var modeLabel = policy.matchingMode === "two_way" ? "2-Way" : policy.matchingMode === "four_way" ? "4-Way" : "3-Way";
      var sources = [
        '<span class="policy-source required">PO: ' + policySourceLabel(policy.poSource) + '</span>',
        '<span class="policy-source required">Invoice: Intake</span>'
      ];
      if (policy.matchingMode !== "two_way") {
        sources.push('<span class="policy-source required">GRN: ' + policySourceLabel(policy.grnSource) + '</span>');
      }
      if (policy.matchingMode === "four_way") {
        sources.push('<span class="policy-source required">Inspection: ' + policySourceLabel(policy.inspectionSource) + '</span>');
      }
      document.getElementById("policyTitle").textContent = modeLabel + " Matching Policy";
      document.getElementById("policyDescription").textContent = modeLabel + " matching is active for this entity. Required document sources are shown below.";
      document.getElementById("policySources").innerHTML = sources.join("");
      var ewayText = policy.ewayBillMode === "required_above_threshold"
        ? "E-Way Bill: required above $" + policy.ewayBillThreshold.toLocaleString("en-IN")
        : "E-Way Bill: " + policy.ewayBillMode.replace(/_/g, " ");
      document.getElementById("policyEway").textContent = ewayText;
      document.getElementById("policyEway").className = "policy-source " + (policy.ewayBillMode === "not_applicable" ? "" : "warn");
      document.getElementById("matchedKpiLabel").textContent = modeLabel + " Matched";
      if (typeof STATUS_MAP !== "undefined" && STATUS_MAP.matched) STATUS_MAP.matched.label = modeLabel + " Matched";
      document.getElementById("comparisonSubtitle").textContent = modeLabel + " document comparison using the configured entity sources";
      document.getElementById("reconModalSub").textContent = modeLabel + " Match: " + (policy.matchingMode === "two_way" ? "PO vs Invoice" : policy.matchingMode === "four_way" ? "PO vs Invoice vs GRN vs Inspection" : "PO vs Invoice vs GRN");
      document.getElementById("invoiceListSubtitle").textContent = (entityName ? "Invoices for " + entityName + " — " : "") + "click any row to open the " + modeLabel.toLowerCase() + " reconciliation detail";
      document.getElementById("reconModal").classList.remove("mode-two-way", "mode-three-way", "mode-four-way");
      document.getElementById("reconModal").classList.add("mode-" + policy.matchingMode.replace("_", "-"));
      var statusOption = document.querySelector('#filterStatus option[value="matched"]');
      if (statusOption) statusOption.textContent = modeLabel + " Matched";
    }

    var ACTIVE_MATCHING_POLICY = readMatchingPolicy();
    applyMatchingPolicy(ACTIVE_MATCHING_POLICY);

    if (entityName) {
      document.getElementById("entityCrumbName").textContent = entityName;
      document.getElementById("ebName").textContent          = entityName;
      document.getElementById("ebIcon").textContent          = entityName.split(/[\s-]+/).slice(0,2).map(function(w){return w[0]||"";}).join("").toUpperCase();
      var activeModeLabel = ACTIVE_MATCHING_POLICY.matchingMode === "two_way" ? "2-way" : ACTIVE_MATCHING_POLICY.matchingMode === "four_way" ? "4-way" : "3-way";
      document.getElementById("ebSub").textContent           = "Invoice reconciliation for " + entityName + " — " + activeModeLabel + " matching" + (entityId ? " (" + entityId + ")" : "");
      document.getElementById("invoiceListSubtitle").textContent = "Invoices for " + entityName + " — click any row to open the " + (ACTIVE_MATCHING_POLICY.matchingMode === "two_way" ? "2-way" : ACTIVE_MATCHING_POLICY.matchingMode === "four_way" ? "4-way" : "3-way") + " reconciliation detail";
    }
    if (entityId) document.getElementById("ebEntityId").textContent = "Entity ID: " + entityId;

    var entityQS = (entityName || entityId) ? "?entityId=" + encodeURIComponent(entityId) + "&entityName=" + encodeURIComponent(entityName) : "";
    ["navDashboard","navTxns","navAudit","navUsers","navClassify","navExtract","navExceptions","backToDashboardLink","viewExceptionsBtn"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el && entityQS) { el.setAttribute("href", el.getAttribute("href").split("?")[0] + entityQS); }
    });

    /* ── Init ────────────────────────────────────────── */
    renderTable(INVOICES);

    /* ── Normalize backend invoice row to component shape ── */
    function normalizeInvoiceRow(row) {
      var d = row.data || {};
      return {
        id:           row.invoice_key,
        vendor:       row.vendor_name,
        gstin:        row.gstin || '',
        amount:       '$' + Number(row.amount_num).toLocaleString('en-US'),
        amtNum:       Number(row.amount_num),
        po:           row.po_ref  || '',
        grn:          row.grn_ref || '',
        status:       ["approved", "paid"].indexOf(String(row.match_status || "").toLowerCase()) >= 0 ? "matched" : row.match_status,
        variance:     row.variance_amount > 0 ? '$' + Number(row.variance_amount).toLocaleString('en-IN') : '$0',
        variancePct:  row.variance_amount > 0 ? ((row.variance_amount / row.amount_num) * 100).toFixed(2) + '%' : '0%',
        date:         row.invoice_date ? new Date(row.invoice_date).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '',
        rawDate:      row.invoice_date || row.created_at || '',
        lineItems:    d.lineItems    || [],
        poData:       d.poData       || {},
        invData:      d.invData      || {},
        grnData:      d.grnData      || {},
        approvals:    d.approvals    || []
      };
    }

    /* ── Load real data from API ── */
    var apiRef = this.api;
    CURRENT_ENTITY_ID = entityId;
    document.getElementById("assignPoBtn").addEventListener("click", function() {
      var select = document.getElementById("manualPoSelect") as HTMLSelectElement;
      var message = document.getElementById("manualPoMessage");
      if (!currentReconInvoice || !select || !message) return;
      if (!select.value) {
        message.textContent = "Select an active PO first.";
        message.style.color = "#ffd18a";
        return;
      }

      var button = document.getElementById("assignPoBtn") as HTMLButtonElement;
      button.disabled = true;
      message.textContent = "Assigning PO...";
      message.style.color = "rgba(255,255,255,.7)";
      apiRef.assignInvoicePurchaseOrder(
        ACTIVE_TENANT_ID,
        CURRENT_ENTITY_ID,
        currentReconInvoice.id,
        select.value
      ).subscribe({
        next: function(response) {
          currentReconInvoice.po = response.po.po_number;
          currentReconInvoice.poData = {
            amount: "$" + Number(response.po.total_amount || 0).toLocaleString("en-IN"),
            vendor: response.po.vendor_name || "Vendor unavailable",
            date: response.po.po_date || "—",
            terms: "—"
          };
          currentReconInvoice.status = "pending";
          currentReconInvoice.variance = "—";
          currentReconInvoice.variancePct = "—";
          button.disabled = false;
          closeRecon();
          renderTable(displayedInvoices);
          openRecon(currentReconInvoice);
        },
        error: function() {
          button.disabled = false;
          message.textContent = "Unable to assign the selected PO.";
          message.style.color = "#ffb1a7";
        }
      });
    });
    INVOICES = [];
    displayedInvoices = [];
    var ENTITY_EXCEPTIONS = [];
    renderTable([]);
    apiRef.getTenant().subscribe({
      next: function(tenantResponse) {
        var tenant = tenantResponse.data && tenantResponse.data[0];
        if (!tenant) {
          renderTable([]);
          return;
        }
        ACTIVE_TENANT_ID = tenant.id;
        apiRef.getActivePurchaseOrders(tenant.id, entityId).subscribe({
          next: function(response) {
            ACTIVE_PURCHASE_ORDERS = response.data || [];
            if (currentReconInvoice && !currentReconInvoice.po) renderManualPoAssignment(currentReconInvoice);
          },
          error: function() {
            ACTIVE_PURCHASE_ORDERS = [];
            if (currentReconInvoice && !currentReconInvoice.po) renderManualPoAssignment(currentReconInvoice);
          }
        });
        // Load invoices
        apiRef.getEntityInvoices(tenant.id, entityId).subscribe({
          next: function(response) {
            INVOICES = (response.data || []).map(normalizeInvoiceRow);
            displayedInvoices = INVOICES.slice();
            updateReconciliationSummary(INVOICES, ENTITY_EXCEPTIONS);
            renderTable(INVOICES);
          },
          error: function() {
            INVOICES = [];
            displayedInvoices = [];
            updateReconciliationSummary([], ENTITY_EXCEPTIONS);
            renderTable([]);
          }
        });
        apiRef.getEntityExceptions(tenant.id, entityId).subscribe({
          next: function(response) {
            ENTITY_EXCEPTIONS = response.data || [];
            updateReconciliationSummary(INVOICES, ENTITY_EXCEPTIONS);
          },
          error: function() {
            ENTITY_EXCEPTIONS = [];
            updateReconciliationSummary(INVOICES, ENTITY_EXCEPTIONS);
          }
        });
        // Load matching policy from entity API
        apiRef.getEntity(tenant.id, entityId).subscribe({
          next: function(entityData) {
            var matching = entityData.matchingPolicy;
            if (matching && matching.matching_method) {
              ACTIVE_MATCHING_POLICY.matchingMode = matching.matching_method;
              ACTIVE_MATCHING_POLICY.poSource     = matching.purchase_order_source_key || 'sap';
              ACTIVE_MATCHING_POLICY.grnSource    = matching.grn_source_key || 'sap';
              // Update UI labels
              var modeLabel = matching.matching_method === 'two_way' ? '2-way' : matching.matching_method === 'four_way' ? '4-way' : '3-way';
              var subtitleEl = document.getElementById('invoiceListSubtitle');
              var ebSubEl    = document.getElementById('ebSub');
              if (subtitleEl) subtitleEl.textContent = 'Invoices for ' + entityName + ' \u2014 ' + modeLabel + ' matching (' + entityId + ')';
              if (ebSubEl)    ebSubEl.textContent    = 'Invoice reconciliation for ' + entityName + ' \u2014 ' + modeLabel + ' matching (' + entityId + ')';
            }
          },
          error: function() {}
        });
      },
      error: function() {
        INVOICES = [];
        displayedInvoices = [];
        updateReconciliationSummary([], []);
        renderTable([]);
      }
    });
  }
}
