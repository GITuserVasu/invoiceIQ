// @ts-nocheck
import { AfterViewInit, Component, inject, ViewEncapsulation } from '@angular/core';
import { ApiService } from '../api.service';
import { initTopBar } from '../shared/topbar';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [],
  templateUrl: './user-management.html',
  styleUrl: './user-management.css',
  encapsulation: ViewEncapsulation.None
})
export class UserManagementComponent implements AfterViewInit {
  private readonly api = inject(ApiService);
  tenantName = environment.TENANTNAME;

  ngAfterViewInit(): void {
    initTopBar();

    /* ── Avatar colors ─────────────────────────────────── */
    var COLORS = ["#0d7c97","#15795f","#bc741f","#6b4fad","#b74444","#2a72a8"];
    function avatarColor(name) { var s=0; for(var i=0;i<name.length;i++) s+=name.charCodeAt(i); return COLORS[s%COLORS.length]; }
    function initials(name) { return name.split(/\s+/).slice(0,2).map(function(w){return w[0]||"";}).join("").toUpperCase(); }

    /* ── Role permission matrix ─────────────────────── */
    var ROLE_PERMS = {
      "Entity Admin":  { "User Management":"Allow", "Transactions":"Allow", "Approval Queue":"Allow", "Exception Override":"Allow", "Extraction":"Allow", "Classification":"Allow", "Audit Log":"Allow" },
      "Finance Controller": { "User Management":"Deny", "Transactions":"Allow", "Approval Queue":"Allow", "Exception Override":"Allow", "Extraction":"Deny", "Classification":"Deny", "Audit Log":"Allow" },
      "AR Manager":    { "User Management":"Deny", "Transactions":"Allow", "Approval Queue":"Allow", "Exception Override":"Limited", "Extraction":"Deny", "Classification":"Deny", "Audit Log":"Allow" },
      "AP Manager":    { "User Management":"Deny", "Transactions":"Allow", "Approval Queue":"Allow", "Exception Override":"Limited", "Extraction":"Limited", "Classification":"Deny", "Audit Log":"Limited" },
      "Viewer":        { "User Management":"Deny", "Transactions":"View", "Approval Queue":"View", "Exception Override":"View", "Extraction":"View", "Classification":"Deny", "Audit Log":"View" },
      "Collector":     { "User Management":"Deny", "Transactions":"Limited", "Approval Queue":"Limited", "Exception Override":"Deny", "Extraction":"Allow", "Classification":"Allow", "Audit Log":"Deny" },
    };
    var ROLE_KEY_BY_LABEL = {
      "Entity Admin": "entity_admin",
      "Client Admin": "entity_admin",
      "Finance Controller": "finance_controller",
      "AP Manager": "ap_manager",
      "AR Manager": "ar_manager",
      "Viewer": "viewer"
    };

    /* ── User data ──────────────────────────────────────── */
    var USERS = [
      { id:"U-001", name:"Asha Menon",    email:"asha.menon@northline.com",    dept:"Finance",    role:"Client Admin",  level:"Level 4 — Controller", status:"active",  lastLogin:"17-Jul-2026 09:42", phone:"+91 98201 11234", scope:"This Entity Only",  restriction:"No Restriction" },
      { id:"U-002", name:"Vikram Kumar",  email:"vikram.kumar@northline.com",  dept:"Finance",    role:"AR Manager",    level:"Level 3 — Manager",    status:"active",  lastLogin:"17-Jul-2026 10:08", phone:"+91 99001 22345", scope:"This Entity Only",  restriction:"No Restriction" },
      { id:"U-003", name:"Fatima Khan",   email:"fatima.khan@northline.com",   dept:"Operations", role:"AP Manager",    level:"Level 3 — Manager",    status:"active",  lastLogin:"16-Jul-2026 18:34", phone:"+91 97800 33456", scope:"This Entity Only",  restriction:"No Restriction" },
      { id:"U-004", name:"Akash Iyer",    email:"akash.iyer@northline.com",    dept:"Finance",    role:"Collector",     level:"Level 1 — Collector",  status:"pending", lastLogin:"Never",             phone:"+91 96600 44567", scope:"This Entity Only",  restriction:"No Restriction" },
      { id:"U-005", name:"Priya Nair",    email:"priya.nair@northline.com",    dept:"Operations", role:"Collector",     level:"Level 1 — Collector",  status:"active",  lastLogin:"17-Jul-2026 08:55", phone:"+91 95400 55678", scope:"This Entity Only",  restriction:"Read Only After 8 PM" },
      { id:"U-006", name:"Ravi Shankar",  email:"ravi.shankar@northline.com",  dept:"Finance",    role:"AR Manager",    level:"Level 2 — Team Lead",  status:"active",  lastLogin:"15-Jul-2026 11:22", phone:"+91 94200 66789", scope:"This Entity Only",  restriction:"No Restriction" },
      { id:"U-007", name:"Meera Joshi",   email:"meera.joshi@northline.com",   dept:"Compliance", role:"Viewer",        level:"Level 1 — Collector",  status:"inactive",lastLogin:"10-Jul-2026 14:00", phone:"+91 93100 77890", scope:"This Entity Only",  restriction:"View Only — No Edit" },
      { id:"U-008", name:"Sanjay Gupta",  email:"sanjay.gupta@northline.com",  dept:"IT",         role:"Client Admin",  level:"Level 4 — Controller", status:"active",  lastLogin:"16-Jul-2026 16:48", phone:"+91 92000 88901", scope:"All Entities",      restriction:"No Restriction" },
    ];

    var displayedUsers = USERS.slice();
    var selectedIdx = -1;
    var currentEditUser = null;  /* null = Add mode; user object = Edit mode */
    function userBackendId(user) { return user.backendId || (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(user.id) ? user.id : ""); }

    /* ── Render table ─────────────────────────────────── */
    function renderTable(data) {
      var tbody = document.getElementById("userTbody");
      document.getElementById("paginationInfo").textContent = "Showing " + data.length + " of " + USERS.length + " users";
      document.getElementById("userCountBadge").textContent = USERS.length + " users";
      document.getElementById("kpiTotal").textContent = String(USERS.length);
      document.getElementById("kpiActive").textContent  = String(USERS.filter(function(u){ return u.status==="active"; }).length);
      document.getElementById("kpiPending").textContent = String(USERS.filter(function(u){ return u.status==="pending"; }).length);

      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9aafc4;padding:24px">No users match the current filters.</td></tr>';
        return;
      }

      tbody.innerHTML = data.map(function(u, i) {
        var col = avatarColor(u.name);
        return '<tr data-idx="' + i + '" class="' + (selectedIdx === i ? "selected-row" : "") + '">'
          + '<td><div class="u-cell">'
          + '<div class="u-avatar" style="background:' + col + '">' + initials(u.name) + '</div>'
          + '<div><div class="u-name">' + u.name + '</div><div class="u-email">' + u.email + '</div></div>'
          + '</div></td>'
          + '<td><span class="role-tag">' + u.role + '</span></td>'
          + '<td style="font-size:11px;color:#5e728b">' + u.dept + '</td>'
          + '<td><span class="lvl-tag">' + u.level.split(" \u2014 ")[0] + '</span></td>'
          + '<td><span class="status-tag ' + u.status + '">' + u.status.charAt(0).toUpperCase()+u.status.slice(1) + '</span></td>'
          + '<td style="font-size:11px;white-space:nowrap">' + u.lastLogin + '</td>'
          + '<td><button class="btn sm" type="button" data-edit="' + i + '">Edit</button></td>'
          + '</tr>';
      }).join("");

      tbody.querySelectorAll("tr").forEach(function(tr) {
        tr.addEventListener("click", function(e) {
          if (e.target.closest("button")) return;
          var idx = parseInt(tr.getAttribute("data-idx"), 10);
          selectedIdx = idx;
          renderTable(displayedUsers);
          showUserDetail(data[idx]);
        });
      });

      tbody.querySelectorAll("[data-edit]").forEach(function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          var idx = parseInt(btn.getAttribute("data-edit"), 10);
          openEditModal(data[idx]);
        });
      });
    }

    /* ── Show user detail sidebar ─────────────────────── */
    function showUserDetail(u) {
      var col   = avatarColor(u.name);
      var perms = ROLE_PERMS[u.role] || {};

      var permHtml = Object.keys(perms).map(function(menu) {
        var v = perms[menu].toLowerCase();
        return '<div class="perm-row"><span class="perm-label">' + menu + '</span><span class="perm-val ' + v + '">' + perms[menu] + '</span></div>';
      }).join("");

      document.getElementById("userSidebar").innerHTML =
        '<div class="user-profile-card">'
        + '<div class="profile-avatar" style="background:' + col + '">' + initials(u.name) + '</div>'
        + '<div class="profile-name">' + u.name + '</div>'
        + '<div class="profile-role">' + u.role + ' &mdash; ' + u.dept + '</div>'
        + '<div class="profile-status"><span class="status-tag ' + u.status + '">' + u.status.charAt(0).toUpperCase()+u.status.slice(1) + '</span></div>'
        + '</div>'

        + '<div class="detail-section">'
        + '<h4>Account Details</h4>'
        + '<div class="detail-row"><span class="detail-label">User ID</span><span class="detail-val">' + u.id + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Email</span><span class="detail-val">' + u.email + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-val">' + u.phone + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Department</span><span class="detail-val">' + u.dept + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Last Login</span><span class="detail-val">' + u.lastLogin + '</span></div>'
        + '</div>'

        + '<div class="detail-section">'
        + '<h4>Access Config</h4>'
        + '<div class="detail-row"><span class="detail-label">Role</span><span class="detail-val">' + u.role + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Appr. Level</span><span class="detail-val">' + u.level + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Scope</span><span class="detail-val">' + u.scope + '</span></div>'
        + '<div class="detail-row"><span class="detail-label">Restriction</span><span class="detail-val">' + u.restriction + '</span></div>'
        + '</div>'

        + '<div class="detail-section">'
        + '<h4>Permissions for ' + u.role + '</h4>'
        + '<div class="perm-grid">' + permHtml + '</div>'
        + '</div>'

        + '<div class="sidebar-actions">'
        + '<button class="btn sm" type="button" onclick="openEditModal(' + JSON.stringify(u).replace(/"/g,"&quot;") + ')">Edit User</button>'
        + '<button class="btn sm danger" type="button" id="sidebarDeactivateBtn">' + (u.status === "active" ? "Deactivate" : "Activate") + '</button>'
        + '<button class="btn sm danger" type="button" id="sidebarDeleteUserBtn">Remove User</button>'
        + '</div>';

      /* Wire Deactivate / Activate button */
      var deactivateBtn = document.getElementById("sidebarDeactivateBtn");
      if (deactivateBtn) {
        deactivateBtn.addEventListener("click", function() {
          var newStatus = u.status === "active" ? "inactive" : "active";
          u.status = newStatus;
          renderTable(displayedUsers);
          showUserDetail(u);  /* refresh sidebar */

          /* Persist to API */
          apiRef.getTenant().subscribe({
            next: function(tenantResponse) {
              var tenant = tenantResponse.data && tenantResponse.data[0];
              var backendId = userBackendId(u);
              if (!tenant || !backendId) return;
              apiRef.updateEntityUser(tenant.id, entityId, backendId, { status: newStatus }).subscribe({
                next: function() {},
                error: function() {}
              });
            },
            error: function() {}
          });
        });
      }

      /* Wire Remove User button */
      var deleteUserBtn = document.getElementById("sidebarDeleteUserBtn");
      if (deleteUserBtn) {
        deleteUserBtn.addEventListener("click", function() {
          if (!confirm("Remove " + u.name + " from this entity? This cannot be undone.")) return;
          var currentTenantId = localStorage.getItem("lx_tenant_id") || "";
          apiRef.getTenant().subscribe({
            next: function(tr) {
              var tenant = tr.data && tr.data[0];
              var tid = currentTenantId || (tenant && tenant.id) || "";
              var backendId = userBackendId(u);
              if (!tid || !backendId) return;
              apiRef.deleteEntityUser(tid, entityId, backendId).subscribe({
                next: function() {
                  USERS = USERS.filter(function(x) { return x.id !== u.id; });
                  displayedUsers = USERS.slice();
                  selectedIdx = -1;
                  renderTable(displayedUsers);
                  var sidebar = document.getElementById("userSidebar");
                  if (sidebar) sidebar.innerHTML = "<p style=\"padding:20px;color:#888\">User removed.</p>";
                  alert(u.name + " removed from entity.");
                },
                error: function(err) { alert("Remove failed: " + ((err && err.error && err.error.error) || "Server error")); }
              });
            }
          });
        });
      }
    }

    /* ── Filters ──────────────────────────────────────── */
    function applyFilters() {
      var fSearch = document.getElementById("filterSearch").value.toLowerCase();
      var fRole   = document.getElementById("filterRole").value;
      var fLevel  = document.getElementById("filterLevel").value;
      var fStatus = document.getElementById("filterStatus").value;
      var fDept   = document.getElementById("filterDept").value;

      displayedUsers = USERS.filter(function(u) {
        if (fSearch && u.name.toLowerCase().indexOf(fSearch) < 0 && u.email.toLowerCase().indexOf(fSearch) < 0) return false;
        if (fRole   && u.role !== fRole)   return false;
        if (fLevel  && u.level.indexOf(fLevel) < 0) return false;
        if (fStatus && u.status !== fStatus.toLowerCase()) return false;
        if (fDept   && u.dept !== fDept)   return false;
        return true;
      });
      selectedIdx = -1;
      renderTable(displayedUsers);
    }

    ["filterSearch","filterRole","filterLevel","filterStatus","filterDept"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.addEventListener("change", applyFilters); el.addEventListener("input", applyFilters); }
    });

    /* ── Modal open/close ─────────────────────────────── */
    function openAddModal() {
      currentEditUser = null;
      document.getElementById("modalTitle").textContent = "Add New User";
      document.getElementById("fName").value = "";
      document.getElementById("fEmail").value = "";
      document.getElementById("fPhone").value = "";
      document.getElementById("fDept").value = "";
      document.getElementById("fRole").value = "";
      document.getElementById("fLevel").value = "";
      document.getElementById("fScope").value = "This Entity Only";
      document.getElementById("fRestriction").value = "No Restriction";
      document.getElementById("fNotes").value = "";
      document.getElementById("userModal").classList.remove("hidden");
    }

    function openEditModal(u) {
      currentEditUser = u;
      document.getElementById("modalTitle").textContent = "Edit User \u2014 " + u.name;
      document.getElementById("fName").value = u.name || "";
      document.getElementById("fEmail").value = u.email || "";
      document.getElementById("fPhone").value = u.phone || "";
      document.getElementById("fDept").value = u.dept || "";
      document.getElementById("fRole").value = u.role || "";
      document.getElementById("fLevel").value = u.level || "";
      document.getElementById("fScope").value = u.scope || "This Entity Only";
      document.getElementById("fRestriction").value = u.restriction || "No Restriction";
      document.getElementById("fNotes").value = "";
      document.getElementById("userModal").classList.remove("hidden");
    }

    function closeModal() {
      document.getElementById("userModal").classList.add("hidden");
    }

    document.getElementById("addUserBtn").addEventListener("click", openAddModal);
    document.getElementById("closeModal").addEventListener("click", closeModal);
    document.getElementById("cancelModal").addEventListener("click", closeModal);
    document.getElementById("userModal").addEventListener("click", function(e) {
      if (e.target === this) closeModal();
    });

    document.getElementById("saveUserBtn").addEventListener("click", function() {
      var name  = document.getElementById("fName").value.trim();
      var email = document.getElementById("fEmail").value.trim();
      var role  = document.getElementById("fRole").value;
      var level = document.getElementById("fLevel").value;
      var dept  = document.getElementById("fDept").value.trim();
      var phone = document.getElementById("fPhone").value.trim();

      if (!name || !email || !role || !level) {
        alert("Please fill in Name, Email, Role, and Approval Level before saving.");
        return;
      }

      if (currentEditUser) {
        /* ── Edit existing user ─────────────────────────────── */
        var editedUser = currentEditUser;
        editedUser.name  = name;
        editedUser.phone = phone || editedUser.phone;
        editedUser.dept  = dept  || editedUser.dept;
        editedUser.role  = role;
        editedUser.level = level;
        editedUser.scope        = document.getElementById("fScope").value;
        editedUser.restriction  = document.getElementById("fRestriction").value;

        /* Call API to persist edit */
        apiRef.getTenant().subscribe({
          next: function(tenantResponse) {
            var tenant = tenantResponse.data && tenantResponse.data[0];
            var backendId = userBackendId(editedUser);
            if (!tenant || !backendId) return;
            apiRef.updateEntityUser(tenant.id, entityId, backendId, {
              roleKey:    ROLE_KEY_BY_LABEL[role] || role,
              department: dept || undefined,
              phone:      phone || undefined
            }).subscribe({
              next: function() {},
              error: function() {}
            });
          },
          error: function() {}
        });

        closeModal();
        renderTable(displayedUsers);
      } else {
        /* ── Add new user ─────────────────────────────────── */
        var newUser = {
          id: "U-00" + (USERS.length + 1),
          name: name,
          email: email,
          phone: phone || "\u2014",
          dept: dept || "\u2014",
          role: role,
          level: level,
          status: "pending",
          lastLogin: "Never",
          scope: document.getElementById("fScope").value,
          restriction: document.getElementById("fRestriction").value
        };

        /* Call API to create user */
        apiRef.getTenant().subscribe({
          next: function(tenantResponse) {
            var tenant = tenantResponse.data && tenantResponse.data[0];
            if (!tenant) return;
            apiRef.createEntityUser(tenant.id, entityId, {
              email:      email,
              fullName:   name,
              phone:      phone || undefined,
              department: dept  || undefined,
              roleKey:    ROLE_KEY_BY_LABEL[role] || role
            }).subscribe({
              next: function(res) {
                /* Update local id if backend returned one */
                if (res && res.userId) newUser.id = res.userId;
              },
              error: function() {}
            });
          },
          error: function() {}
        });

        USERS.push(newUser);
        displayedUsers = USERS.slice();
        closeModal();
        renderTable(displayedUsers);
      }
    });

    /* ── URL params ─────────────────────────────────────── */
    var params     = new URLSearchParams(window.location.search);
    var entityName = params.get("entityName") || "";
    var entityId   = params.get("entityId")   || "";

    if (entityName) {
      document.getElementById("entityCrumbName").textContent = entityName;
      document.getElementById("ebName").textContent          = entityName;
      document.getElementById("heroTitle").textContent       = entityName + " \u2014 User List";
      document.getElementById("heroEntityPill").textContent  = "Entity: " + entityName;
      document.getElementById("ebSub").textContent           = "User management for " + entityName + (entityId ? " (" + entityId + ")" : "");
      document.getElementById("ebIcon").textContent          = entityName.split(/[\s-]+/).slice(0,2).map(function(w){return w[0]||"";}).join("").toUpperCase() || "EN";
      document.getElementById("panelSubtitle").textContent   = "Users with access to " + entityName + " \u2014 click any row to view details";
    }

    if (entityId) {
      document.getElementById("ebEntityId").textContent = "Entity ID: " + entityId;
    }

    /* Forward entity context to nav links */
    var entityQS = (entityName || entityId)
      ? "?entityId=" + encodeURIComponent(entityId) + "&entityName=" + encodeURIComponent(entityName)
      : "";

    ["navDashboard","navAudit","navClassify","navExtract","navExceptions","backToDashboardLink"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el && entityQS) {
        var base = el.getAttribute("href").split("?")[0];
        el.setAttribute("href", base + entityQS);
      }
    });

    /* ── Normalize backend user row to component user shape ── */
    /* Works with both getEntityUsers (role_key, membership_status) and getEntityMembers */
    function normalizeEntityUser(row) {
      var roles   = Array.isArray(row.roles) ? row.roles : [];
      var topRole = roles.length ? roles[0] : {};
      var name    = row.full_name || row.name || (row.email ? row.email.split('@')[0] : 'Unknown');
      var roleLabel = row.role_label || topRole.label || row.role_key || 'Viewer';
      return {
        backendId:   row.user_id || row.id || '',
        id:          'U-' + (row.user_id || row.id || '').slice(0, 6).toUpperCase(),
        name:        name,
        email:       row.email,
        phone:       row.phone || '\u2014',
        dept:        row.department || '\u2014',
        role:        roleLabel,
        level:       'Level 1 — Collector',
        status:      row.membership_status === 'active'  ? 'active'
                   : row.membership_status === 'invited' ? 'pending' : 'inactive',
        lastLogin:   row.last_login_at
                   ? new Date(row.last_login_at).toLocaleString('en-IN', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
                   : 'Never',
        scope:       'This Entity Only',
        restriction: 'No Restriction'
      };
    }

    /* ── Init with fallback, then replace with real API data ── */
    renderTable(USERS);

    var apiRef = this.api;
    apiRef.getTenant().subscribe({
      next: function (tenantResponse) {
        var tenant = tenantResponse.data && tenantResponse.data[0];
        if (!tenant) return;
        /* Use getEntityUsers — returns role_key + membership_status from joined query */
        apiRef.getEntityUsers(tenant.id, entityId).subscribe({
          next: function (response) {
            if (response.data) {
              USERS = response.data.map(normalizeEntityUser);
              displayedUsers = USERS.slice();
              selectedIdx = -1;
              renderTable(displayedUsers);
            }
          },
          error: function () {
            /* Fallback to getEntityMembers if /users endpoint not available */
            apiRef.getEntityMembers(tenant.id, entityId).subscribe({
              next: function (response) {
                if (response.data) {
                  USERS = response.data.map(normalizeEntityUser);
                  displayedUsers = USERS.slice();
                  selectedIdx = -1;
                  renderTable(displayedUsers);
                }
              },
              error: function () {}
            });
          }
        });
      },
      error: function () {}
    });
  }
}
