// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-models-quality',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './models-quality.html',
  styleUrl: './models-quality.css',
  encapsulation: ViewEncapsulation.None
})
export class ModelsQualityComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
    var api = this.api;
    var currentTenantId = "";
    var currentEntityId = "";
    var allModels = [];
    var allVersions = [];

    /* ── Journey state helpers ── */
    function readJourneyState() {
      try { return JSON.parse(localStorage.getItem("clientJourneyState") || "{}"); }
      catch (e) { return {}; }
    }
    function writeJourneyState(next) {
      localStorage.setItem("clientJourneyState", JSON.stringify(next));
    }

    /* ── URL / context setup ── */
    var params       = new URLSearchParams(window.location.search);
    var entityName   = params.get("entityName") || "";
    var entityId     = params.get("entityId")   || "";
    var intakeModes  = (params.get("intakeModes") || "").split(",").filter(Boolean);
    var apEnabled    = params.get("apEnabled")  === "1";
    var arEnabled    = params.get("arEnabled")  === "1";

    var state = readJourneyState();
    if (entityName) {
      state.entityName  = entityName;
      state.entityId    = entityId;
      state.intakeModes = intakeModes;
      state.apEnabled   = apEnabled;
      state.arEnabled   = arEnabled;
      writeJourneyState(state);
    } else {
      entityName  = state.entityName  || "";
      entityId    = state.entityId    || "";
      intakeModes = state.intakeModes || [];
      apEnabled   = !!state.apEnabled;
      arEnabled   = !!state.arEnabled;
    }

    if (entityName) {
      currentEntityId = entityId || entityName;
      var banner = document.getElementById("entityContextBanner");
      if (banner) banner.hidden = false;
      var ctxName = document.getElementById("ctxEntityName");
      var ctxId   = document.getElementById("ctxEntityId");
      if (ctxName) ctxName.textContent = entityName;
      if (ctxId)   ctxId.textContent   = entityId ? "(" + entityId + ")" : "";
      var INTAKE = { sap: "⚡ SAP Touchless", upload: "⬆ Doc Upload", vendor: "🏢 Vendor Portal" };
      var badgeHtml = intakeModes.map(function (m) {
        return "<span class=\"chip-mini\">" + (INTAKE[m] || m) + "</span>";
      });
      if (apEnabled) badgeHtml.push("<span class=\"chip-mini\">📥 AP</span>");
      if (arEnabled) badgeHtml.push("<span class=\"chip-mini\">📤 AR</span>");
      var ctxBadges = document.getElementById("ctxBadges");
      if (ctxBadges) ctxBadges.innerHTML = badgeHtml.join("");
      var crumb = document.querySelector(".crumb");
      if (crumb) crumb.textContent = "  " + entityName + " > Models & Quality";
    }

    /* ── Quality gate helpers ── */
    function evaluateGate(f1, hallucination) {
      if (f1 >= 94 && hallucination <= 1.2) return { label: "Approved", cls: "ok" };
      if (f1 >= 92 && hallucination <= 2)   return { label: "Needs Fix", cls: "warn" };
      return { label: "Blocked", cls: "bad" };
    }
    function toNumber(value) {
      var num = Number(value);
      return Number.isFinite(num) ? num : NaN;
    }

    /* ── Render helpers ── */
    function updateModelSelects(models) {
      var selects = ["popupModelInput", "popupAssignModelInput", "assignModelInput"];
      selects.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el.tagName !== "SELECT") return;
        var current = el.value;
        el.innerHTML = models.map(function (m) {
          return "<option value=\"" + m.display_name + "\">" + m.display_name + " (" + m.provider + ")</option>";
        }).join("");
        if (Array.from(el.options).some(function (o) { return o.value === current; })) {
          el.value = current;
        }
      });
    }

    function updatePromptSelects(versions, targetOnly) {
      var approved = versions.filter(function (v) { return v.lifecycle_status === "approved"; });
      var targetEl = document.getElementById("popupAssignTargetPromptSelect");
      var currentEl = document.getElementById("popupAssignCurrentPromptSelect");
      if (targetEl) {
        var cur = targetEl.value;
        targetEl.innerHTML = "<option value=\"\">— Select approved target prompt —</option>"
          + approved.map(function (v) {
            return "<option value=\"" + v.version_tag + "\">" + v.version_tag
              + " — " + v.model_name + " (F1: " + (v.f1_pct ? Number(v.f1_pct).toFixed(1) : "—") + "%)</option>";
          }).join("");
        if (cur) targetEl.value = cur;
      }
      if (!targetOnly && currentEl) {
        currentEl.innerHTML = "<option value=\"\">— None / first assignment —</option>"
          + versions.map(function (v) {
            return "<option value=\"" + v.version_tag + "\">" + v.version_tag + " — " + v.model_name + "</option>";
          }).join("");
      }
    }

    function renderQualityGateTable(versions) {
      var tbody = document.getElementById("qualityGateRows");
      if (!tbody || !versions.length) return;
      tbody.innerHTML = versions.slice(0, 20).map(function (v) {
        var gate = v.gate_result
          ? { label: v.gate_result === "approved" ? "Approved" : v.gate_result === "needs_fix" ? "Needs Fix" : "Blocked",
              cls: v.gate_result === "approved" ? "ok" : v.gate_result === "needs_fix" ? "warn" : "bad" }
          : evaluateGate(Number(v.f1_pct || 0), Number(v.hallucination_pct || 0));
        return "<tr>"
          + "<td>" + v.model_name + "</td>"
          + "<td>" + v.version_tag + "</td>"
          + "<td>" + (v.dataset_key || "—") + "</td>"
          + "<td>" + (v.precision_pct ? Number(v.precision_pct).toFixed(1) + "%" : "—") + "</td>"
          + "<td>" + (v.recall_pct    ? Number(v.recall_pct).toFixed(1)    + "%" : "—") + "</td>"
          + "<td>" + (v.f1_pct        ? Number(v.f1_pct).toFixed(1)        + "%" : "—") + "</td>"
          + "<td>" + (v.hallucination_pct ? Number(v.hallucination_pct).toFixed(1) + "%" : "—") + "</td>"
          + "<td>" + (v.latency_seconds   ? Number(v.latency_seconds).toFixed(1)   + "s"  : "—") + "</td>"
          + "<td><span class=\"badge " + gate.cls + "\">" + gate.label + "</span></td>"
          + "</tr>";
      }).join("");
    }

    function renderAssignmentsTable(assignments) {
      var tbody = document.getElementById("entityAssignmentRows");
      if (!tbody) return;
      if (!assignments.length) {
        tbody.innerHTML = "<tr><td colspan=\"7\" style=\"color:#7388a1;text-align:center\">No assignments yet. Use Assign Prompt To Entity above.</td></tr>";
        return;
      }
      tbody.innerHTML = assignments.map(function (a) {
        var rollout = a.rollout_strategy === "canary"
          ? a.rollout_percent + "% Canary"
          : a.rollout_strategy === "pilot" ? "Pilot" : a.rollout_percent + "%";
        var cls = a.assignment_status === "blocked" ? "bad" : a.assignment_status === "active" ? "ok" : "warn";
        return "<tr>"
          + "<td>" + a.entity_name + "</td>"
          + "<td>" + a.model_name  + "</td>"
          + "<td>" + (a.current_prompt || "—") + "</td>"
          + "<td>" + (a.target_prompt  || "—") + "</td>"
          + "<td>" + rollout + "</td>"
          + "<td>" + (a.owner_role || "Pending") + "</td>"
          + "<td><span class=\"badge " + cls + "\">" + a.assignment_status + "</span></td>"
          + "</tr>";
      }).join("");
    }

    function renderModelCards(models) {
      var container = document.getElementById("modelCards");
      if (!container) return;
      container.innerHTML = "";
      if (!models.length) {
        container.innerHTML = "<p style=\"color:#7388a1\">No models registered yet. Click Register New Model to add one.</p>";
        return;
      }
      models.forEach(function (m) {
        var btn = document.createElement("button");
        btn.className = "model-card";
        btn.type = "button";
        btn.setAttribute("data-model", m.display_name);
        btn.setAttribute("data-use", m.description || m.provider);
        btn.setAttribute("data-model-key", m.model_key);
        btn.innerHTML = "<b>" + m.display_name + "</b>"
          + "<span>" + (m.description || m.provider) + "</span>"
          + (m.assignment_count > 0
            ? "<span class=\"badge ok\" style=\"margin-top:4px;font-size:10px\">" + m.assignment_count + " assignment" + (m.assignment_count !== 1 ? "s" : "") + "</span>"
            : "");
        btn.addEventListener("click", function () {
          openModelPopup(m.display_name, m.description || m.provider);
        });
        container.appendChild(btn);
      });
    }

    function openModelPopup(modelName, use) {
      var titleEl = document.getElementById("popupModelTitle");
      var modelInput = document.getElementById("popupModelInput");
      if (titleEl) titleEl.textContent = modelName + " Prompt Builder";
      if (modelInput) {
        if (modelInput.tagName === "SELECT") {
          Array.from(modelInput.options).forEach(function (o) { o.selected = o.value === modelName; });
        } else {
          modelInput.value = modelName;
        }
      }
      ["popupVersionInput","popupDatasetInput","popupPrecisionInput","popupRecallInput",
       "popupHallucinationInput","popupLatencyInput","popupPromptChangeInput","popupPromptInput"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = "";
      });
      buildPromptJson();
      var statusEl = document.getElementById("popupStatus");
      if (statusEl) statusEl.textContent = "Selected " + modelName + ". " + use + ". Fill details and click Create Prompt Version.";
      document.getElementById("modelPromptPopup").classList.add("open");
    }

    function buildPromptJson() {
      var modelEl = document.getElementById("popupModelInput");
      var model = modelEl ? (modelEl.value || "") : "";
      var version = (document.getElementById("popupVersionInput") || {}).value || "";
      var dataset = (document.getElementById("popupDatasetInput") || {}).value || "";
      var precision = toNumber((document.getElementById("popupPrecisionInput") || {}).value);
      var recall    = toNumber((document.getElementById("popupRecallInput") || {}).value);
      var hallucination = toNumber((document.getElementById("popupHallucinationInput") || {}).value);
      var latency  = toNumber((document.getElementById("popupLatencyInput") || {}).value);
      var promptChange = (document.getElementById("popupPromptChangeInput") || {}).value || "";
      var prompt   = (document.getElementById("popupPromptInput") || {}).value || "";
      var payload = {
        model: model,
        promptVersion: version || "draft",
        dataset: dataset,
        precision: Number.isNaN(precision) ? null : precision,
        recall: Number.isNaN(recall) ? null : recall,
        hallucination: Number.isNaN(hallucination) ? null : hallucination,
        latency: Number.isNaN(latency) ? null : latency,
        promptChange: promptChange,
        promptText: prompt,
        promptLength: prompt.length,
        updatedAt: new Date().toISOString()
      };
      var jsonOut = document.getElementById("popupJsonOutput");
      if (jsonOut) jsonOut.textContent = JSON.stringify(payload, null, 2);
      return payload;
    }

    /* ── Journey mode: hide assign + step sections when no entity context ── */
    if (!entityId && !entityName) {
      var ap = document.getElementById("journeyAssignPanel");
      if (ap) ap.hidden = true;
      var sp = document.getElementById("journeyStepPanel");
      if (sp) sp.hidden = true;
    }

    function audit(action, resourceType, resourceId?, meta?) {
      if (!currentTenantId) return;
      api.logAudit(currentTenantId, action, resourceType || "ui", resourceId || null, meta || {}).subscribe({ error: function() {} });
    }

    /* ── Bootstrap: load tenant then everything ── */
    api.getTenant().subscribe({
      next: function (tenantResponse) {
        var tenant = tenantResponse.data && tenantResponse.data[0];
        if (!tenant) return;
        currentTenantId = tenant.id;

        /* Load all data in parallel */
        api.getModels(currentTenantId).subscribe({
          next: function (modelsRes) {
            allModels = modelsRes.data || [];
            renderModelCards(allModels);
            updateModelSelects(allModels);
          }
        });

        api.getPromptVersions(currentTenantId).subscribe({
          next: function (pvRes) {
            allVersions = pvRes.data || [];
            renderQualityGateTable(allVersions);
            updatePromptSelects(allVersions, false);
          }
        });

        api.getEntities(currentTenantId).subscribe({
          next: function (entitiesRes) {
            var entities = entitiesRes.data || [];
            var entitySelect = document.getElementById("popupAssignEntitySelect");
            if (entitySelect) {
              entitySelect.innerHTML = "<option value=\"\">— Select entity —</option>"
                + entities.map(function (e) {
                  var sel = e.entity_key === entityId ? " selected" : "";
                  return "<option value=\"" + e.entity_key + "\"" + sel + ">"
                    + e.name + " (" + e.entity_key + ")</option>";
                }).join("");
              entitySelect.addEventListener("change", function () {
                var matched = entities.find(function (e) { return e.entity_key === entitySelect.value; });
                var display = document.getElementById("assignEntityDisplay");
                if (display) display.textContent = matched ? matched.name : entitySelect.value || "—";
              });
              /* set initial display */
              if (entityId) {
                var matched = entities.find(function (e) { return e.entity_key === entityId; });
                var display = document.getElementById("assignEntityDisplay");
                if (display && matched) display.textContent = matched.name;
              }
            }
          }
        });

        api.getModelAssignments(currentTenantId).subscribe({
          next: function (assignRes) {
            renderAssignmentsTable(assignRes.data || []);
          }
        });
      },
      error: function () {
        document.getElementById("assignmentStatus").textContent = "Backend unavailable.";
      }
    });

    /* ── Register model popup ── */
    document.getElementById("openRegisterModelBtn").addEventListener("click", function () {
      document.getElementById("registerModelPopup").classList.add("open");
      document.getElementById("registerModelStatus").textContent = "";
      audit("model.popup.register_opened", "model", null, { entityId: currentEntityId });
    });
    document.getElementById("closeRegisterModelBtn").addEventListener("click", function () {
      document.getElementById("registerModelPopup").classList.remove("open");
    });
    document.getElementById("registerModelPopup").addEventListener("click", function (event) {
      if (event.target.id === "registerModelPopup") document.getElementById("registerModelPopup").classList.remove("open");
    });
    document.getElementById("saveRegisterModelBtn").addEventListener("click", function () {
      var displayName = document.getElementById("newModelName").value.trim();
      var provider    = document.getElementById("newModelProvider").value.trim();
      var description = document.getElementById("newModelDescription").value.trim();
      var modelKey    = document.getElementById("newModelKey").value.trim();
      var statusEl    = document.getElementById("registerModelStatus");
      if (!displayName || !provider) {
        statusEl.textContent = "Model name and provider are required.";
        return;
      }
      if (!currentTenantId) {
        statusEl.textContent = "Backend tenant context is not ready. Try again.";
        return;
      }
      api.registerModel(currentTenantId, { displayName: displayName, provider: provider, description: description, modelKey: modelKey || undefined }).subscribe({
        next: function (savedModel) {
          allModels = allModels.filter(function (m) { return m.model_key !== savedModel.model_key; });
          allModels.unshift({ ...savedModel, assignment_count: 0 });
          renderModelCards(allModels);
          updateModelSelects(allModels);
          statusEl.textContent = "Model \"" + savedModel.display_name + "\" registered successfully.";
          ["newModelName","newModelProvider","newModelDescription","newModelKey"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.value = "";
          });
          setTimeout(function () { document.getElementById("registerModelPopup").classList.remove("open"); }, 1200);
        },
        error: function (error) {
          statusEl.textContent = "Backend error: " + ((error.error && error.error.error) || "model could not be registered.");
        }
      });
    });

    /* ── Prompt popup ── */
    document.getElementById("createPromptVersionBtn").addEventListener("click", function () {
      document.getElementById("modelPromptPopup").classList.add("open");
      document.getElementById("popupStatus").textContent = "Select a model, fill the form, and click Create Prompt Version.";
      audit("model.popup.version_opened", "model", null, { entityId: currentEntityId });
    });
    document.getElementById("closeModelPopupBtn").addEventListener("click", function () {
      document.getElementById("modelPromptPopup").classList.remove("open");
    });
    document.getElementById("modelPromptPopup").addEventListener("click", function (event) {
      if (event.target.id === "modelPromptPopup") document.getElementById("modelPromptPopup").classList.remove("open");
    });

    ["popupPromptInput","popupVersionInput","popupDatasetInput","popupPrecisionInput",
     "popupRecallInput","popupHallucinationInput","popupLatencyInput","popupPromptChangeInput"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", buildPromptJson);
    });
    var popupModelEl = document.getElementById("popupModelInput");
    if (popupModelEl) popupModelEl.addEventListener("change", buildPromptJson);

    document.getElementById("formatPromptJsonBtn").addEventListener("click", function () {
      buildPromptJson();
      document.getElementById("popupStatus").textContent = "Prompt JSON updated.";
    });

    function createPromptVersionFromInputs() {
      var modelEl = document.getElementById("popupModelInput");
      var model   = modelEl ? modelEl.value : "";
      var version = document.getElementById("popupVersionInput").value.trim();
      var dataset = document.getElementById("popupDatasetInput").value.trim();
      var precision    = toNumber(document.getElementById("popupPrecisionInput").value);
      var recall       = toNumber(document.getElementById("popupRecallInput").value);
      var hallucination = toNumber(document.getElementById("popupHallucinationInput").value);
      var latency      = toNumber(document.getElementById("popupLatencyInput").value);
      var promptChange = document.getElementById("popupPromptChangeInput").value.trim();
      var statusEl     = document.getElementById("promptVersionStatus");

      if (!version || !dataset || Number.isNaN(precision) || Number.isNaN(recall) || Number.isNaN(hallucination) || Number.isNaN(latency)) {
        statusEl.textContent = "Please fill version, dataset, and all metric fields.";
        return;
      }
      if (!currentTenantId) {
        statusEl.textContent = "Backend tenant context is not ready.";
        return;
      }

      api.createPromptVersion(currentTenantId, "PRM-INV-00432", {
        model: model,
        promptVersion: version,
        dataset: dataset,
        precision: precision,
        recall: recall,
        hallucination: hallucination,
        latency: latency,
        promptChange: promptChange,
        promptText: document.getElementById("popupPromptInput").value
      }).subscribe({
        next: function (savedVersion) {
          var gate = evaluateGate(Number(savedVersion.f1_pct), Number(document.getElementById("popupHallucinationInput").value));
          var newRow = {
            model_name: model,
            version_tag: savedVersion.version_tag,
            dataset_key: dataset,
            precision_pct: precision,
            recall_pct: recall,
            f1_pct: savedVersion.f1_pct,
            hallucination_pct: hallucination,
            latency_seconds: latency,
            gate_result: savedVersion.gate_result,
            lifecycle_status: savedVersion.lifecycle_status
          };
          allVersions.unshift(newRow);
          renderQualityGateTable(allVersions);
          updatePromptSelects(allVersions, false);
          /* pre-fill assign section */
          document.getElementById("assignModelInput").value = model;
          document.getElementById("assignTargetPromptInput").value = version;
          var targetDisplay = document.getElementById("assignTargetDisplay");
          if (targetDisplay) targetDisplay.textContent = version;
          statusEl.textContent = "Version " + version + " created. Gate: " + gate.label + ".";
          document.getElementById("modelPromptPopup").classList.remove("open");
        },
        error: function (error) {
          statusEl.textContent = "Backend error: " + ((error.error && error.error.error) || "prompt version could not be saved.");
        }
      });
    }

    document.getElementById("usePromptInGateBtn").addEventListener("click", function () {
      var payload = buildPromptJson();
      document.getElementById("popupVersionInput").value = payload.promptVersion === "draft" ? "" : payload.promptVersion;
      document.getElementById("popupDatasetInput").value = payload.dataset || "";
      document.getElementById("popupPrecisionInput").value = payload.precision == null ? "" : String(payload.precision);
      document.getElementById("popupRecallInput").value = payload.recall == null ? "" : String(payload.recall);
      document.getElementById("popupHallucinationInput").value = payload.hallucination == null ? "" : String(payload.hallucination);
      document.getElementById("popupLatencyInput").value = payload.latency == null ? "" : String(payload.latency);
      document.getElementById("popupPromptChangeInput").value = payload.promptChange || payload.promptText.slice(0, 140);
      document.getElementById("popupStatus").textContent = "Saving prompt version...";
      createPromptVersionFromInputs();
    });

    /* ── Assign popup ── */
    document.getElementById("openAssignPopupBtn").addEventListener("click", function () {
      audit("model.popup.assign_opened", "model", null, { entityId: currentEntityId });
      var modelVal = document.getElementById("assignModelInput").value;
      var assignModelEl = document.getElementById("popupAssignModelInput");
      if (assignModelEl) {
        Array.from(assignModelEl.options).forEach(function (o) { o.selected = o.value === modelVal; });
      }
      var targetVal = document.getElementById("assignTargetPromptInput").value;
      var targetEl = document.getElementById("popupAssignTargetPromptSelect");
      if (targetEl && targetVal) {
        Array.from(targetEl.options).forEach(function (o) { o.selected = o.value === targetVal; });
      }
      document.getElementById("assignEntityPopup").classList.add("open");
    });
    document.getElementById("closeAssignPopupBtn").addEventListener("click", function () {
      document.getElementById("assignEntityPopup").classList.remove("open");
    });
    document.getElementById("assignEntityPopup").addEventListener("click", function (event) {
      if (event.target.id === "assignEntityPopup") document.getElementById("assignEntityPopup").classList.remove("open");
    });

    document.getElementById("addAssignmentBtn").addEventListener("click", function () {
      var entitySelect   = document.getElementById("popupAssignEntitySelect");
      var selectedEntityKey  = entitySelect ? entitySelect.value.trim() : "";
      var modelEl        = document.getElementById("popupAssignModelInput");
      var model          = modelEl ? modelEl.value : "";
      var targetEl       = document.getElementById("popupAssignTargetPromptSelect");
      var currentEl      = document.getElementById("popupAssignCurrentPromptSelect");
      var targetPrompt   = targetEl ? targetEl.value.trim() : "";
      var currentPrompt  = currentEl ? currentEl.value.trim() : "";
      var statusEl       = document.getElementById("assignmentStatus");

      if (!selectedEntityKey) { if (statusEl) statusEl.textContent = "Please select an entity."; return; }
      if (!model)             { if (statusEl) statusEl.textContent = "Please select a model."; return; }
      if (!targetPrompt)      { if (statusEl) statusEl.textContent = "Please select a target prompt version (must be approved)."; return; }
      if (!currentTenantId)   { if (statusEl) statusEl.textContent = "Backend not ready. Try again."; return; }

      var selectedOption = entitySelect ? entitySelect.options[entitySelect.selectedIndex] : null;
      var selectedEntityName = selectedOption ? selectedOption.text.replace(/\s*\([^)]*\)$/, "") : selectedEntityKey;

      api.createModelAssignment(currentTenantId, selectedEntityKey, {
        assignmentKey: "ui-" + Date.now(),
        modelKey: model,
        currentPromptVersion: currentPrompt || undefined,
        targetPromptVersion: targetPrompt,
        rolloutStrategy: "canary",
        rolloutPercent: 10,
        ownerApprovalStatus: "pending",
        assignmentStatus: "planned"
      }).subscribe({
        next: function () {
          /* Refresh assignments table from backend */
          api.getModelAssignments(currentTenantId).subscribe({
            next: function (assignRes) {
              renderAssignmentsTable(assignRes.data || []);
              /* refresh model cards assignment counts */
              api.getModels(currentTenantId).subscribe({
                next: function (modelsRes) {
                  allModels = modelsRes.data || [];
                  renderModelCards(allModels);
                }
              });
            }
          });
          var vbEntity = document.getElementById("vbEntityCtx");
          if (vbEntity) vbEntity.textContent = selectedEntityName;
          var assignDisplay = document.getElementById("assignEntityDisplay");
          if (assignDisplay) assignDisplay.textContent = selectedEntityName;
          var targetDisplay = document.getElementById("assignTargetDisplay");
          if (targetDisplay) targetDisplay.textContent = targetPrompt;
          var modelDisplay = document.getElementById("assignModelDisplay");
          if (modelDisplay) modelDisplay.textContent = model;
          if (statusEl) statusEl.textContent = "Prompt " + targetPrompt + " assigned to " + selectedEntityName + " with 10% canary rollout.";
          document.getElementById("assignEntityPopup").classList.remove("open");
        },
        error: function (error) {
          if (statusEl) statusEl.textContent = "Backend error: " + ((error.error && error.error.error) || "assignment could not be saved.");
        }
      });
    });

    /* ── Step nav ── */
    document.getElementById("saveModelStepBtn").addEventListener("click", function () {
      var s = readJourneyState();
      s.step = 5; s.modelsConfigured = true; s.lastModuleCompleted = "models_quality"; s.updatedAt = new Date().toISOString();
      writeJourneyState(s);
      audit("model.step_saved", "model", currentEntityId, { entityId: currentEntityId, entityName: entityName });
      document.getElementById("modelJourneyStatus").textContent = "Step 5 saved. Models & Quality configured.";
    });

    document.getElementById("nextToClassificationBtn").addEventListener("click", function () {
      var s = readJourneyState();
      s.step = 5; s.modelsConfigured = true; s.lastModuleCompleted = "models_quality"; s.updatedAt = new Date().toISOString();
      writeJourneyState(s);
      audit("model.step_completed", "model", currentEntityId, { entityId: currentEntityId, entityName: entityName });
      var nextParams = new URLSearchParams();
      if (entityName)         nextParams.set("entityName",   entityName);
      if (entityId)           nextParams.set("entityId",     entityId);
      if (intakeModes.length) nextParams.set("intakeModes",  intakeModes.join(","));
      nextParams.set("apEnabled", apEnabled ? "1" : "0");
      nextParams.set("arEnabled", arEnabled ? "1" : "0");
      window.location.href = "/document-classification?" + nextParams.toString();
    });
  }
}
