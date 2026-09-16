// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-data-connectors',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './data-connectors.html',
  styleUrl: './data-connectors.css',
  encapsulation: ViewEncapsulation.None
})
export class DataConnectorsComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();

    // -- URL params ----------------------------------------------------------
    var params   = new URLSearchParams(window.location.search);
    var tenantId = params.get('tenantId') || '';
    var entityId = params.get('entityId') || '';

    // -- Crumb + back links --------------------------------------------------
    var crumbEl = document.getElementById('entityCrumbName');
    if (crumbEl && entityId) crumbEl.textContent = entityId;
    var paramStr = entityId ? '?tenantId=' + tenantId + '&entityId=' + entityId : '';
    var dashLink = document.getElementById('backToDashboardLink');
    if (dashLink && paramStr) dashLink.setAttribute('href', '/entity-dashboard' + paramStr);

    ['linkExceptions','linkReconciliation','linkTransactions'].forEach(function(id) {
      var route = { linkExceptions:'/exception-queue', linkReconciliation:'/reconciliation', linkTransactions:'/transactions' }[id];
      var el = document.getElementById(id) as HTMLAnchorElement;
      if (el && paramStr) el.setAttribute('href', route + paramStr);
    });

    // -- Master connector definitions ----------------------------------------
    var CONNECTOR_DEFS = [
      {
        key: 'sap',
        title: 'ERP / Accounting Package',
        icon: '&#9889;',
        color: '#0a5d72',
        bgColor: 'rgba(10,93,114,.08)',
        description: 'Pull Purchase Orders, Goods Receipts, and Invoices from SAP S/4HANA or ECC via OData or QBO or Xero',
        configFields: [
          { label: 'SAP Endpoint URL',        hint: 'https://your-sap-host:44300/sap/opu/...', key: 'endpoint' },
          { label: 'Client ID / Username',    hint: 'OAuth2 client_id or Basic auth user',     key: 'clientId' },
          { label: 'Client Secret / Password',hint: '&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;', key: 'clientSecret', sensitive: true },
          { label: 'Document Types',          hint: 'PO,GRN,INV',                              key: 'docTypes' },
          { label: 'API Version',             hint: 'v4 or v2',                                key: 'apiVersion' }
        ],
        syncAction: 'syncSap'
      },
      {
        key: 'mail',
        title: 'Email Inbox',
        icon: '&#9993;',
        color: '#5b3fa8',
        bgColor: 'rgba(91,63,168,.08)',
        description: 'Scan Gmail or Microsoft 365 mailbox for invoice attachments (PDF/XML) automatically.',
        configFields: [
          { label: 'Mail Provider',           hint: 'gmail | m365 | imap',                     key: 'provider' },
          { label: 'Mailbox / Email Address', hint: 'ap-invoices@company.com',                 key: 'mailbox' },
          { label: 'OAuth2 Refresh Token',    hint: '&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;', key: 'refreshToken', sensitive: true },
          { label: 'Folder to Watch',         hint: 'INBOX / AP-Invoices',                     key: 'folder' },
          { label: 'Sync Frequency',          hint: 'daily | hourly | realtime',               key: 'syncFrequency' }
        ],
        syncAction: 'syncMail'
      },
      {
        key: 'vendor',
        title: 'Vendor Portal',
        icon: '&#127970;',
        color: '#7a4a10',
        bgColor: 'rgba(122,74,16,.08)',
        description: 'Connect to a vendor REST API to pull approved invoices and status updates.',
        configFields: [
          { label: 'Portal Base URL',         hint: 'https://vendor-portal.example.com/api/v1',key: 'portalUrl' },
          { label: 'Auth Type',               hint: 'basic | bearer | oauth2',                 key: 'authType' },
          { label: 'Username / Client ID',    hint: 'api_user or client_id',                   key: 'username' },
          { label: 'Password / Token',        hint: '&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;', key: 'password', sensitive: true },
          { label: 'Auto-approve Matched',    hint: 'true | false',                            key: 'autoApprove' }
        ],
        syncAction: 'syncVendorPortal'
      }
    ];

    // -- Per-connector step definitions for progress log ---------------------
    var SYNC_STEPS = {
      sap: [
        { icon: '&#128246;', label: 'Connecting to SAP endpoint',     detail: 'Opening OData connection to S/4HANA host' },
        { icon: '&#128272;', label: 'Authenticating',                 detail: 'Validating OAuth2 / Basic credentials' },
        { icon: '&#128203;', label: 'Fetching Purchase Orders',       detail: 'Pulling PO headers & line items via OData v4' },
        { icon: '&#128666;', label: 'Fetching Goods Receipts (GRNs)', detail: 'Pulling MIGO / GRN records from SAP' },
        { icon: '&#128196;', label: 'Fetching Invoices',              detail: 'Pulling FI invoices from SAP MM/FI' },
        { icon: '&#128260;', label: 'Processing & deduplicating',     detail: 'Checking against existing records in Lexa DB' },
        { icon: '&#128221;', label: 'Committing to database',         detail: 'Inserting new records into ap_* tables' },
        { icon: '&#9989;',   label: 'Sync complete',                  detail: 'Audit event logged, status updated' }
      ],
      mail: [
        { icon: '&#128246;', label: 'Connecting to mail server',      detail: 'Establishing connection to mailbox' },
        { icon: '&#128272;', label: 'Authenticating',                 detail: 'Validating OAuth2 / IMAP credentials' },
        { icon: '&#128140;', label: 'Scanning inbox folder',          detail: 'Reading unread messages in configured folder' },
        { icon: '&#128196;', label: 'Extracting attachments',         detail: 'Downloading PDF/XML invoice attachments' },
        { icon: '&#128269;', label: 'Classifying documents',          detail: 'AI model identifying document types' },
        { icon: '&#128260;', label: 'Processing invoices',            detail: 'Parsing & inserting into entity_invoices' },
        { icon: '&#9989;',   label: 'Sync complete',                  detail: 'Audit event logged, status updated' }
      ],
      vendor: [
        { icon: '&#128246;', label: 'Connecting to vendor portal',    detail: 'Opening REST connection to vendor API' },
        { icon: '&#128272;', label: 'Authenticating',                 detail: 'Validating API token / OAuth2 credentials' },
        { icon: '&#128196;', label: 'Fetching approved invoices',     detail: 'Pulling invoices with status=approved' },
        { icon: '&#128260;', label: 'Processing & deduplicating',     detail: 'Checking against existing entity_invoices' },
        { icon: '&#128221;', label: 'Committing to database',         detail: 'Inserting new vendor invoices' },
        { icon: '&#9989;',   label: 'Sync complete',                  detail: 'Audit event logged, status updated' }
      ]
    };

    // -- State ---------------------------------------------------------------
    var syncState: Record<string, { loading: boolean; result: any; error: string; stepIdx: number; apiDone: boolean }> = {};
    var syncTimers: Record<string, any> = {};
    CONNECTOR_DEFS.forEach(function(c) {
      syncState[c.key] = { loading: false, result: null, error: '', stepIdx: -1, apiDone: false };
    });
    var matchState   = { loading: false, result: null, error: '' };
    var uploadState  = { loading: false, files: [], results: [] };
    var channelStatus: Record<string, any> = {};
    var activeKeys: string[] = [];

    var self = this;

    // -- Load sync/channel status --------------------------------------------
    function loadChannelStatus() {
      self.api.getSyncStatus(tenantId, entityId).subscribe({
        next: function(res: any) {
          channelStatus = res.channels || {};
          activeKeys = Object.keys(channelStatus).filter(function(k) {
            return channelStatus[k].isActive;
          });
          if (!activeKeys.length && Object.keys(channelStatus).length) {
            activeKeys = Object.keys(channelStatus);
          }
          renderAll();
        },
        error: function() {
          activeKeys = [];
          renderAll();
        }
      });
    }

    function initWithTenant(tid: string) {
      tenantId = tid;
      var ps = entityId ? '?tenantId=' + tenantId + '&entityId=' + entityId : '';
      var dl = document.getElementById('backToDashboardLink');
      if (dl && ps) dl.setAttribute('href', '/entity-dashboard' + ps);
      ['linkExceptions','linkReconciliation','linkTransactions'].forEach(function(id) {
        var route = { linkExceptions:'/exception-queue', linkReconciliation:'/reconciliation', linkTransactions:'/transactions' }[id];
        var el = document.getElementById(id) as HTMLAnchorElement;
        if (el && ps) el.setAttribute('href', route + ps);
      });
      loadChannelStatus();
    }

    if (tenantId && entityId) {
      initWithTenant(tenantId);
    } else if (entityId) {
      self.api.getTenant().subscribe({
        next: function(res: any) {
          var t = res.data && res.data[0];
          if (t) { initWithTenant(t.id); }
          else   { renderAll(); }
        },
        error: function() { renderAll(); }
      });
    } else {
      renderAll();
    }

    // -- Helpers -------------------------------------------------------------
    function statusBadge(key: string) {
      var ch = channelStatus[key];
      if (!ch || !ch.isActive) return '<span class="status-badge not-configured">Not Enabled</span>';
      if (ch.lastSyncStatus === 'success') return '<span class="status-badge success">Connected</span>';
      if (ch.lastSyncStatus === 'error')   return '<span class="status-badge error">Sync Error</span>';
      return '<span class="status-badge configured">Configured</span>';
    }

    function lastSyncText(key: string) {
      var ch = channelStatus[key];
      if (!ch || !ch.lastSyncAt) return 'Never synced';
      return 'Last sync: ' + new Date(ch.lastSyncAt).toLocaleString();
    }

    // -- Sync progress log HTML ----------------------------------------------
    function syncLogHtml(key: string) {
      var s = syncState[key];
      var steps = SYNC_STEPS[key] || [];

      // Not started yet
      if (s.stepIdx === -1 && !s.result && !s.error) return '';

      // Build the step timeline
      var stepsHtml = steps.map(function(step, i) {
        var state = 'pending';
        if (i < s.stepIdx) state = 'done';
        else if (i === s.stepIdx && !s.apiDone) state = 'active';
        else if (i === s.stepIdx && s.apiDone)  state = 'done';

        // On error: mark current step as error, rest pending
        if (s.error && i === s.stepIdx) state = 'error';
        if (s.error && i > s.stepIdx) state = 'pending';

        var iconHtml = state === 'active'
          ? '<div class="sl-dot active"><div class="sl-spinner"></div></div>'
          : state === 'done'
            ? '<div class="sl-dot done">&#10003;</div>'
            : state === 'error'
              ? '<div class="sl-dot error">&#x26A0;</div>'
              : '<div class="sl-dot pending"></div>';

        return '<div class="sl-row sl-' + state + '">' +
          iconHtml +
          '<div class="sl-body">' +
            '<div class="sl-label">' + step.label + '</div>' +
            '<div class="sl-detail">' + step.detail + '</div>' +
          '</div>' +
          (state === 'active' ? '<div class="sl-time-badge">running</div>' :
           state === 'done'   ? '<div class="sl-time-badge done">done</div>' :
           state === 'error'  ? '<div class="sl-time-badge error">failed</div>' : '') +
        '</div>';
      }).join('');

      // Result summary at bottom
      var summaryHtml = '';
      if (s.result && !s.loading) {
        var r = s.result;
        summaryHtml = '<div class="sl-summary ok">' +
          '<span class="sl-sum-icon">&#9989;</span>' +
          '<div class="sl-sum-body">' +
            '<b>Sync complete</b>' +
            '<div class="sl-pills">' +
              '<span class="pill green">+' + (r.inserted || 0) + ' new</span> ' +
              '<span class="pill yellow">' + (r.skipped || 0) + ' skipped</span>' +
              (r.errors?.length ? '<span class="pill red">' + r.errors.length + ' errors</span>' : '') +
              (r.invoices?.inserted ? '<span class="pill blue">' + r.invoices.inserted + ' invoices</span>' : '') +
              (r.pos?.inserted ? '<span class="pill blue">' + r.pos.inserted + ' POs</span>' : '') +
              (r.grns?.inserted ? '<span class="pill blue">' + r.grns.inserted + ' GRNs</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      } else if (s.error) {
        summaryHtml = '<div class="sl-summary err">' +
          '<span class="sl-sum-icon">&#x26A0;</span>' +
          '<div class="sl-sum-body"><b>Sync failed</b><div class="sl-err-msg">' + s.error + '</div></div>' +
        '</div>';
      }

      return '<div class="sync-log">' +
        '<div class="sl-header">' +
          '<div class="sl-title">' +
            (s.loading ? '<div class="sl-pulse"></div>' : '') +
            (s.loading ? 'Sync in progress&hellip;' : (s.error ? 'Sync failed' : 'Sync complete')) +
          '</div>' +
          (!s.loading ? '<button class="sl-close" onclick="window._clearLog(\'' + key + '\')">&#x2715; Clear</button>' : '') +
        '</div>' +
        '<div class="sl-steps">' + stepsHtml + '</div>' +
        summaryHtml +
      '</div>';
    }

    // -- Render connector grid -----------------------------------------------
    function renderConnectorGrid() {
      var grid = document.getElementById('connectorGrid');
      if (!grid) return;

      var html = CONNECTOR_DEFS.map(function(c) {
        var isActive = activeKeys.indexOf(c.key) !== -1;
        var disabledClass = isActive ? '' : ' disabled-card';
        var s = syncState[c.key];
        return '<div class="connector-card' + disabledClass + '" style="border-top:3px solid ' + (isActive ? c.color : '#ccc') + '">' +
          (isActive ? '' : '<div class="not-enabled-overlay"><span class="not-enabled-badge">Not enabled for this entity</span></div>') +
          '<div class="cc-head">' +
            '<div class="cc-icon" style="background:' + (isActive ? c.bgColor : '#f3f4f6') + ';color:' + (isActive ? c.color : '#bbb') + '">' + c.icon + '</div>' +
            '<div class="cc-info">' +
              '<b>' + c.title + '</b>' +
              '<div class="cc-status-row">' +
                statusBadge(c.key) +
                (isActive ? '<span class="last-sync">' + lastSyncText(c.key) + '</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<p class="cc-desc">' + c.description + '</p>' +
          (isActive ? (
            '<div class="cc-fields">' +
              c.configFields.slice(0,3).map(function(f) {
                return '<div class="cc-field-tag">' + f.label + '</div>';
              }).join('') +
              (c.configFields.length > 3 ? '<div class="cc-field-tag muted">+' + (c.configFields.length-3) + ' more</div>' : '') +
            '</div>' +
            syncLogHtml(c.key) +
            '<div class="cc-actions">' +
              '<button class="btn-outline" onclick="window._openCfg(\'' + c.key + '\')" title="Edit configuration">&#9881; Configure</button>' +
              '<button class="btn-sync" style="background:' + c.color + '" onclick="window._sync(\'' + c.key + '\',\'' + c.syncAction + '\')"' +
                (s.loading ? ' disabled' : '') + '>' +
                (s.loading ? '<span class="btn-spinner"></span>Syncing&hellip;' : '&#9654; Sync Now') +
              '</button>' +
            '</div>'
          ) : (
            '<p class="enable-hint">Enable this connector by editing the entity in <a href="/entities/create?editEntityId=' + entityId + '&tenantId=' + tenantId + '">Entity Setup</a>.</p>'
          )) +
        '</div>';
      }).join('');

      grid.innerHTML = html;
    }

    // -- Render upload section -----------------------------------------------
    function renderUploadSection() {
      var section = document.getElementById('uploadSection');
      if (!section) return;

      var uploadActive = activeKeys.indexOf('upload') !== -1;

      if (!uploadActive) {
        section.innerHTML = '<div class="disabled-section-notice">' +
          '<span class="not-enabled-badge">Upload not enabled for this entity</span>' +
          '<p>Document upload was not selected during entity creation. ' +
          '<a href="/entities/create?editEntityId=' + entityId + '&tenantId=' + tenantId + '">Edit entity setup</a> to enable it.</p>' +
          '</div>';
        return;
      }

      section.innerHTML =
        '<div id="dropZone" class="drop-zone">' +
          '<div class="dz-inner">' +
            '<div class="dz-icon">&#128194;</div>' +
            '<p class="dz-title">Drop files here or <span class="dz-link">click to browse</span></p>' +
            '<p class="dz-hint">Max 20 MB per file &bull; PDF, XML, XLSX, JPG, PNG, CSV</p>' +
          '</div>' +
          '<input type="file" id="fileInput" multiple accept=".pdf,.xml,.xlsx,.jpg,.jpeg,.png,.csv" style="display:none" />' +
        '</div>' +
        '<div id="uploadResults"></div>';

      bindDropZone();
    }

    function renderUploadResults() {
      var el = document.getElementById('uploadResults');
      if (!el) return;
      if (uploadState.loading) {
        el.innerHTML = '<div class="sync-progress"><div class="spinner"></div>Uploading ' + uploadState.files.length + ' file(s)&hellip;</div>';
        return;
      }
      if (!uploadState.results.length) { el.innerHTML = ''; return; }
      el.innerHTML = (uploadState.results as any[]).map(function(r) {
        return '<div class="upload-result-row ' + (r.ok ? 'ok' : 'fail') + '">' +
          '<span class="uname">' + r.name + '</span>' +
          (r.ok
            ? '<span class="pill green">&#10003; ' + (r.result?.documentType || 'Queued') + '</span>'
            : '<span class="pill red">&#x26A0; ' + r.error + '</span>') +
        '</div>';
      }).join('');
    }

    // -- Render match section ------------------------------------------------
    function renderMatchSection() {
      var el = document.getElementById('matchResults');
      if (!el) return;
      if (matchState.loading) {
        el.innerHTML = '<div class="sync-progress"><div class="spinner"></div>Running 3-way match engine&hellip;</div>';
        return;
      }
      if (matchState.error) {
        el.innerHTML = '<div class="sync-error">&#x26A0; ' + matchState.error + '</div>';
        return;
      }
      if (!matchState.result) { el.innerHTML = ''; return; }
      var s = matchState.result.summary;
      var results = matchState.result.results || [];

      el.innerHTML =
        '<div class="match-summary-grid">' +
          metricBox('Total', s.total, '#333') +
          metricBox('Matched', s.matched, '#1a7a4a') +
          metricBox('Partial', s.partial, '#b45309') +
          metricBox('Unmatched', s.unmatched, '#b91c1c') +
          metricBox('Auto Resolved', s.autoResolved, '#0a5d72') +
        '</div>' +
        (results.length > 0
          ? '<div class="match-table-wrap"><table class="match-table">' +
              '<thead><tr><th>Invoice</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Score</th><th>Variances</th></tr></thead>' +
              '<tbody>' + results.slice(0,10).map(function(r) {
                var cls = r.matchStatus === 'matched' ? 'matched' : r.matchStatus === 'partial' ? 'partial' : 'unmatched';
                return '<tr class="match-row ' + cls + '">' +
                  '<td>' + (r.invoiceNumber || r.invoice_id || '&mdash;') + '</td>' +
                  '<td>' + (r.vendorName    || r.vendor_id  || '&mdash;') + '</td>' +
                  '<td>' + (r.totalAmount ? '&#8377;' + Number(r.totalAmount).toLocaleString('en-IN') : '&mdash;') + '</td>' +
                  '<td><span class="status-badge ' + cls + '">' + r.matchStatus + '</span></td>' +
                  '<td>' + (r.matchScore != null ? r.matchScore + '%' : '&mdash;') + '</td>' +
                  '<td>' + (r.variances?.length || 0) + '</td>' +
                '</tr>';
              }).join('') +
            '</tbody></table></div>' +
            (results.length > 10 ? '<p class="muted-note">Showing 10 of ' + results.length + ' results.</p>' : '')
          : '<p class="muted-note">No invoices were processed.</p>');
    }

    function metricBox(label: string, value: any, color: string) {
      return '<div class="match-metric" style="border-top:3px solid ' + color + '">' +
        '<span class="mm-val" style="color:' + color + '">' + (value ?? 0) + '</span>' +
        '<span class="mm-label">' + label + '</span>' +
      '</div>';
    }

    function renderAll() {
      renderConnectorGrid();
      renderUploadSection();
      renderMatchSection();
    }

    // -- Config modal --------------------------------------------------------
    function openConfig(key: string) {
      var conn = CONNECTOR_DEFS.find(function(c) { return c.key === key; });
      if (!conn) return;
      var saved = (channelStatus[key]?.connectionSettings) || {};

      var modal = document.getElementById('configModal');
      if (!modal) return;

      var fieldsHtml = conn.configFields.map(function(f) {
        var savedVal = saved[f.key] != null ? String(saved[f.key]) : '';
        return '<div class="form-row">' +
          '<label>' + f.label + (f.sensitive ? ' <span class="field-hint">(leave blank to keep existing)</span>' : '') + '</label>' +
          '<input type="' + (f.sensitive ? 'password' : 'text') + '" placeholder="' + f.hint + '" id="cfg_' + f.key + '" value="' + escapeAttr(savedVal) + '" />' +
        '</div>';
      }).join('');

      modal.innerHTML =
        '<div class="modal-box">' +
          '<div class="modal-header" style="border-left:4px solid ' + conn.color + '">' +
            '<span style="font-size:22px">' + conn.icon + '</span>' +
            '<div>' +
              '<b>Configure ' + conn.title + '</b>' +
              '<p style="color:#666;margin:2px 0 0;font-size:13px">' + conn.description + '</p>' +
            '</div>' +
            '<button class="modal-close" onclick="document.getElementById(\'configModal\').style.display=\'none\'">&#x2715;</button>' +
          '</div>' +
          '<div class="modal-body">' +
            '<div class="info-callout">Credentials are saved to <code>entity_intake_channels.connection_settings</code>. Sensitive fields are masked in this view.</div>' +
            fieldsHtml +
          '</div>' +
          '<div class="modal-footer">' +
            '<button class="btn-secondary" onclick="document.getElementById(\'configModal\').style.display=\'none\'">Cancel</button>' +
            '<button class="btn-primary" onclick="window._saveConfig(\'' + key + '\')">Save Configuration</button>' +
          '</div>' +
        '</div>';
      modal.style.display = 'flex';
    }

    function escapeAttr(val: string) {
      return val.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    (window as any)._saveConfig = function(key: string) {
      var conn = CONNECTOR_DEFS.find(function(c) { return c.key === key; });
      if (!conn) return;
      var values: Record<string, string> = {};
      conn.configFields.forEach(function(f) {
        var el = document.getElementById('cfg_' + f.key) as HTMLInputElement;
        if (el && el.value.trim()) values[f.key] = el.value.trim();
      });
      if (!tenantId || !entityId) {
        showToast('Cannot save - no entity selected.');
        document.getElementById('configModal').style.display = 'none';
        return;
      }
      if (channelStatus[key]) {
        channelStatus[key].connectionSettings = Object.assign({}, channelStatus[key].connectionSettings, values);
      } else {
        channelStatus[key] = { isActive: true, connectionSettings: values, lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, syncFrequency: null };
        if (activeKeys.indexOf(key) === -1) activeKeys.push(key);
      }
      document.getElementById('configModal').style.display = 'none';
      renderConnectorGrid();
      self.api.updateIntakeChannel(tenantId, entityId, key, {
        connectionSettings: values,
        isEnabled: true
      }).subscribe({
        next: function() { showToast(conn.title + ' configuration saved successfully.'); },
        error: function(err) { showToast('Save failed: ' + (err?.error?.error || 'Server error')); }
      });
    };

    // -- Sync step animator --------------------------------------------------
    function startStepAnimation(key: string) {
      var steps = SYNC_STEPS[key] || [];
      var totalSteps = steps.length;
      // Spread steps across ~80% of expected sync time; last step fires on API completion
      // Interval: advance one step every 900ms (steps 0..n-2), hold last step for API
      var idx = 0;

      function advance() {
        if (idx >= totalSteps - 1) return;  // hold last step until API done
        syncState[key].stepIdx = idx;
        renderConnectorGrid();
        idx++;
        syncTimers[key] = setTimeout(advance, 900);
      }

      syncState[key].stepIdx = 0;
      renderConnectorGrid();
      idx = 1;
      syncTimers[key] = setTimeout(advance, 900);
    }

    function stopStepAnimation(key: string) {
      if (syncTimers[key]) {
        clearTimeout(syncTimers[key]);
        syncTimers[key] = null;
      }
    }

    function completeSteps(key: string) {
      var steps = SYNC_STEPS[key] || [];
      stopStepAnimation(key);
      syncState[key].stepIdx = steps.length - 1;
      syncState[key].apiDone = true;
    }

    // -- Sync handler --------------------------------------------------------
    function triggerSync(key: string, action: string) {
      if (!(tenantId && entityId)) { showToast('Open this page from an entity dashboard.'); return; }

      // Reset state and start
      syncState[key] = { loading: true, result: null, error: '', stepIdx: 0, apiDone: false };
      startStepAnimation(key);

      self.api[action](tenantId, entityId).subscribe({
        next: function(res) {
          completeSteps(key);
          syncState[key].loading = false;
          syncState[key].result  = res.result || res;
          renderConnectorGrid();
        },
        error: function(err) {
          stopStepAnimation(key);
          var msg = err?.error?.error || err?.message || 'Sync failed. Check channel configuration.';
          syncState[key].loading = false;
          syncState[key].error   = msg;
          renderConnectorGrid();
        }
      });
    }

    (window as any)._clearLog = function(key: string) {
      syncState[key] = { loading: false, result: null, error: '', stepIdx: -1, apiDone: false };
      renderConnectorGrid();
    };

    // -- File upload handler -------------------------------------------------
    function handleFiles(fileList: FileList) {
      if (!(tenantId && entityId)) { showToast('Open this page from an entity dashboard.'); return; }
      uploadState.loading = true;
      uploadState.files   = Array.from(fileList).map(function(f) { return f.name; });
      renderUploadResults();

      var promises = Array.from(fileList).map(function(file) {
        return new Promise(function(resolve) {
          var reader = new FileReader();
          reader.onload = function(e) {
            var b64 = (e.target.result as string).split(',')[1];
            self.api.uploadDocument(tenantId, entityId, {
              filename: file.name,
              mimeType: file.type || 'application/octet-stream',
              dataBase64: b64,
              sourceHint: 'manual_upload'
            }).subscribe({
              next: function(res) { resolve({ name: file.name, ok: true,  result: res.result }); },
              error: function(err) { resolve({ name: file.name, ok: false, error: err?.error?.error || 'Upload failed' }); }
            });
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(promises).then(function(results) {
        uploadState.loading = false;
        uploadState.results = results;
        renderUploadResults();
      });
    }

    function bindDropZone() {
      var dropZone  = document.getElementById('dropZone');
      var fileInput = document.getElementById('fileInput') as HTMLInputElement;

      if (dropZone) {
        dropZone.addEventListener('dragover',  function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', function()  { dropZone.classList.remove('drag-over'); });
        dropZone.addEventListener('drop', function(e: DragEvent) {
          e.preventDefault();
          dropZone.classList.remove('drag-over');
          if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
        });
        dropZone.addEventListener('click', function() { fileInput?.click(); });
      }
      if (fileInput) {
        fileInput.addEventListener('change', function() {
          if (fileInput.files?.length) handleFiles(fileInput.files);
        });
      }
    }

    // -- Match engine --------------------------------------------------------
    function runMatch() {
      if (!(tenantId && entityId)) { showToast('Open this page from an entity dashboard.'); return; }
      matchState = { loading: true, result: null, error: '' };
      renderMatchSection();
      self.api.runEntityMatch(tenantId, entityId).subscribe({
        next: function(res) { matchState = { loading: false, result: res, error: '' }; renderMatchSection(); },
        error: function(err) {
          matchState = { loading: false, result: null, error: err?.error?.error || 'Match run failed.' };
          renderMatchSection();
        }
      });
    }

    // -- Toast ---------------------------------------------------------------
    function showToast(msg: string) {
      var t = document.getElementById('toastMsg');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(function() { t.classList.remove('show'); }, 4000);
    }

    // -- Wire global handlers ------------------------------------------------
    (window as any)._openCfg = openConfig;
    (window as any)._sync    = triggerSync;

    var matchBtn = document.getElementById('runMatchBtn');
    if (matchBtn) matchBtn.addEventListener('click', function() { runMatch(); });

    // Initial render
    renderAll();
  }
}
