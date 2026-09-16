// @ts-nocheck
import { AfterViewInit, Component, inject } from '@angular/core';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-client-creation-journey',
  standalone: true,
  imports: [],
  templateUrl: './client-creation-journey.html',
  styleUrl: './client-creation-journey.css'
})
export class ClientCreationJourneyComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  private editEntityId: string | null = null;
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
var CREATED_ENTITIES_KEY = "createdEntitiesList";
    var editEntityId = new URLSearchParams(window.location.search).get("editEntityId");
    var component = this;

    /* â”€â”€ localStorage helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function readCreatedEntities() {
      try {
        var raw = localStorage.getItem(CREATED_ENTITIES_KEY);
        return raw ? (JSON.parse(raw) || []) : [];
      } catch (e) { return []; }
    }

    function writeCreatedEntities(entities) {
      localStorage.setItem(CREATED_ENTITIES_KEY, JSON.stringify(entities));
    }

    function formatDate(value) {
      var d = new Date(value);
      return isNaN(d.getTime()) ? "-" : d.toLocaleString();
    }

    /* â”€â”€ Intake mode labels / badges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    var INTAKE_LABELS = {
      sap:    { label: "SAP Touchless", cls: "sap",    icon: "âš¡" },
      upload: { label: "Doc Upload",    cls: "upload",  icon: "â¬†" },
      vendor: { label: "Vendor Portal", cls: "vendor",  icon: "ðŸ¢" }
      ,mail:   { label: "Mail Connector", cls: "mail",   icon: "âœ‰" }
    };

    var ROLE_DEFINITIONS = {
      entity_admin: {
        label: "Entity Admin",
        scope: "All enabled scopes",
        permissions: "Entity, users, roles, policies"
      },
      finance_controller: {
        label: "Finance Controller",
        scope: "AP + AR",
        permissions: "Approve, reconcile, reporting"
      },
      ap_manager: {
        label: "AP Manager",
        scope: "Accounts Payable",
        permissions: "Invoices, matching, payments"
      },
      ar_manager: {
        label: "AR Manager",
        scope: "Accounts Receivable",
        permissions: "Invoices, collections, reconciliation"
      }
    };

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function buildRoleEngine() {
      var apEnabled = document.getElementById("enableAP").checked;
      var arEnabled = document.getElementById("enableAR").checked;
      var roles = ["entity_admin"];
      if (apEnabled || arEnabled) roles.push("finance_controller");
      if (apEnabled) roles.push("ap_manager");
      if (arEnabled) roles.push("ar_manager");
      var defaultRole = document.getElementById("defaultRole").value;
      if (roles.indexOf(defaultRole) === -1) defaultRole = "entity_admin";
      return {
        enabled: document.getElementById("enableRbac").checked,
        defaultRole: defaultRole,
        roles: roles.map(function (key) {
          return {
            key: key,
            label: ROLE_DEFINITIONS[key].label,
            scope: ROLE_DEFINITIONS[key].scope,
            permissions: ROLE_DEFINITIONS[key].permissions
          };
        })
      };
    }

    function renderRoleEngine() {
      var engine = buildRoleEngine();
      var body = document.getElementById("roleEngineBody");
      var status = document.getElementById("roleEngineStatus");
      if (!body || !status) return;
      body.innerHTML = engine.roles.map(function (role) {
        return "<tr>"
          + "<td><strong>" + escapeHtml(role.label) + "</strong><small class=\"table-subtext\">" + escapeHtml(role.key) + "</small></td>"
          + "<td>" + escapeHtml(role.scope) + "</td>"
          + "<td>" + escapeHtml(role.permissions) + "</td>"
          + "<td>" + (role.key === engine.defaultRole ? '<span class="badge ok">Default</span>' : '<span class="badge">Available</span>') + "</td>"
          + "</tr>";
      }).join("");
      status.textContent = engine.enabled
        ? engine.roles.length + " roles generated from the selected AP / AR scope."
        : "RBAC is disabled. Roles are shown for planning only.";
    }

    function getSelectText(id: string): string {
      var el = document.getElementById(id) as HTMLSelectElement | null;
      return el && el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : "";
    }
    function renderConfigurationSnapshot() {
      var rows = [
        ["Industry", getSelectText("industry")],
        ["Region", getSelectText("region")],
        ["Document Types to Sync", getSelectText("sapDocTypes")],
        ["Default Role", getSelectText("defaultRole")],
        ["Matching Method", getSelectText("matchingMode")],
        ["Purchase Order Source", getSelectText("poSource")],
        ["GRN Source", getSelectText("grnSource")],
        ["Inspection / Service Entry", getSelectText("inspectionSource")],
        ["E-Way Bill Policy", getSelectText("ewayBillMode")],
        ["E-Way Bill Threshold", (document.getElementById("ewayBillThreshold") as HTMLInputElement | null)?.value || "0"]
      ];
      var body = document.getElementById("configurationSnapshotBody");
      if (body) {
        body.innerHTML = rows.map(function (row) {
          return "<tr><td>" + escapeHtml(row[0]) + "</td><td><strong>" + escapeHtml(row[1]) + "</strong></td></tr>";
        }).join("");
      }
    }

    function intakeBadge(mode) {
      var m = INTAKE_LABELS[mode] || { label: mode, cls: "", icon: "" };
      return "<span style=\"display:inline-flex;align-items:center;gap:3px;border-radius:999px;border:1px solid;padding:2px 7px;font-size:10px;font-weight:700;"
        + (m.cls === "sap"    ? "color:#0a4e6d;border-color:rgba(13,124,151,.4);background:rgba(13,124,151,.09);"
         : m.cls === "upload" ? "color:#1a5c40;border-color:rgba(21,121,95,.4);background:rgba(21,121,95,.09);"
         : m.cls === "vendor" ? "color:#4e2d82;border-color:rgba(78,45,130,.4);background:rgba(78,45,130,.08);"
         : m.cls === "mail" ? "color:#8a4c18;border-color:rgba(188,116,31,.4);background:rgba(188,116,31,.09);"
         : "")
        + "\">" + m.icon + " " + m.label + "</span>";
    }

    /* â”€â”€ Render created entities table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function renderCreatedEntities() {
      var rows = readCreatedEntities();
      var body = document.getElementById("createdEntitiesBody");
      var countText = document.getElementById("createdEntitiesCount");
      if (!body) return; // element absent in edit mode â€” safe to skip
      if (!rows.length) {
        body.innerHTML = '<tr class="empty-row"><td colspan="9">No entities created yet from this journey screen.</td></tr>';
        if (countText) countText.textContent = "0 records";
        return;
      }
      body.innerHTML = rows.map(function (item) {
        var apAr = [];
        if (item.apEnabled) apAr.push("AP");
        if (item.arEnabled) apAr.push("AR");
        return "<tr>"
          + "<td>" + escapeHtml(item.entityId) + "</td>"
          + "<td>" + escapeHtml(item.entityName) + "</td>"
          + "<td>" + escapeHtml(item.industry || "-") + "</td>"
          + "<td>" + item.region.toUpperCase() + "</td>"
          + "<td>" + (Array.isArray(item.intakeModes) ? item.intakeModes.map(intakeBadge).join(" ") : intakeBadge(item.intakeModes || "sap")) + "</td>"
          + "<td><strong>" + (apAr.join(" + ") || "-") + "</strong></td>"
          + "<td>" + escapeHtml((ROLE_DEFINITIONS[item.defaultRole] || {}).label || item.defaultRole || "-") + "</td>"
          + "<td><span class=\"badge ok\">" + item.status + "</span></td>"
          + "<td>" + formatDate(item.createdAt) + "</td>"
          + "</tr>";
      }).join("");
      if (countText) countText.textContent = rows.length + " records";
    }

    function showPostCreateCard(payload, createdEntity) {
      var area = document.getElementById("postCreateLinks");
      var countEl = document.getElementById("createdEntitiesCount");
      if (!area) return;
      var entityId   = payload.entity.entityId || createdEntity.entity_key || "";
      var entityName = payload.entity.entityName || "";
      var query = "?entityId=" + encodeURIComponent(entityId) + "&entityName=" + encodeURIComponent(entityName);
      area.innerHTML =
        "<div class=\"post-create-card\">"
        + "<div class=\"post-create-id\">" + escapeHtml(entityId) + "</div>"
        + "<div class=\"post-create-name\">" + escapeHtml(entityName) + "</div>"
        + "<div class=\"post-create-actions\">"
        + "<a class=\"btn\" href=\"/entity-dashboard" + query + "\">Open Dashboard</a>"
        + "<a class=\"btn primary\" href=\"/models-quality" + query + "\">Configure Models</a>"
        + "</div>"
        + "</div>";
      if (countEl) countEl.textContent = "Entity created";
    }

    function upsertCreatedEntity(payload) {
      var rows = readCreatedEntities();
      var record = {
        entityId:    payload.entity.entityId,
        entityName:  payload.entity.entityName,
        industry:    payload.entity.industry,
        region:      payload.entity.region,
        intakeModes: payload.intakeModes,
        matchingPolicy: payload.matchingPolicy,
        apEnabled:   payload.projectScope.accountsPayable,
        arEnabled:   payload.projectScope.accountsReceivable,
        defaultRole: payload.access.roleEngine.defaultRole,
        status:      payload.status,
        createdAt:   new Date().toISOString()
      };
      var idx = rows.findIndex(function (r) { return r.entityId === record.entityId; });
      if (idx >= 0) { rows[idx] = record; } else { rows.unshift(record); }
      writeCreatedEntities(rows);
      renderCreatedEntities();
    }

    /* â”€â”€ Intake mode multi-select â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    var intakeOptions = document.querySelectorAll(".intake-option");
    var configPanels  = { sap: "sapConfig", upload: "uploadConfig", vendor: "vendorConfig", mail: "mailConfig" };

    function syncIntakeUI() {
      intakeOptions.forEach(function (opt) {
        var cb = opt.querySelector("input[type=checkbox]");
        var on = cb && cb.checked;
        opt.classList.toggle("selected", on);
        opt.setAttribute("aria-checked", on ? "true" : "false");
      });
      Object.keys(configPanels).forEach(function (key) {
        var el = document.getElementById(configPanels[key]);
        var cb = document.querySelector(".intake-option[data-intake=" + key + "] input[type=checkbox]");
        if (el) el.hidden = !(cb && cb.checked);
      });
    }

    function toggleIntake(mode) {
      var opt = document.querySelector(".intake-option[data-intake=" + mode + "]");
      var cb  = opt && opt.querySelector("input[type=checkbox]");
      if (!cb) return;
      /* prevent deselecting the last active mode */
      var active = getSelectedIntake();
      if (active.length === 1 && active[0] === mode) return;
      cb.checked = !cb.checked;
      syncIntakeUI();
    }

    intakeOptions.forEach(function (opt) {
      opt.addEventListener("click", function () {
        toggleIntake(opt.getAttribute("data-intake"));
      });
      opt.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleIntake(opt.getAttribute("data-intake"));
        }
      });
    });

    function getSelectedIntake() {
      var modes = [];
      intakeOptions.forEach(function (opt) {
        var cb = opt.querySelector("input[type=checkbox]");
        if (cb && cb.checked) modes.push(opt.getAttribute("data-intake"));
      });
      return modes.length ? modes : ["sap"];
    }

    function syncMatchingPolicyUI() {
      var mode = document.getElementById("matchingMode").value;
      var grn = document.getElementById("grnSource");
      var inspection = document.getElementById("inspectionSource");
      var ewayMode = document.getElementById("ewayBillMode").value;
      var threshold = Number(document.getElementById("ewayBillThreshold").value || 0);
      grn.disabled = mode === "two_way";
      inspection.disabled = mode !== "four_way";
      if (mode === "two_way") grn.value = "not_applicable";
      if (mode !== "four_way") inspection.value = "not_applicable";
      document.getElementById("ewayThresholdField").hidden = ewayMode !== "required_above_threshold";
      var modeLabel = mode === "two_way" ? "2-way" : mode === "four_way" ? "4-way" : "3-way";
      var ewayLabel = ewayMode === "required_above_threshold"
        ? "required above â‚¹" + threshold.toLocaleString("en-IN")
        : ewayMode.replace(/_/g, " ");
      document.getElementById("matchingPolicySummary").textContent = modeLabel + " matching will validate the configured business documents. E-Way Bill policy: " + ewayLabel + ".";
    }

    ["matchingMode", "ewayBillMode", "ewayBillThreshold"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", syncMatchingPolicyUI);
      document.getElementById(id).addEventListener("input", syncMatchingPolicyUI);
    });

    /* â”€â”€ Stepper progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    var steps = document.querySelectorAll(".stepper .step");
    function setStep(n) {
      steps.forEach(function (s, i) {
        s.classList.toggle("done",   i < n);
        s.classList.toggle("active", i === n);
      });
    }

    /* â”€â”€ Build payload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function buildPayload() {
      var intake = getSelectedIntake();
      var roleEngine = buildRoleEngine();

      /* collect config only for selected modes */
      var intakeCfg = {};
      if (intake.indexOf("sap") !== -1) {
        intakeCfg.sap = {
          endpoint: document.getElementById("sapEndpoint").value.trim(),
          clientId: document.getElementById("sapClientId").value.trim(),
          docTypes: document.getElementById("sapDocTypes").value
        };
      }
      if (intake.indexOf("upload") !== -1) {
        intakeCfg.upload = {
          maxFileSize:     document.getElementById("uploadMaxSize").value,
          acceptedFormats: document.getElementById("uploadFormats").value
        };
      }
      if (intake.indexOf("vendor") !== -1) {
        intakeCfg.vendor = {
          portalUrl:   document.getElementById("vendorPortalUrl").value.trim(),
          autoApprove: document.getElementById("vendorAutoApprove").value === "true"
        };
      }
      if (intake.indexOf("mail") !== -1) {
        intakeCfg.mail = {
          provider: document.getElementById("mailProvider").value,
          mailbox: document.getElementById("mailboxAddress").value.trim(),
          username: document.getElementById("mailUsername").value.trim(),
          password: document.getElementById("mailPassword").value,
          folder: document.getElementById("mailFolder").value,
          syncFrequency: document.getElementById("mailSyncFrequency").value,
          connectionStatus: document.getElementById("mailConnectionStatus").textContent
        };
      }

      return {
        entity: {
          entityId:   document.getElementById("clientId").value.trim(),
          entityName: document.getElementById("clientName").value.trim(),
          industry:   document.getElementById("industry").value,
          region:     document.getElementById("region").value,
          adminEmail: document.getElementById("adminEmail").value.trim(),
          notes:      document.getElementById("notes").value.trim()
        },
        intakeModes:  intake,
        intakeConfig: intakeCfg,
        matchingPolicy: {
          matchingMode: document.getElementById("matchingMode").value,
          poSource: document.getElementById("poSource").value,
          grnSource: document.getElementById("grnSource").value,
          inspectionSource: document.getElementById("inspectionSource").value,
          ewayBillMode: document.getElementById("ewayBillMode").value,
          ewayBillThreshold: Number(document.getElementById("ewayBillThreshold").value || 0)
        },
        projectScope: {
          accountsPayable:    document.getElementById("enableAP").checked,
          accountsReceivable: document.getElementById("enableAR").checked
        },
        access: {
          userCreation: document.getElementById("enableUserCreation").checked,
          rbac:         document.getElementById("enableRbac").checked,
          defaultRole:  roleEngine.defaultRole,
          roleEngine:   roleEngine,
          adminCredentials: {
            username: document.getElementById("adminUsername").value.trim(),
            password: document.getElementById("adminPassword").value
          }
        },
        modules: {
          modelIntegration:       document.getElementById("enableModelIntegration").checked,
          promptVersioning:       document.getElementById("enablePromptVersion").checked,
          documentClassification: document.getElementById("enableClassification").checked,
          classOverride:          document.getElementById("enableClassOverride").checked,
          providerGovernance:     document.getElementById("enableProviderGov").checked,
          fallbackRouting:        document.getElementById("enableFallbackRouting").checked,
          apiIntegrations:        document.querySelector("#tog-apiIntegrations input[type='checkbox']").checked,
          gstTax:                 document.getElementById("enableGstApi").checked,
          identityKyc:            document.getElementById("enableKycApi").checked,
          banking:                document.getElementById("enableBankApi").checked,
          businessCompliance:     document.getElementById("enableBizApi").checked
        },
        status: "draft"
      };
    }

    function renderPayload() {
      return buildPayload();
    }

    /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
       INLINE VALIDATION ENGINE
       â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

    /* â”€â”€ Inject required asterisks on labels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    ["clientId","clientName","adminEmail","adminUsername"].forEach(function(id) {
      var lbl = document.querySelector("label[for='" + id + "']");
      if (lbl && !lbl.querySelector(".req")) {
        var ast = document.createElement("span");
        ast.className = "req";
        ast.textContent = "*";
        lbl.appendChild(ast);
      }
    });

    /* â”€â”€ Inject error message divs after each input â”€â”€â”€â”€â”€â”€â”€â”€ */
    function ensureErrorDiv(fieldId) {
      var existing = document.getElementById("err_" + fieldId);
      if (existing) return existing;
      var el = document.getElementById(fieldId);
      if (!el) return null;
      var div = document.createElement("div");
      div.id = "err_" + fieldId;
      div.className = "field-error-msg";
      el.parentNode.insertBefore(div, el.nextSibling);
      return div;
    }
    ["clientId","clientName","adminEmail","adminUsername","adminPassword",
     "sapEndpoint","sapClientId","vendorPortalUrl","mailboxAddress","ewayBillThreshold"].forEach(ensureErrorDiv);

    /* â”€â”€ Inject password strength widget â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    (function() {
      var pwField = document.getElementById("adminPassword");
      if (!pwField || document.getElementById("pwStrengthWrap")) return;
      var wrap = document.createElement("div");
      wrap.id = "pwStrengthWrap";
      wrap.className = "pw-strength-wrap";
      wrap.innerHTML = '<div class="pw-strength-bar"><div class="pw-strength-fill" id="pwStrengthFill"></div></div>' +
                       '<span class="pw-strength-label" id="pwStrengthLabel"></span>';
      pwField.parentNode.insertBefore(wrap, pwField.nextSibling);
    })();

    /* â”€â”€ Inject char counter for Entity ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    (function() {
      var idField = document.getElementById("clientId");
      if (!idField || document.getElementById("clientIdCounter")) return;
      var ctr = document.createElement("div");
      ctr.id = "clientIdCounter";
      ctr.className = "char-counter";
      idField.parentNode.insertBefore(ctr, idField.nextSibling);
      idField.addEventListener("input", function() {
        var len = idField.value.length;
        ctr.textContent = len + " / 30 chars";
        ctr.className = "char-counter" + (len > 30 ? " over" : len > 24 ? " warn" : "");
      });
    })();

    /* â”€â”€ Show / clear field error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function showError(fieldId, msg) {
      var el = document.getElementById(fieldId);
      if (el) el.classList.add("field-invalid");
      if (el) el.classList.remove("field-valid");
      var errDiv = document.getElementById("err_" + fieldId);
      if (errDiv) errDiv.textContent = msg;
    }
    function clearError(fieldId) {
      var el = document.getElementById(fieldId);
      if (el) { el.classList.remove("field-invalid"); el.classList.add("field-valid"); }
      var errDiv = document.getElementById("err_" + fieldId);
      if (errDiv) errDiv.textContent = "";
    }
    function clearAll() {
      ["clientId","clientName","adminEmail","adminUsername","adminPassword",
       "sapEndpoint","sapClientId","vendorPortalUrl","mailboxAddress","ewayBillThreshold"].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.classList.remove("field-invalid","field-valid"); }
        var errDiv = document.getElementById("err_" + id);
        if (errDiv) errDiv.textContent = "";
      });
    }

    /* â”€â”€ Validators â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var urlRe   = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
    var entityIdRe = /^[A-Z0-9][A-Z0-9\-]{1,29}$/;
    var usernameRe = /^[a-z0-9][a-z0-9._\-]{1,49}$/;

    function validateEntityId() {
      var val = (document.getElementById("clientId").value || "").trim().toUpperCase();
      document.getElementById("clientId").value = val; // auto-uppercase
      if (!val) { showError("clientId", "Entity ID is required."); return false; }
      if (!entityIdRe.test(val)) { showError("clientId", "Use uppercase letters, digits and hyphens only (e.g. CL-10042). No spaces."); return false; }
      clearError("clientId"); return true;
    }

    function validateEntityName() {
      var val = (document.getElementById("clientName").value || "").trim();
      if (!val) { showError("clientName", "Entity Name is required."); return false; }
      if (val.length < 3) { showError("clientName", "Entity Name must be at least 3 characters."); return false; }
      if (val.length > 120) { showError("clientName", "Entity Name must be 120 characters or fewer."); return false; }
      clearError("clientName"); return true;
    }

    function validateAdminEmail() {
      var val = (document.getElementById("adminEmail").value || "").trim();
      if (!val) { showError("adminEmail", "Admin email is required."); return false; }
      if (!emailRe.test(val)) { showError("adminEmail", "Enter a valid email address (e.g. admin@company.com)."); return false; }
      clearError("adminEmail"); return true;
    }

    function validateAdminUsername() {
      var val = (document.getElementById("adminUsername").value || "").trim();
      if (!val) { showError("adminUsername", "Admin username is required."); return false; }
      if (!usernameRe.test(val)) { showError("adminUsername", "Username: lowercase letters, digits, dots, hyphens only. No spaces."); return false; }
      clearError("adminUsername"); return true;
    }

    function getPasswordStrength(pw) {
      if (!pw || pw.length < 8)  return { score: 0, label: "Too short" };
      var score = 0;
      if (pw.length >= 8)  score++;
      if (/[A-Z]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++;
      if (/[^A-Za-z0-9]/.test(pw)) score++;
      if (score <= 1) return { score: 1, label: "Weak" };
      if (score === 2 || score === 3) return { score: 2, label: "Medium" };
      return { score: 3, label: "Strong" };
    }

    function updatePasswordStrength() {
      var pw = (document.getElementById("adminPassword").value || "");
      var fill  = document.getElementById("pwStrengthFill");
      var label = document.getElementById("pwStrengthLabel");
      if (!fill || !label) return;
      if (!pw) { fill.className = "pw-strength-fill"; fill.style.width = "0"; label.textContent = ""; label.className = "pw-strength-label"; return; }
      var s = getPasswordStrength(pw);
      var cls = s.score === 1 ? "weak" : s.score === 2 ? "medium" : "strong";
      fill.className = "pw-strength-fill " + cls;
      label.textContent = s.label;
      label.className = "pw-strength-label " + cls;
    }

    function validateAdminPassword() {
      if (component.editEntityId) return true; // password optional on edit
      var pw = document.getElementById("adminPassword").value || "";
      if (!pw) { showError("adminPassword", "Password is required."); return false; }
      if (pw.length < 8) { showError("adminPassword", "Password must be at least 8 characters."); return false; }
      var s = getPasswordStrength(pw);
      if (s.score === 1) { showError("adminPassword", "Password is too weak. Add uppercase letters, numbers, or symbols."); return false; }
      clearError("adminPassword"); return true;
    }

    function validateSapFields() {
      var sapSelected = document.querySelector(".intake-option[data-intake=sap] input[type=checkbox]");
      if (!sapSelected || !sapSelected.checked) { clearError("sapEndpoint"); clearError("sapClientId"); return true; }
      var ok = true;
      var endpoint = (document.getElementById("sapEndpoint").value || "").trim();
      if (!endpoint) { showError("sapEndpoint", "SAP Endpoint URL is required when SAP is selected."); ok = false; }
      else if (!urlRe.test(endpoint)) { showError("sapEndpoint", "Enter a valid URL (e.g. https://sap-host:44300/odata/...)."); ok = false; }
      else clearError("sapEndpoint");
      var clientId = (document.getElementById("sapClientId").value || "").trim();
      if (!clientId) { showError("sapClientId", "SAP Client ID is required when SAP is selected."); ok = false; }
      else clearError("sapClientId");
      return ok;
    }

    function validateVendorFields() {
      var vendorSelected = document.querySelector(".intake-option[data-intake=vendor] input[type=checkbox]");
      if (!vendorSelected || !vendorSelected.checked) { clearError("vendorPortalUrl"); return true; }
      var url = (document.getElementById("vendorPortalUrl").value || "").trim();
      if (!url) { showError("vendorPortalUrl", "Vendor Portal URL is required when Vendor is selected."); return false; }
      if (!urlRe.test(url)) { showError("vendorPortalUrl", "Enter a valid URL (e.g. https://vendor-portal.company.com)."); return false; }
      clearError("vendorPortalUrl"); return true;
    }

    function validateMailFields() {
      var mailSelected = document.querySelector(".intake-option[data-intake=mail] input[type=checkbox]");
      if (!mailSelected || !mailSelected.checked) { clearError("mailboxAddress"); return true; }
      var mailbox = (document.getElementById("mailboxAddress").value || "").trim();
      if (!mailbox) { showError("mailboxAddress", "Mailbox address is required when Mail Connector is selected."); return false; }
      if (!emailRe.test(mailbox)) { showError("mailboxAddress", "Enter a valid email address for the mailbox."); return false; }
      clearError("mailboxAddress"); return true;
    }

    function validateEwayThreshold() {
      var mode = document.getElementById("ewayBillMode").value;
      if (mode !== "required_above_threshold") { clearError("ewayBillThreshold"); return true; }
      var val = Number(document.getElementById("ewayBillThreshold").value || 0);
      if (!val || val < 1000) { showError("ewayBillThreshold", "Threshold must be at least â‚¹1,000 when E-Way Bill is required above threshold."); return false; }
      clearError("ewayBillThreshold"); return true;
    }

    function validateScope() {
      var ap = document.getElementById("enableAP").checked;
      var ar = document.getElementById("enableAR").checked;
      return ap || ar;
    }

    function runAllValidations() {
      var results = [
        validateEntityId(),
        validateEntityName(),
        validateAdminEmail(),
        validateAdminUsername(),
        validateAdminPassword(),
        validateSapFields(),
        validateVendorFields(),
        validateMailFields(),
        validateEwayThreshold()
      ];
      var scopeOk = validateScope();
      // Scroll to first invalid field
      var firstInvalid = document.querySelector(".field-invalid");
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      return results.every(Boolean) && scopeOk;
    }

    /* â”€â”€ Blur event wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    document.getElementById("clientId").addEventListener("blur", validateEntityId);
    document.getElementById("clientId").addEventListener("input", function() {
      // Auto-uppercase as user types
      var el = document.getElementById("clientId");
      var pos = el.selectionStart;
      el.value = el.value.toUpperCase();
      el.setSelectionRange(pos, pos);
    });
    document.getElementById("clientName").addEventListener("blur", validateEntityName);
    document.getElementById("adminEmail").addEventListener("blur", validateAdminEmail);
    document.getElementById("adminUsername").addEventListener("blur", validateAdminUsername);
    document.getElementById("adminPassword").addEventListener("input", function() {
      updatePasswordStrength();
    });
    document.getElementById("adminPassword").addEventListener("blur", validateAdminPassword);
    document.getElementById("ewayBillThreshold").addEventListener("blur", validateEwayThreshold);
    document.getElementById("ewayBillMode").addEventListener("change", validateEwayThreshold);

    // SAP fields â€” validate on blur when SAP is selected
    var sapEndpointEl = document.getElementById("sapEndpoint");
    var sapClientIdEl = document.getElementById("sapClientId");
    if (sapEndpointEl) sapEndpointEl.addEventListener("blur", validateSapFields);
    if (sapClientIdEl) sapClientIdEl.addEventListener("blur", validateSapFields);

    var vendorUrlEl = document.getElementById("vendorPortalUrl");
    if (vendorUrlEl) vendorUrlEl.addEventListener("blur", validateVendorFields);

    var mailboxEl = document.getElementById("mailboxAddress");
    if (mailboxEl) mailboxEl.addEventListener("blur", validateMailFields);

    // Re-validate connector fields when intake selection changes
    intakeOptions.forEach(function(opt) {
      opt.addEventListener("change", function() {
        validateSapFields();
        validateVendorFields();
        validateMailFields();
      });
    });

    /* â”€â”€ Button handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    document.getElementById("validateBtn").addEventListener("click", function () {
      clearAll();
      var ok = runAllValidations();
      var scopeOk = validateScope();
      var statusEl = document.getElementById("statusText");
      if (ok) {
        statusEl.textContent = "Validation passed: entity profile, intake mode(s), credentials, and AP/AR scope are all valid.";
        statusEl.style.color = "#167a5f";
      } else {
        var msg = !scopeOk ? "Enable at least one of Accounts Payable or Accounts Receivable." : "Validation failed. Review the highlighted fields above.";
        statusEl.textContent = msg;
        statusEl.style.color = "";
      }
    });

    var api = this.api;
    document.getElementById("publishBtn").addEventListener("click", function () {
      var p = renderPayload();

      /* â”€â”€ Run inline validation engine first â”€â”€ */
      clearAll();
      var isValid = runAllValidations();
      var hasIntake = Array.isArray(p.intakeModes) && p.intakeModes.length > 0;
      var statusEl = document.getElementById("statusText");
      statusEl.style.color = "";

      if (!isValid) {
        statusEl.textContent = "Validation failed. Review the highlighted fields and fix errors before creating.";
        return;
      }
      if (!hasIntake) {
        statusEl.textContent = "Validation failed: at least one intake mode must be selected.";
        return;
      }
      if (!p.access.userCreation) {
        statusEl.textContent = "Validation failed: User creation must be enabled.";
        return;
      }

      /* â”€â”€ Disable button to prevent double-submit â”€â”€ */
      var btn = document.getElementById("publishBtn");
      var originalLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = component.editEntityId ? "Saving..." : "Creating...";

      p.status = component.editEntityId ? "updated" : "created";
      document.getElementById("statusText").textContent = component.editEntityId ? "Saving entity changes..." : "Creating entity in the backend...";
      var apiPayload = JSON.parse(JSON.stringify(p));
      /* preserve admin credentials for server-side password hashing */
      apiPayload.access.adminUsername = (apiPayload.access.adminCredentials || {}).username || "";
      apiPayload.access.adminPassword = (apiPayload.access.adminCredentials || {}).password || "";
      delete apiPayload.access.adminCredentials;
      apiPayload.operation = component.editEntityId ? "update" : "create";
      api.getTenant().subscribe({
        next: function (tenantResponse) {
          var tenant = tenantResponse.data && tenantResponse.data[0];
          if (!tenant) {
            document.getElementById("statusText").textContent = "Backend error: no default tenant is configured.";
            return;
          }
          api.createEntity(tenant.id, apiPayload).subscribe({
            next: function (createdEntity) {
              p.backendEntityId = createdEntity.id;
              try {
                var credentials = p.access.adminCredentials || {};
                if (credentials.password) {
                  sessionStorage.setItem("entityCredentials:" + createdEntity.entity_key, JSON.stringify({
                    email: p.entity.adminEmail,
                    username: credentials.username || "",
                    password: credentials.password || "",
                    createdAt: new Date().toISOString()
                  }));
                } else if (component.editEntityId) {
                  sessionStorage.removeItem("entityCredentials:" + createdEntity.entity_key);
                }
              } catch (e) {}
              showPostCreateCard(p, createdEntity);
              setStep(5);
              document.getElementById("statusText").textContent = "Entity " + createdEntity.entity_key + (component.editEntityId ? " updated" : " created") + " successfully. Seeding demo data...";
              // Auto-seed AP demo data so all operational screens show data immediately
              // Changed by Vasu on 9/6/2026 - don't seed data yet...let us show data add, run to show AI results
              //if (!component.editEntityId) {
              //  api.seedEntityDemoData(tenant.id, createdEntity.entity_key).subscribe({
              //    next: function () {
              //      document.getElementById("statusText").textContent = "Entity created and demo data loaded. Redirecting to next step...";
              //    },
              //    error: function () {} // Non-fatal â€” seed may have run via DB trigger already
              //  });
              //}
              api.logAudit(tenant.id, component.editEntityId ? "entity.journey.updated" : "entity.journey.completed", "entity", createdEntity.entity_key, {
                entityName: p.entity.entityName, entityId: p.entity.entityId, operation: apiPayload.operation
              }).subscribe({ error: function() {} });
              setTimeout(function () {
                if (component.editEntityId) {
                  window.location.href = "/entity-dashboard?entityId=" + encodeURIComponent(p.entity.entityId) + "&entityName=" + encodeURIComponent(p.entity.entityName);
                  return;
                }
                var params = new URLSearchParams();
                params.set("entityName",  p.entity.entityName);
                params.set("entityId",    p.entity.entityId);
                params.set("intakeModes", p.intakeModes.join(","));
                params.set("apEnabled",   p.projectScope.accountsPayable  ? "1" : "0");
                params.set("arEnabled",   p.projectScope.accountsReceivable ? "1" : "0");
                params.set("matchingMode", p.matchingPolicy.matchingMode);
                params.set("ewayBillMode", p.matchingPolicy.ewayBillMode);
                params.set("ewayBillThreshold", String(p.matchingPolicy.ewayBillThreshold));
                window.location.href = "/models-quality?" + params.toString();
              }, 900);
            },
            error: function (error) {
              btn.disabled = false;
              btn.textContent = originalLabel;
              var msg = (error.error && error.error.error) || "Entity could not be saved. Check all required fields.";
              document.getElementById("statusText").textContent = "Error: " + msg;
            }
          });
        },
        error: function () {
          btn.disabled = false;
          btn.textContent = originalLabel;
          document.getElementById("statusText").textContent = "Backend unavailable. Make sure the API server is running on port 7070.";
        }
      });
    });

    /* â”€â”€ Module selector toggle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    document.querySelectorAll(".mod-toggle input[type='checkbox']").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var targetId = cb.getAttribute("data-target");
        var moduleEl = document.getElementById(targetId);
        var pill     = cb.closest(".mod-toggle");
        if (moduleEl) moduleEl.hidden = !cb.checked;
        if (pill)     pill.classList.toggle("active", cb.checked);
        renderRoleEngine();
        renderConfigurationSnapshot();
      });
    });

    ["industry", "region", "sapDocTypes", "defaultRole", "poSource", "grnSource", "inspectionSource", "ewayBillMode", "ewayBillThreshold"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        renderRoleEngine();
        renderConfigurationSnapshot();
      });
      document.getElementById(id).addEventListener("input", function () {
        renderRoleEngine();
        renderConfigurationSnapshot();
      });
    });

    ["enableAP", "enableAR", "enableRbac"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", renderRoleEngine);
    });

    document.getElementById("connectMailBtn").addEventListener("click", function () {
      var provider = document.getElementById("mailProvider").value;
      var label = provider === "gmail" ? "Gmail" : provider === "microsoft365" ? "Microsoft 365" : "IMAP";
      document.getElementById("mailConnectionStatus").textContent = label + " selected. Add the OAuth/IMAP backend connection to finish setup.";
    });

    /* â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    syncIntakeUI();
    syncMatchingPolicyUI();
    setStep(0);
    renderRoleEngine();
    renderConfigurationSnapshot();
    document.addEventListener("entities:refresh", renderCreatedEntities);
    renderCreatedEntities();
    if (editEntityId) {
      this.setEditMode(editEntityId);
    } else {
      this.setCreateMode();
    }
    this.loadCatalogs(editEntityId ? () => this.loadEditEntity(editEntityId) : undefined);
    this.loadExistingEntities();
  }

  private loadCatalogs(onLoaded?: () => void): void {
    this.api.getCatalogs().subscribe({
      next: (catalogs: any) => {
        this.replaceOptions("industry", catalogs.industries || [], "code", "label");
        this.replaceOptions("region", catalogs.regions || [], "code", "label");
        this.replaceOptions("defaultRole", catalogs.roles || [], "role_key", "label");
        this.replaceOptions("poSource", catalogs.sources || [], "source_key", "label");
        this.replaceOptions("grnSource", catalogs.sources || [], "source_key", "label");
        this.replaceOptions("inspectionSource", catalogs.sources || [], "source_key", "label");
        ["industry", "region", "defaultRole", "poSource", "grnSource", "inspectionSource"].forEach((id) => {
          document.getElementById(id)?.dispatchEvent(new Event("change"));
        });
        onLoaded?.();
      },
      error: () => {
        document.getElementById("statusText").textContent = "Catalog API unavailable. Using the form defaults.";
        onLoaded?.();
      }
    });
  }

  private replaceOptions(id: string, values: any[], valueKey: string, labelKey: string): void {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select || !values.length) return;
    const currentValue = select.value;
    select.innerHTML = "";
    values.forEach((item) => {
      const option = document.createElement("option");
      option.value = item[valueKey];
      option.textContent = item[labelKey];
      select.appendChild(option);
    });
    if (Array.from(select.options).some((option) => option.value === currentValue)) {
      select.value = currentValue;
    }
  }

  private setCreateMode(): void {
    this.editEntityId = null;
    /* Clear previous journey state so old entity context doesn't bleed into the new form */
    localStorage.removeItem("clientJourneyState");
    this.setText("journeyHeading", "Entity Creation Journey");
    this.setText("journeyFormTitle", "Creation Journey Form");
    this.setText("publishBtn", "Create Entity Journey");
    const entityId = document.getElementById("clientId") as HTMLInputElement | null;
    if (entityId) { entityId.disabled = false; entityId.value = ""; }
    ["clientName", "adminEmail", "adminUsername", "adminPassword"].forEach((id) => {
      const field = document.getElementById(id) as HTMLInputElement | null;
      if (field) field.value = "";
    });
    const notes = document.getElementById("notes") as HTMLTextAreaElement | null;
    if (notes) notes.value = "";
    this.setText("statusText", "Fill in the entity details and click Create Entity Journey when ready.");
  }

  private setEditMode(entityId: string): void {
    this.editEntityId = entityId;
    this.setText("journeyHeading", "Edit Entity: " + entityId);
    this.setText("journeyFormTitle", "Edit Entity Configuration");
    this.setText("publishBtn", "Save Entity Changes");
    const idField = document.getElementById("clientId") as HTMLInputElement | null;
    if (idField) { idField.disabled = true; idField.value = entityId; }
    this.setText("statusText", "Loading entity configuration â€” please wait...");
    // Add a visible edit mode banner under the heading
    const hero = document.querySelector(".hero");
    if (hero && !document.getElementById("editModeBanner")) {
      const banner = document.createElement("div");
      banner.id = "editModeBanner";
      banner.style.cssText = [
        "background:linear-gradient(95deg,#1b2f46,#233a56)", "color:#d9e8fb",
        "border-radius:8px", "padding:12px 18px", "margin-top:12px",
        "font-size:13px", "display:flex", "align-items:center", "gap:10px"
      ].join(";");
      banner.innerHTML = `<span style="color:#fbbf24;font-weight:800;letter-spacing:1px;font-size:11px">&#9632; EDIT MODE</span>` +
        `<span>You are editing <b style="color:#fff">${entityId}</b>. All existing settings are pre-filled below.</span>`;
      hero.appendChild(banner);
    }
  }

  private loadEditEntity(entityKey: string): void {
    // Show loading overlay on the form while data fetches
    this.showEditLoading(true);

    // Try to get tenantId from URL first (faster, avoids extra round-trip)
    const urlTenantId = new URLSearchParams(window.location.search).get("tenantId") || "";

    const doLoad = (tenantId: string) => {
      this.api.getEntity(tenantId, entityKey).subscribe({
        next: (data: any) => {
          this.showEditLoading(false);
          if (!data || !data.entity) {
            this.showEditError("Entity not found. Check the entity ID and try again.");
            return;
          }
          this.populateEditForm(data);
        },
        error: (err: any) => {
          this.showEditLoading(false);
          const msg = err?.error?.error || err?.message || "Could not load entity data.";
          this.showEditError(msg);
        }
      });
    };

    if (urlTenantId) {
      doLoad(urlTenantId);
    } else {
      // Fall back to tenant lookup
      this.api.getTenant().subscribe({
        next: (res: any) => {
          const tenant = res.data?.[0];
          if (!tenant) {
            this.showEditLoading(false);
            this.showEditError("No tenant found. Please log in again.");
            return;
          }
          doLoad(tenant.id);
        },
        error: () => {
          this.showEditLoading(false);
          this.showEditError("Backend unavailable. Please check the server and try again.");
        }
      });
    }
  }

  private showEditLoading(show: boolean): void {
    let overlay = document.getElementById("editLoadingOverlay");
    if (show) {
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "editLoadingOverlay";
        overlay.style.cssText = [
          "position:fixed", "inset:0", "background:rgba(255,255,255,.82)",
          "z-index:500", "display:flex", "align-items:center", "justify-content:center",
          "flex-direction:column", "gap:12px", "font-size:14px", "color:#1b2f46"
        ].join(";");
        overlay.innerHTML = `
          <div style="width:40px;height:40px;border:4px solid #dbeafe;border-top-color:#3b82f6;border-radius:50%;animation:spin .7s linear infinite"></div>
          <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
          <b>Loading entity configuration&hellip;</b>
          <span style="font-size:12px;color:#64748b">Fetching settings, modules and intake channels</span>`;
        document.body.appendChild(overlay);
      }
      overlay.style.display = "flex";
    } else {
      if (overlay) overlay.remove();
    }
  }

  private showEditError(message: string): void {
    const form = document.getElementById("journeyForm");
    const existing = document.getElementById("editErrorBanner");
    if (existing) existing.remove();
    const banner = document.createElement("div");
    banner.id = "editErrorBanner";
    banner.style.cssText = [
      "background:#fef2f2", "border:1px solid #fca5a5", "border-left:4px solid #dc2626",
      "border-radius:6px", "padding:14px 16px", "margin-bottom:16px",
      "font-size:13px", "color:#991b1b", "display:flex", "align-items:center", "gap:10px"
    ].join(";");
    banner.innerHTML = `<span style="font-size:18px">&#x26A0;</span><div><b>Failed to load entity</b><br>${message}</div>`;
    if (form) form.insertAdjacentElement("beforebegin", banner);
    this.setText("statusText", "Error: " + message);
  }

  private populateEditForm(data: any): void {
    const entity   = data.entity          || {};
    const settings = data.settings        || {};
    const matching = data.matchingPolicy  || {};
    const intakeChannels = data.intakeChannels || [];
    const modules        = data.modules        || [];

    // Helpers
    const setValue = (id: string, value: any): void => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (!el || value === undefined || value === null) return;
      el.value = String(value);
      // If it's a select and the value isn't in the options, add it so it shows
      if (el.tagName === 'SELECT') {
        const sel = el as HTMLSelectElement;
        const found = Array.from(sel.options).some(o => o.value === String(value));
        if (!found && String(value).trim()) {
          const opt = document.createElement('option');
          opt.value = String(value);
          opt.textContent = String(value);
          sel.appendChild(opt);
          sel.value = String(value);
        }
      }
    };
    const setChecked = (id: string, value: any): void => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.checked = Boolean(value);
    };

    const moduleMap      = Object.fromEntries(modules.map((m: any) => [m.module_key, m]));
    const moduleSetting  = (key: string): any => moduleMap[key]?.settings || {};
    const selectedIntake = intakeChannels.filter((c: any) => c.is_enabled).map((c: any) => c.channel_key);
    const intakeConfig   = Object.fromEntries(intakeChannels.map((c: any) => [c.channel_key, c.connection_settings || {}]));

    // â”€â”€ Step 1: Entity Profile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    setValue("clientId",   entity.entity_key);
    setValue("clientName", entity.name);
    setValue("industry",   entity.industry_code);
    setValue("region",     entity.region_code);

    // â”€â”€ Step 2: Intake Mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Show/hide intake config panels and tick checkboxes
    const configPanelMap: Record<string, string> = {
      sap: "sapConfig", upload: "uploadConfig", vendor: "vendorConfig", mail: "mailConfig"
    };
    document.querySelectorAll(".intake-option").forEach((option: Element) => {
      const mode    = option.getAttribute("data-intake") || "";
      const cb      = option.querySelector("input[type=checkbox]") as HTMLInputElement | null;
      const enabled = selectedIntake.includes(mode);
      if (cb) cb.checked = enabled;
      option.classList.toggle("selected", enabled);
      option.setAttribute("aria-checked", enabled ? "true" : "false");
      const panel = document.getElementById(configPanelMap[mode] || "");
      if (panel) panel.hidden = !enabled;
    });

    // SAP connection settings
    setValue("sapEndpoint",  intakeConfig.sap?.endpoint);
    setValue("sapClientId",  intakeConfig.sap?.client_id);
    // sapDocTypes stored as array ['invoices','po','grn'] â†’ join to match select value
    if (intakeConfig.sap?.document_types) {
      const docVal = Array.isArray(intakeConfig.sap.document_types)
        ? intakeConfig.sap.document_types.join(",")
        : String(intakeConfig.sap.document_types);
      setValue("sapDocTypes", docVal);
    }

    // Upload settings
    setValue("uploadMaxSize",  intakeConfig.upload?.max_file_size);
    if (intakeConfig.upload?.accepted_formats) {
      const fmts = Array.isArray(intakeConfig.upload.accepted_formats)
        ? intakeConfig.upload.accepted_formats.join(",")
        : String(intakeConfig.upload.accepted_formats);
      setValue("uploadFormats", fmts);
    }

    // Vendor portal settings
    setValue("vendorPortalUrl",   intakeConfig.vendor?.portal_url);
    setValue("vendorAutoApprove", intakeConfig.vendor?.auto_approve != null
      ? String(Boolean(intakeConfig.vendor.auto_approve)) : undefined);

    // Mail settings
    setValue("mailProvider",     intakeConfig.mail?.provider);
    setValue("mailboxAddress",   intakeConfig.mail?.mailbox);
    setValue("mailUsername",     intakeConfig.mail?.username);
    setValue("mailFolder",       intakeConfig.mail?.folder);
    setValue("mailSyncFrequency",intakeConfig.mail?.sync_frequency);

    // â”€â”€ Step 3: User Access â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    setValue("adminEmail",    settings.primary_admin_email);
    setValue("adminUsername", settings.primary_admin_username);
    setValue("defaultRole",   settings.default_role_key || "entity_admin");
    setValue("notes",         settings.onboarding_notes || "");
    // Leave password blank on edit â€” only set if user explicitly types a new one
    const pwField = document.getElementById("adminPassword") as HTMLInputElement | null;
    if (pwField) { pwField.value = ""; pwField.placeholder = "Leave blank to keep existing password"; }

    // â”€â”€ Step 4: AP/AR Scope â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    setValue("matchingMode",       matching.matching_method       || "three_way");
    setValue("poSource",           matching.purchase_order_source_key || "sap");
    setValue("grnSource",          matching.grn_source_key        || "sap");
    setValue("inspectionSource",   matching.inspection_source_key || "not_applicable");
    setValue("ewayBillMode",       matching.eway_bill_policy      || "not_applicable");
    setValue("ewayBillThreshold",  matching.eway_bill_threshold   ?? 0);
    setChecked("enableAP", settings.accounts_payable_enabled);
    setChecked("enableAR", settings.accounts_receivable_enabled);

    // â”€â”€ Modules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    setChecked("enableUserCreation",    settings.user_creation_enabled);
    setChecked("enableRbac",            settings.rbac_enabled);
    setChecked("enableModelIntegration",moduleMap.models?.is_enabled);
    setChecked("enablePromptVersion",   moduleSetting("models").prompt_versioning);
    setChecked("enableClassification",  moduleMap.classification?.is_enabled);
    setChecked("enableClassOverride",   moduleSetting("classification").class_override);
    setChecked("enableProviderGov",     moduleMap.provider_governance?.is_enabled);
    setChecked("enableFallbackRouting", moduleSetting("provider_governance").fallback_routing);
    setChecked("enableGstApi",  moduleSetting("api_integrations").gst_tax);
    setChecked("enableKycApi",  moduleSetting("api_integrations").identity_kyc);
    setChecked("enableBankApi", moduleSetting("api_integrations").banking);
    setChecked("enableBizApi",  moduleSetting("api_integrations").business_compliance);

    // Set module toggle checkboxes FIRST (before the show/hide loop below)
    const togMap: Record<string, string> = {
      "mod-apScope":         "ap_ar_scope",
      "mod-userAccess":      "user_access",
      "mod-models":          "models",
      "mod-classification":  "classification",
      "mod-providerGov":     "provider_governance",
      "mod-apiIntegrations": "api_integrations",
    };
    document.querySelectorAll(".mod-toggle input[type=checkbox]").forEach((el: Element) => {
      const input  = el as HTMLInputElement;
      const target = input.getAttribute("data-target") || "";
      const modKey = togMap[target];
      if (modKey) input.checked = Boolean(moduleMap[modKey]?.is_enabled);
    });

    // Now apply active class and show/hide module panels based on toggle state
    document.querySelectorAll(".mod-toggle input[type=checkbox]").forEach((el: Element) => {
      const input  = el as HTMLInputElement;
      const target = input.getAttribute("data-target") || "";
      const panel  = document.getElementById(target);
      input.closest(".mod-toggle")?.classList.toggle("active", input.checked);
      if (panel) panel.hidden = !input.checked;
    });

    // â”€â”€ Trigger change events so any JS listeners update the UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ["matchingMode","ewayBillMode","ewayBillThreshold","industry","region",
     "sapDocTypes","defaultRole","poSource","grnSource","inspectionSource",
     "enableAP","enableAR","enableRbac"
    ].forEach(id => document.getElementById(id)?.dispatchEvent(new Event("change")));

    // â”€â”€ In edit mode: mark ALL steps as done and keep the full form visible â”€
    this.setAllStepsDone();

    this.setText("statusText", "Entity configuration loaded. Review and update any settings, then click Save Entity Changes.");
  }

  private setStep(step: number): void {
    document.querySelectorAll(".stepper .step").forEach((stepElement: Element, index: number) => {
      stepElement.classList.toggle("done", index < step);
      stepElement.classList.toggle("active", index === step);
    });
  }

  private setAllStepsDone(): void {
    // In edit mode mark every step done so the stepper shows fully complete
    document.querySelectorAll(".stepper .step").forEach((el: Element) => {
      el.classList.add("done");
      el.classList.remove("active");
    });
    // Ensure all module panels are visible (not hidden by step-gating CSS)
    document.querySelectorAll(".module-item, .intake-config, .field").forEach((el: Element) => {
      (el as HTMLElement).style.removeProperty("display");
    });
  }

  private setText(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  private loadExistingEntities(): void {
    this.api.getTenant().subscribe({
      next: (tenantResponse: any) => {
        const tenant = tenantResponse.data?.[0];
        if (!tenant) return;
        this.api.getEntities(tenant.id).subscribe({
          next: (response: any) => {
            const records = (response.data || []).map((entity: any) => ({
              entityId: entity.entity_key,
              entityName: entity.name,
              industry: entity.industry_code,
              region: entity.region_code,
              intakeModes: entity.intake_modes || [],
              apEnabled: entity.accounts_payable_enabled,
              arEnabled: entity.accounts_receivable_enabled,
              defaultRole: entity.default_role_key,
              status: entity.status,
              createdAt: entity.created_at
            }));
            localStorage.setItem("createdEntitiesList", JSON.stringify(records));
            document.dispatchEvent(new Event("entities:refresh"));
          }
        });
      }
    });
  }
}

