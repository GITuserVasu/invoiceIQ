// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-document-classification',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './document-classification.html',
  styleUrl: './document-classification.css',
  encapsulation: ViewEncapsulation.None
})
export class DocumentClassificationComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
    var api = this.api;
    var currentTenantId = "";
    var allClassModels = [];
    var allMappings = [];
    var allEntities = [];

    var params = new URLSearchParams(window.location.search);
    var urlEntityId   = params.get("entityId")   || "";
    var urlEntityName = params.get("entityName") || "";

    /* ── Helpers ── */
    function readJourneyState() {
      try { return JSON.parse(localStorage.getItem("clientJourneyState") || "{}"); }
      catch (e) { return {}; }
    }
    function writeJourneyState(next) {
      localStorage.setItem("clientJourneyState", JSON.stringify(next));
    }
    function el(id) { return document.getElementById(id); }

    /* ── Render classification model cards ── */
    function renderClassModelCards(models) {
      var container = el("classModelCards");
      if (!container) return;
      container.innerHTML = "";
      if (!models.length) {
        container.innerHTML = "<p style=\"color:#7388a1\">No classification models registered yet. Click Register New Model.</p>";
        return;
      }
      models.forEach(function (m) {
        var btn = document.createElement("button");
        btn.className = "model-card";
        btn.type = "button";
        btn.innerHTML = "<b>" + m.display_name + "</b>"
          + "<span>" + (m.description || m.provider) + (m.model_version ? " · " + m.model_version : "") + "</span>"
          + (m.published_count > 0
            ? "<span class=\"badge ok\" style=\"margin-top:4px;font-size:10px\">" + m.published_count + " published</span>"
            : "");
        btn.addEventListener("click", function () {
          openConfigurePopup(m.model_key, m.display_name);
        });
        container.appendChild(btn);
      });
      el("kpiModels").textContent = String(models.length);
    }

    /* ── Render mappings table ── */
    function renderMappingsTable(mappings) {
      var tbody = el("mappingsTableBody");
      if (!tbody) return;
      var published = mappings.filter(function (m) { return m.lifecycle_status === "published"; });
      var uniqueEntities = new Set(published.map(function (m) { return m.entity_key; }));
      el("kpiMappings").textContent  = String(published.length);
      el("kpiEntities").textContent  = String(uniqueEntities.size);

      if (!mappings.length) {
        tbody.innerHTML = "<tr><td colspan=\"7\" style=\"text-align:center;color:#7388a1\">No mappings yet. Configure and publish from a model card above.</td></tr>";
        return;
      }
      tbody.innerHTML = mappings.map(function (m) {
        var cls = m.lifecycle_status === "published" ? "ok" : m.lifecycle_status === "draft" ? "warn" : "bad";
        var label = m.lifecycle_status === "published" ? "Published" : m.lifecycle_status === "draft" ? "Draft" : m.lifecycle_status;
        return "<tr>"
          + "<td>" + m.entity_name + "</td>"
          + "<td>" + m.model_name + "</td>"
          + "<td>" + (m.document_type_key || "—") + "</td>"
          + "<td>" + (m.confidence_threshold_pct ? Number(m.confidence_threshold_pct).toFixed(0) + "%" : "—") + "</td>"
          + "<td>" + (m.class_count || "0") + " classes</td>"
          + "<td>v" + (m.version_no || 1) + "</td>"
          + "<td><span class=\"badge " + cls + "\">" + label + "</span></td>"
          + "</tr>";
      }).join("");
    }

    /* ── Open configure popup ── */
    function openConfigurePopup(modelKey, modelName) {
      var titleEl = el("configureClassTitle");
      if (titleEl) titleEl.textContent = (modelName || "Configure") + " — Classification Setup";

      var modelSel = el("configModelSelect");
      if (modelSel && modelKey) {
        Array.from(modelSel.options).forEach(function (o) { o.selected = o.value === modelKey; });
      }

      /* pre-fill entity if coming from URL */
      var entitySel = el("configEntitySelect");
      if (entitySel && urlEntityId) {
        Array.from(entitySel.options).forEach(function (o) { o.selected = o.value === urlEntityId; });
      }

      el("configJsonOutput").textContent = JSON.stringify({ entity: "", model: modelKey || "", thresholdPct: 90, classLabels: [] }, null, 2);
      el("configClassStatus").textContent = "Select entity, adjust settings, then Save & Publish.";
      el("configureClassPopup").classList.add("open");
    }

    function buildConfigPayload() {
      var entitySel  = el("configEntitySelect");
      var entityKey  = entitySel ? entitySel.value : "";
      var entityOpt  = entitySel ? entitySel.options[entitySel.selectedIndex] : null;
      var entityName = entityOpt ? entityOpt.text.replace(/\s*\([^)]*\)$/, "") : entityKey;
      var modelSel   = el("configModelSelect");
      var modelKey   = modelSel ? modelSel.value : "";
      var modelOpt   = modelSel ? modelSel.options[modelSel.selectedIndex] : null;
      var modelName  = modelOpt ? modelOpt.text : modelKey;
      var docType    = el("configDocType").value;
      var threshold  = Number(el("configThreshold").value || 90);
      var fallback   = el("configFallback").value;
      var classes    = (el("configClassLabels").value || "")
        .split(",").map(function (x) { return x.trim(); }).filter(Boolean);
      var payload = {
        entity: entityName,
        entityKey: entityKey,
        model: modelName,
        modelKey: modelKey,
        documentType: docType,
        thresholdPct: threshold,
        fallbackClass: fallback,
        classLabels: classes
      };
      el("configJsonOutput").textContent = JSON.stringify(payload, null, 2);
      return payload;
    }

    /* ── Journey mode: hide assign + step sections when no entity context ── */
    if (!urlEntityId && !urlEntityName) {
      var ap = document.getElementById("journeyAssignPanel");
      if (ap) ap.hidden = true;
      var sp = document.getElementById("journeyStepPanel");
      if (sp) sp.hidden = true;
    }

    function audit(action, resourceType?, resourceId?, meta?) {
      if (!currentTenantId) return;
      api.logAudit(currentTenantId, action, resourceType || "ui", resourceId || null, meta || {}).subscribe({ error: function() {} });
    }

    /* ── Bootstrap: load tenant then all data ── */
    api.getTenant().subscribe({
      next: function (tenantResponse) {
        var tenant = tenantResponse.data && tenantResponse.data[0];
        if (!tenant) return;
        currentTenantId = tenant.id;

        /* Load classification models */
        api.getClassificationModels(currentTenantId).subscribe({
          next: function (res) {
            allClassModels = res.data || [];
            renderClassModelCards(allClassModels);
            /* populate model dropdown in configure popup */
            var modelSel = el("configModelSelect");
            if (modelSel) {
              modelSel.innerHTML = "<option value=\"\">— Select model —</option>"
                + allClassModels.map(function (m) {
                  return "<option value=\"" + m.model_key + "\">" + m.display_name + " (" + m.provider + ")</option>";
                }).join("");
            }
          }
        });

        /* Load entities for the entity dropdown */
        api.getEntities(currentTenantId).subscribe({
          next: function (res) {
            allEntities = res.data || [];
            var entitySel = el("configEntitySelect");
            if (entitySel) {
              entitySel.innerHTML = "<option value=\"\">— Select entity —</option>"
                + allEntities.map(function (e) {
                  var sel = e.entity_key === urlEntityId ? " selected" : "";
                  return "<option value=\"" + e.entity_key + "\"" + sel + ">" + e.name + " (" + e.entity_key + ")</option>";
                }).join("");
            }
            /* pre-fill entity display */
            if (urlEntityName) {
              el("mappingEntityDisplay").textContent = urlEntityName;
            }
          }
        });

        /* Load all mappings */
        api.getAllClassificationMappings(currentTenantId).subscribe({
          next: function (res) {
            allMappings = res.data || [];
            renderMappingsTable(allMappings);
          }
        });
      },
      error: function () {
        el("mappingStatus").textContent = "Backend unavailable. Start the API on port 7070.";
      }
    });

    /* ── Register model popup ── */
    el("openRegisterClassModelBtn").addEventListener("click", function () {
      el("registerClassModelPopup").classList.add("open");
      el("registerClassModelStatus").textContent = "";
      audit("classification.popup.register_opened", "classification_model");
    });
    el("closeRegisterClassModelBtn").addEventListener("click", function () {
      el("registerClassModelPopup").classList.remove("open");
    });
    el("registerClassModelPopup").addEventListener("click", function (ev) {
      if (ev.target.id === "registerClassModelPopup") el("registerClassModelPopup").classList.remove("open");
    });

    el("saveRegisterClassModelBtn").addEventListener("click", function () {
      var displayName = el("newClassModelName").value.trim();
      var provider    = el("newClassModelProvider").value.trim();
      var version     = el("newClassModelVersion").value.trim();
      var description = el("newClassModelDescription").value.trim();
      var statusEl    = el("registerClassModelStatus");
      if (!displayName || !provider) { statusEl.textContent = "Model name and provider are required."; return; }
      if (!currentTenantId)          { statusEl.textContent = "Backend not ready. Try again."; return; }
      api.registerClassificationModel(currentTenantId, {
        displayName: displayName, provider: provider,
        modelVersion: version || undefined, description: description || undefined
      }).subscribe({
        next: function (saved) {
          var exists = allClassModels.findIndex(function (m) { return m.model_key === saved.model_key; });
          if (exists >= 0) allClassModels[exists] = Object.assign({}, saved, { published_count: 0 });
          else allClassModels.unshift(Object.assign({}, saved, { published_count: 0 }));
          renderClassModelCards(allClassModels);
          /* refresh model select */
          var modelSel = el("configModelSelect");
          if (modelSel) {
            modelSel.innerHTML = "<option value=\"\">— Select model —</option>"
              + allClassModels.map(function (m) {
                return "<option value=\"" + m.model_key + "\">" + m.display_name + " (" + m.provider + ")</option>";
              }).join("");
          }
          statusEl.textContent = "Model \"" + saved.display_name + "\" registered.";
          el("kpiModels").textContent = String(allClassModels.length);
          ["newClassModelName","newClassModelProvider","newClassModelVersion","newClassModelDescription"].forEach(function (id) {
            var e = el(id); if (e) e.value = "";
          });
          setTimeout(function () { el("registerClassModelPopup").classList.remove("open"); }, 1200);
        },
        error: function (error) {
          statusEl.textContent = "Error: " + ((error.error && error.error.error) || "could not register model.");
        }
      });
    });

    /* ── Configure popup open/close ── */
    el("openConfigureClassBtn").addEventListener("click", function () {
      openConfigurePopup("", "");
      audit("classification.popup.configure_opened", "classification_model", null, { entityId: urlEntityId });
    });
    el("closeConfigureClassBtn").addEventListener("click", function () {
      el("configureClassPopup").classList.remove("open");
    });
    el("configureClassPopup").addEventListener("click", function (ev) {
      if (ev.target.id === "configureClassPopup") el("configureClassPopup").classList.remove("open");
    });

    /* live JSON preview on input changes */
    ["configEntitySelect","configModelSelect","configDocType","configThreshold","configFallback","configClassLabels"].forEach(function (id) {
      var e = el(id);
      if (e) e.addEventListener("change", buildConfigPayload);
      if (e) e.addEventListener("input",  buildConfigPayload);
    });

    el("previewConfigBtn").addEventListener("click", function () {
      buildConfigPayload();
      el("configClassStatus").textContent = "Config preview updated.";
    });

    el("testClassBtn").addEventListener("click", function () {
      var payload = buildConfigPayload();
      if (!payload.entityKey || !currentTenantId) {
        el("configClassStatus").textContent = "Select an entity first to test."; return;
      }
      var sampleText = el("configSampleText").value.trim();
      if (!sampleText) { el("configClassStatus").textContent = "Enter sample text above to test."; return; }
      el("configClassStatus").textContent = "Running sample classification...";
      api.testClassification(currentTenantId, payload.entityKey, {
        sampleText: sampleText, sampleMetadata: { source: "classification-ui" }
      }).subscribe({
        next: function (result) {
          el("configClassStatus").textContent = result.result_message || ("Predicted: " + result.predicted_class_key);
        },
        error: function (err) {
          el("configClassStatus").textContent = "Test error: " + ((err.error && err.error.error) || "no mapping yet, save first.");
        }
      });
    });

    el("savePublishClassBtn").addEventListener("click", function () {
      var payload = buildConfigPayload();
      if (!payload.entityKey) { el("configClassStatus").textContent = "Select an entity."; return; }
      if (!payload.modelKey)  { el("configClassStatus").textContent = "Select a model.";   return; }
      if (!payload.classLabels.length) { el("configClassStatus").textContent = "Enter at least one class label."; return; }
      if (!currentTenantId)  { el("configClassStatus").textContent = "Backend not ready."; return; }
      el("configClassStatus").textContent = "Saving classification mapping...";
      var mappingKey = payload.entityKey.toLowerCase() + "-class-" + payload.documentType;
      api.saveClassification(currentTenantId, payload.entityKey, {
        mappingKey:      mappingKey,
        modelKey:        payload.modelKey,
        documentTypeKey: payload.documentType,
        thresholdPct:    payload.thresholdPct,
        fallbackClass:   payload.fallbackClass,
        classLabels:     payload.classLabels
      }).subscribe({
        next: function (savedMapping) {
          api.publishClassification(currentTenantId, payload.entityKey, savedMapping.mapping_key).subscribe({
            next: function () {
              el("configClassStatus").textContent = "Published mapping for " + payload.entity + " with " + payload.classLabels.length + " classes.";
              /* update summary bar */
              el("mappingEntityDisplay").textContent = payload.entity;
              el("mappingModelDisplay").textContent  = payload.model;
              el("mappingClassCount").textContent    = String(payload.classLabels.length);
              el("mappingStatusBadge").textContent   = "Published";
              /* refresh mappings table */
              api.getAllClassificationMappings(currentTenantId).subscribe({
                next: function (res) {
                  allMappings = res.data || [];
                  renderMappingsTable(allMappings);
                }
              });
              /* refresh model card counts */
              api.getClassificationModels(currentTenantId).subscribe({
                next: function (res) { allClassModels = res.data || []; renderClassModelCards(allClassModels); }
              });
              setTimeout(function () { el("configureClassPopup").classList.remove("open"); }, 1400);
            },
            error: function (err) {
              el("configClassStatus").textContent = "Publish error: " + ((err.error && err.error.error) || "publish failed.");
            }
          });
        },
        error: function (err) {
          el("configClassStatus").textContent = "Save error: " + ((err.error && err.error.error) || "save failed.");
        }
      });
    });

    /* ── Refresh button ── */
    el("refreshMappingsBtn").addEventListener("click", function () {
      if (!currentTenantId) return;
      api.getAllClassificationMappings(currentTenantId).subscribe({
        next: function (res) { allMappings = res.data || []; renderMappingsTable(allMappings); }
      });
    });

    /* ── Journey nav ── */
    el("saveClassificationStepBtn").addEventListener("click", function () {
      var s = readJourneyState();
      s.step = 6; s.classificationConfigured = true; s.lastModuleCompleted = "classification"; s.updatedAt = new Date().toISOString();
      writeJourneyState(s);
      audit("classification.step_saved", "classification_model", urlEntityId, { entityId: urlEntityId, entityName: urlEntityName });
      el("journeyStatus").textContent = "Step 6 saved. Classification configured.";
    });
    el("nextToProviderBtn").addEventListener("click", function () {
      var s = readJourneyState();
      s.step = 6; s.classificationConfigured = true; s.lastModuleCompleted = "classification"; s.updatedAt = new Date().toISOString();
      writeJourneyState(s);
      audit("classification.step_completed", "classification_model", urlEntityId, { entityId: urlEntityId, entityName: urlEntityName });
      var np = new URLSearchParams();
      if (urlEntityId)   np.set("entityId",   urlEntityId);
      if (urlEntityName) np.set("entityName", urlEntityName);
      window.location.href = "/provider-governance?" + np.toString();
    });
  }
}
