// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { ApiService } from '../api.service';
import { EntityAccessService } from '../entity-access.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-exception-queue',
  standalone: true,
  imports: [],
  templateUrl: './exception-queue.html',
  styleUrl: './exception-queue.css',
  encapsulation: ViewEncapsulation.None
})
export class ExceptionQueueComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  private readonly access = inject(EntityAccessService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();
    const canProcess = this.access.hasAny("ap.process", "ar.process");
    ["bulkAction", "bulkOwner", "escalateBtn", "resolveBtn"].forEach((id) => {
      const element = document.getElementById(id) as HTMLElement | null;
      if (element) element.hidden = !canProcess;
    });

    var EXCEPTIONS = [];
    var selectedId = null;
    var selectedRows = {};
    var queryParams = new URLSearchParams(window.location.search);
    var activeEntityName = queryParams.get('entityName') || localStorage.getItem('lx_entity_name') || 'This Entity';
    var activeEntityId   = queryParams.get('entityId')   || localStorage.getItem('lx_entity_id')   || '';
    var tenantId         = queryParams.get('tenantId')   || localStorage.getItem('lx_tenant_id')   || '';

    document.getElementById('entityContext').textContent =
      'Entity scope: ' + activeEntityName + ' (' + activeEntityId + ')';
    var crumb = document.getElementById('entityCrumbName');
    if (crumb) crumb.textContent = activeEntityName;

    /* ── helpers ── */
    function initials(name) {
      return (name || '')
        .split(/\s+/).slice(0, 2)
        .map(function (w) { return w[0] || ''; }).join('').toUpperCase() || '??';
    }

    function formatAmount(value) {
      return '$' + Number(value).toLocaleString('en-US');
    }

    function formatSla(minutes) {
      var m = Number(minutes) || 0;
      var abs = Math.abs(m);
      var h = Math.floor(abs / 60);
      var min = abs % 60;
      return m < 0
        ? 'Breached by ' + h + 'h ' + min + 'm'
        : h + 'h ' + min + 'm remaining';
    }

    function slaState(exc) {
      var m = Number(exc.sla_minutes) || exc.minutes || 0;
      if (m < 0) return 'breached';
      if (m <= 120) return 'warning';
      return 'ok';
    }

    function statusLabel(s) {
      return s === 'in_progress' ? 'In progress'
        : s ? (s.charAt(0).toUpperCase() + s.slice(1)) : '';
    }

    /* ── normalize raw DB row to component shape ── */
    function normalize(row) {
      var d = row.data || {};
      return {
        id:        row.exception_key || row.id,
        dbId:      row.id,
        title:     row.title,
        ref:       row.invoice_ref || d.ref || '',
        severity:  row.severity,
        amount:    Number(row.amount_num) || 0,
        owner:     row.owner_name  || d.owner  || '',
        backup:    row.backup_name || d.backup || '',
        sla_minutes: Number(row.sla_minutes) || 0,
        status:    row.status,
        reason:    row.reason_code || d.reason || '',
        tags:      d.tags || [],
        timeline:  d.timeline || []
      };
    }

    /* ── KPI update ── */
    function updateKpis() {
      var open      = EXCEPTIONS.filter(function (e) { return e.status !== 'resolved'; });
      var breached  = open.filter(function (e) { return (e.sla_minutes || 0) < 0; });
      var atRisk    = open.filter(function (e) { return e.severity !== 'medium'; });
      var escalated = EXCEPTIONS.filter(function (e) { return e.status === 'escalated'; });
      var totalRisk = atRisk.reduce(function (s, e) { return s + e.amount; }, 0);
      document.getElementById('openCount').textContent     = open.length;
      document.getElementById('breachedCount').textContent = breached.length;
      document.getElementById('valueAtRisk').textContent   = formatAmount(totalRisk);
      document.getElementById('escalatedCount').textContent = escalated.length;
    }

    /* ── filter ── */
    function filtered() {
      var sev    = document.getElementById('severityFilter').value;
      var sla    = document.getElementById('slaFilter').value;
      var search = (document.getElementById('searchFilter').value || '').toLowerCase().trim();
      return EXCEPTIONS.filter(function (e) {
        var matchSearch = !search || [e.id, e.title, e.ref, e.reason]
          .join(' ').toLowerCase().indexOf(search) !== -1;
        return (!sev  || e.severity  === sev)
          &&   (!sla  || slaState(e) === sla)
          &&   matchSearch;
      });
    }

    /* ── render queue ── */
    function renderQueue() {
      updateKpis();
      var rows = filtered();
      var body = document.getElementById('queueBody');
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="9" style="color:#6f8299;text-align:center;padding:30px">'
          + (EXCEPTIONS.length ? 'No exceptions match the filters.' : 'No exceptions found for this entity.')
          + '</td></tr>';
        updateBulkBar();
        return;
      }
      body.innerHTML = rows.map(function (e) {
        var state = slaState(e);
        return '<tr class="' + (selectedId === e.id ? 'selected' : '') + '" data-id="' + e.id + '">'
          + '<td><input class="row-check" type="checkbox" data-id="' + e.id + '" '
          +   (selectedRows[e.id] ? 'checked' : '') + ' /></td>'
          + '<td>'
          +   '<div class="exception-id">' + e.id + '</div>'
          +   '<div class="exception-title">' + e.title + '</div>'
          +   '<div class="exception-sub">' + e.ref + (e.reason ? ' \xB7 ' + e.reason : '') + '</div>'
          + '</td>'
          + '<td><span class="pill ' + e.severity + '">' + e.severity + '</span></td>'
          + '<td><strong>' + activeEntityName + '</strong></td>'
          + '<td><strong>' + formatAmount(e.amount) + '</strong></td>'
          + '<td><div class="owner"><span class="avatar">' + initials(e.owner) + '</span>' + (e.owner || '—') + '</div></td>'
          + '<td><span class="sla ' + state + '">' + formatSla(e.sla_minutes) + '</span></td>'
          + '<td><span class="pill ' + (e.status === 'escalated' ? 'escalated' : e.status === 'open' ? 'open' : 'progress') + '">'
          +   statusLabel(e.status) + '</span></td>'
          + '<td><button class="row-action" type="button" data-open="' + e.id + '">Open</button></td>'
          + '</tr>';
      }).join('');
      updateBulkBar();
    }

    function updateBulkBar() {
      var count = Object.keys(selectedRows).filter(function (k) { return selectedRows[k]; }).length;
      document.getElementById('bulkBar').classList.toggle('visible', count > 0);
      document.getElementById('selectedCount').textContent = count + ' selected';
    }

    /* ── detail panel ── */
    function renderDetail(e) {
      if (!e) {
        document.getElementById('detailEmpty').style.display = 'flex';
        document.getElementById('detailBody').classList.remove('visible');
        return;
      }
      document.getElementById('detailEmpty').style.display = 'none';
      document.getElementById('detailBody').classList.add('visible');
      document.getElementById('detailId').textContent    = e.id;
      document.getElementById('detailTitle').textContent = e.title;
      document.getElementById('detailMeta').innerHTML =
        (e.ref || '') + '<br>' + activeEntityName
        + (e.amount ? ' \xB7 ' + formatAmount(e.amount) : '');
      document.getElementById('detailSeverity').textContent  = e.severity || '';
      document.getElementById('detailSeverity').className    = 'pill ' + (e.severity || '');
      var state = slaState(e);
      document.getElementById('detailSla').textContent = formatSla(e.sla_minutes);
      document.getElementById('detailSla').className   = 'sla-big ' + state;
      document.getElementById('detailSlaState').textContent = state === 'breached'
        ? 'Breach alert active' : state === 'warning' ? 'Due soon' : 'Within SLA';
      document.getElementById('detailSlaState').className = 'pill '
        + (state === 'breached' ? 'breached' : state === 'warning' ? 'high' : 'progress');
      document.getElementById('detailDue').textContent = state === 'breached'
        ? 'Escalate now or resolve with a documented override.'
        : 'Auto-escalation runs when the configured SLA clock expires.';
      document.getElementById('detailSlaTrack').className = state === 'breached' ? 'breach' : '';
      // populate owner/backup selects
      populateOwnerSelect('ownerSelect',  e.owner,  e.owner);
      populateOwnerSelect('backupSelect', e.backup, e.backup);
      // tags
      document.querySelectorAll('#rootCauseTags .tag').forEach(function (tag) {
        tag.classList.toggle('active', e.tags.indexOf(tag.getAttribute('data-tag')) !== -1);
      });
      // timeline
      document.getElementById('timeline').innerHTML = e.timeline.map(function (item) {
        return '<div class="timeline-item"><strong>' + item[0] + '</strong> ' + item[1] + '</div>';
      }).join('');
    }

    function populateOwnerSelect(selectId, currentOwner, selected) {
      var sel = document.getElementById(selectId);
      // collect all known owners from EXCEPTIONS plus the current one
      var owners = [];
      EXCEPTIONS.forEach(function (e) {
        if (e.owner  && owners.indexOf(e.owner)  === -1) owners.push(e.owner);
        if (e.backup && owners.indexOf(e.backup) === -1) owners.push(e.backup);
      });
      if (currentOwner && owners.indexOf(currentOwner) === -1) owners.push(currentOwner);
      sel.innerHTML = owners.map(function (o) {
        return '<option' + (o === selected ? ' selected' : '') + '>' + o + '</option>';
      }).join('');
    }

    function selectException(id) {
      selectedId = id;
      var e = EXCEPTIONS.find(function (x) { return x.id === id; });
      renderQueue();
      renderDetail(e || null);
    }

    function showToast(msg) {
      var toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(function () { toast.classList.remove('show'); }, 2600);
    }

    function openModal(id)  { document.getElementById(id).classList.add('open'); }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }

    /* ── event listeners ── */
    document.getElementById('queueBody').addEventListener('click', function (ev) {
      var openId = ev.target.getAttribute('data-open');
      if (openId) { selectException(openId); return; }
      var row = ev.target.closest('tr');
      if (row && !ev.target.classList.contains('row-check')) selectException(row.getAttribute('data-id'));
    });

    document.getElementById('queueBody').addEventListener('change', function (ev) {
      if (!ev.target.classList.contains('row-check')) return;
      selectedRows[ev.target.getAttribute('data-id')] = ev.target.checked;
      updateBulkBar();
    });

    document.getElementById('selectAll').addEventListener('change', function (ev) {
      filtered().forEach(function (e) { selectedRows[e.id] = ev.target.checked; });
      renderQueue();
    });

    document.getElementById('bulkAction').addEventListener('change', function (ev) {
      document.getElementById('bulkOwner').hidden = ev.target.value !== 'assign';
    });

    document.getElementById('applyBulkBtn').addEventListener('click', function () {
      var action = document.getElementById('bulkAction').value;
      var ids = Object.keys(selectedRows).filter(function (k) { return selectedRows[k]; });
      if (!action || !ids.length) return showToast('Choose a bulk action first.');
      var apiAction = action === 'close' ? 'resolve' : action;
      if (apiAction === 'resolve' || apiAction === 'escalate' || apiAction === 'assign') {
        apiRef.bulkExceptionAction(
          tenantId,
          activeEntityId,
          ids,
          apiAction,
          action === 'assign' ? document.getElementById('bulkOwner').value : undefined
        ).subscribe({
          next: function () {
            selectedRows = {};
            fetchExceptions(tenantId);
            showToast(ids.length + ' exception' + (ids.length > 1 ? 's' : '') + ' updated.');
          },
          error: function () { showToast('Unable to update selected exceptions.'); }
        });
        return;
      }
      ids.forEach(function (id) {
        var item = EXCEPTIONS.find(function (e) { return e.id === id; });
        if (!item) return;
        if (action === 'assign')  item.owner = document.getElementById('bulkOwner').value;
        if (action === 'escalate') item.status = 'escalated';
        if (action === 'close')    item.status = 'resolved';
        if (action === 'tag' && item.tags.indexOf('Repeated mismatch') === -1) item.tags.push('Repeated mismatch');
      });
      selectedRows = {};
      renderQueue();
      if (selectedId) renderDetail(EXCEPTIONS.find(function (e) { return e.id === selectedId; }) || null);
      showToast(ids.length + ' exception' + (ids.length > 1 ? 's' : '') + ' updated.');
    });

    document.getElementById('clearSelectionBtn').addEventListener('click', function () {
      selectedRows = {};
      document.getElementById('selectAll').checked = false;
      renderQueue();
    });

    document.getElementById('applyFiltersBtn').addEventListener('click', renderQueue);
    document.getElementById('clearFiltersBtn').addEventListener('click', function () {
      ['severityFilter', 'slaFilter', 'searchFilter'].forEach(function (id) {
        document.getElementById(id).value = '';
      });
      renderQueue();
    });

    document.getElementById('refreshBtn').addEventListener('click', function () {
      loadFromApi();
      showToast('Exception queue refreshed.');
    });

    document.getElementById('slaRulesBtn').addEventListener('click', function () { openModal('slaModal'); });
    document.getElementById('newExceptionBtn').addEventListener('click', function () {
      showToast('Create Exception form can be connected to the 3-way match workbench.');
    });
    document.getElementById('saveRulesBtn').addEventListener('click', function () {
      closeModal('slaModal');
      showToast('SLA and escalation rules saved.');
    });

    document.getElementById('saveOwnershipBtn').addEventListener('click', function () {
      if (!selectedId) return;
      var item = EXCEPTIONS.find(function (e) { return e.id === selectedId; });
      if (!item) return;
      item.owner  = document.getElementById('ownerSelect').value;
      item.backup = document.getElementById('backupSelect').value;
      renderQueue();
      renderDetail(item);
      showToast('Ownership updated.');
    });

    document.getElementById('rootCauseTags').addEventListener('click', function (ev) {
      if (!ev.target.classList.contains('tag') || !selectedId) return;
      var item = EXCEPTIONS.find(function (e) { return e.id === selectedId; });
      if (!item) return;
      var tag = ev.target.getAttribute('data-tag');
      var idx = item.tags.indexOf(tag);
      if (idx === -1) item.tags.push(tag); else item.tags.splice(idx, 1);
      renderDetail(item);
      showToast('Root-cause tags updated.');
    });

    document.getElementById('escalateBtn').addEventListener('click', function () {
      if (!selectedId) return;
      openModal('escalationModal');
    });

    var apiRef = this.api;

    document.getElementById('submitEscalationBtn').addEventListener('click', function () {
      var item = EXCEPTIONS.find(function (e) { return e.id === selectedId; });
      if (!item) return;
      var reason = document.getElementById('escalationReason').value.trim();
      if (!reason) return showToast('Add an escalation reason before submitting.');
      var level = document.getElementById('approvalLevel').value;
      apiRef.escalateException(tenantId, activeEntityId, item.dbId || item.id, reason).subscribe({
        next: function () {
          item.status = 'escalated';
          item.timeline.push(['Just now', 'Escalated to ' + level + ' via approval matrix']);
          closeModal('escalationModal');
          document.getElementById('escalationReason').value = '';
          renderQueue();
          renderDetail(item);
          showToast(item.id + ' escalated to the approval matrix.');
        },
        error: function (err) {
          showToast('Escalation failed: ' + ((err && err.error && err.error.error) || 'Server error'));
        }
      });
    });

    document.getElementById('resolveBtn').addEventListener('click', function () {
      var item = EXCEPTIONS.find(function (e) { return e.id === selectedId; });
      if (!item) return;
      apiRef.resolveException(tenantId, activeEntityId, item.dbId || item.id, '').subscribe({
        next: function () {
          item.status = 'resolved';
          item.timeline.push(['Just now', 'Marked resolved']);
          renderQueue();
          renderDetail(item);
          showToast(item.id + ' marked resolved.');
        },
        error: function (err) {
          showToast('Resolve failed: ' + ((err && err.error && err.error.error) || 'Server error'));
        }
      });
    });

    document.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeModal(btn.getAttribute('data-close')); });
    });
    document.querySelectorAll('.modal-backdrop').forEach(function (backdrop) {
      backdrop.addEventListener('click', function (ev) {
        if (ev.target === backdrop) closeModal(backdrop.id);
      });
    });

    /* ── load from API ── */
    function loadFromApi() {
      // If tenantId is in URL, use it directly
      if (tenantId) {
        fetchExceptions(tenantId);
      } else {
        apiRef.getTenant().subscribe({
          next: function (res) {
            var t = res.data && res.data[0];
            if (t) { tenantId = t.id; fetchExceptions(tenantId); }
          },
          error: function () { renderQueue(); }
        });
      }
    }

    function fetchExceptions(tid) {
      apiRef.getEntityExceptions(tid, activeEntityId).subscribe({
        next: function (res) {
          if (res.data && res.data.length) {
            EXCEPTIONS = res.data.map(normalize);
          } else {
            EXCEPTIONS = [];
          }
          renderQueue();
        },
        error: function () { renderQueue(); }
      });
    }

    /* ── initial render (empty) then load ── */
    renderQueue();
    loadFromApi();
  }
}
