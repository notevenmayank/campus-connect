/**
 * CampusConnect — Complete Client Logic
 * Interacts directly with C++ REST API (server.cpp)
 */
const API = (location.hostname === "localhost" && location.port && location.port !== "8080")
  ? "http://localhost:8080/api"
  : "/api";

// State
let metaData = { slots: [], categories: [], roles: [], venues: [], nextId: "" };
let allResources = [];
let isAdminAuthenticated = localStorage.getItem("cc_admin_authenticated") === "true" || sessionStorage.getItem("cc_admin_authenticated") === "true";
let isMapEditMode = false;
let currentProfile = { name: "Mayank", role: isAdminAuthenticated ? "Administrator" : "Student" };
const ADMIN_PASSCODE = "admin123";
const RANDOM_NAMES = ["Mayank", "Aarav", "Priya", "Rohan", "Ananya", "Ishaan", "Sneha", "Vikram", "Neha", "Aditya", "Kabir", "Diya", "Tanvi", "Arjun"];
let selectedSlotData = null; // { resId, date, slot, status, holder, waitlistCount }
let lastRoutePath = [];
let graphData = { nodes: [], edges: [] };

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
  initProfile();
  initNavigation();
  initEventListeners();
  loadMeta().then(() => {
    refreshAll();
    handleHashChange();
  });

  // Polling intervals
  scheduleNextHealthCheck(100);

  // Auto-show Authentication window when entering app or if not logged in
  const urlParams = new URLSearchParams(window.location.search);
  const forceAuth = urlParams.get("auth") === "1" || urlParams.get("login") === "1";
  const isLoggedIn = sessionStorage.getItem("cc_logged_in") === "true";
  if (forceAuth || !isLoggedIn) {
    setTimeout(openAuthModal, 150);
  }
});

/* =====================================================================
   TOAST NOTIFICATIONS
   ===================================================================== */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "&times;";
  closeBtn.style.background = "none";
  closeBtn.style.border = "none";
  closeBtn.style.color = "var(--bone-dim)";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "16px";
  closeBtn.style.marginLeft = "8px";
  closeBtn.onclick = () => toast.remove();
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

/* =====================================================================
   HEALTH STATUS (Top Bar) & COLD-START RECOVERY
   ===================================================================== */
let serverIsOnline = false;
let consecutiveHealthFailures = 0;
let healthTimer = null;

async function checkHealth() {
  const dot = document.getElementById("statusDot");
  const text = document.getElementById("healthText");
  if (!dot || !text) return false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${API}/health`, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeoutId);
    const data = await res.json();

    if (res.ok && data.ok) {
      const wasOffline = !serverIsOnline && consecutiveHealthFailures > 0;
      serverIsOnline = true;
      consecutiveHealthFailures = 0;
      dot.className = "status-dot";
      text.textContent = "Server online";

      // If waking up from cold start or brief disconnection, reload views
      if (wasOffline) {
        showToast("Connected to server!", "success");
        handleHashChange();
      }
      scheduleNextHealthCheck(10000);
      return true;
    } else {
      throw new Error("Health check non-ok");
    }
  } catch (err) {
    serverIsOnline = false;
    consecutiveHealthFailures++;
    if (consecutiveHealthFailures <= 6) {
      dot.className = "status-dot waking";
      text.textContent = "Waking server...";
    } else {
      dot.className = "status-dot offline";
      text.textContent = "Server offline";
    }
    // Poll more rapidly while waking up so user gets instant response
    scheduleNextHealthCheck(2500);
    return false;
  }
}

function scheduleNextHealthCheck(delay) {
  if (healthTimer) clearTimeout(healthTimer);
  healthTimer = setTimeout(checkHealth, delay);
}

/* =====================================================================
   USER PROFILE & AUTHENTICATION
   ===================================================================== */
function initProfile() {
  const saved = localStorage.getItem("cc_user_profile");
  if (saved) {
    try {
      currentProfile = JSON.parse(saved);
      if (!currentProfile.name || currentProfile.name.toLowerCase() === "alex") {
        currentProfile.name = "Mayank";
      }
    } catch {}
  }
  if (currentProfile.role === "Administrator" && !isAdminAuthenticated) {
    currentProfile.role = "Student";
  } else if (isAdminAuthenticated) {
    currentProfile.role = "Administrator";
  }
  updateProfileDisplay();
  updateAdminAuthUI();
}

function randomizeStudentName() {
  const available = RANDOM_NAMES.filter(n => n.toLowerCase() !== (currentProfile.name || "").toLowerCase());
  const picked = available[Math.floor(Math.random() * available.length)] || "Mayank";
  const nameInput = document.getElementById("profileNameInput");
  if (nameInput) nameInput.value = picked;
  return picked;
}

function updateAdminAuthUI() {
  const lockedState = document.getElementById("adminLockedState");
  const unlockedState = document.getElementById("adminUnlockedState");
  const passcodeField = document.getElementById("profileAdminPasscode");
  if (lockedState && unlockedState) {
    if (isAdminAuthenticated) {
      lockedState.style.display = "none";
      unlockedState.style.display = "block";
    } else {
      lockedState.style.display = "block";
      unlockedState.style.display = "none";
      if (passcodeField) passcodeField.value = "";
    }
  }
}

function updateProfileDisplay() {
  const avatar = document.getElementById("profileAvatar");
  const nameDisplay = document.getElementById("profileDisplayName");
  const nameInput = document.getElementById("profileNameInput");
  const roleSelect = document.getElementById("profileRoleSelect");

  const isAdmin = currentProfile.role === "Administrator" && isAdminAuthenticated;

  if (avatar) avatar.textContent = (currentProfile.name || "M")[0].toUpperCase();
  if (nameDisplay) {
    nameDisplay.innerHTML = isAdmin
      ? `${escapeHtml(currentProfile.name)} <span style="color: var(--accent); font-weight: 600;">(Admin)</span>`
      : `${escapeHtml(currentProfile.name)} (${escapeHtml(currentProfile.role)})`;
  }
  const authLabel = document.getElementById("topbarAuthLabel");
  if (authLabel) {
    authLabel.textContent = isAdmin ? "Admin (Active)" : "Login / Auth";
  }
  if (nameInput) nameInput.value = currentProfile.name;
  if (roleSelect) roleSelect.value = currentProfile.role;

  // Prefill booking inputs
  const bookName = document.getElementById("bookUserName");
  const bookRole = document.getElementById("bookUserRole");
  if (bookName && !bookName.value) bookName.value = currentProfile.name;
  if (bookRole) bookRole.value = currentProfile.role === "Administrator" ? "Faculty" : currentProfile.role;

  updateAdminAuthUI();
}

function openAuthModal() {
  updateAdminAuthUI();
  switchAuthTab(isAdminAuthenticated ? "admin" : "member");
  openModal("authModal");
}

function switchAuthTab(tab) {
  const memberBtn = document.getElementById("tabMemberSignInBtn");
  const adminBtn = document.getElementById("tabAdminSignInBtn");
  const memberForm = document.getElementById("memberAuthForm");
  const adminForm = document.getElementById("adminAuthForm");

  if (tab === "admin") {
    if (memberBtn) memberBtn.className = "btn btn-sm btn-secondary";
    if (adminBtn) adminBtn.className = "btn btn-sm btn-primary";
    if (memberForm) memberForm.style.display = "none";
    if (adminForm) adminForm.style.display = "block";
    const passcode = document.getElementById("profileAdminPasscode");
    if (passcode) setTimeout(() => passcode.focus(), 60);
  } else {
    if (memberBtn) memberBtn.className = "btn btn-sm btn-primary";
    if (adminBtn) adminBtn.className = "btn btn-sm btn-secondary";
    if (memberForm) memberForm.style.display = "block";
    if (adminForm) adminForm.style.display = "none";
  }
}

function handleMemberAuthSubmit(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById("profileNameInput");
  const name = (nameInput ? nameInput.value.trim() : "") || "Mayank";
  const roleSelect = document.getElementById("profileRoleSelect");
  const role = roleSelect ? roleSelect.value : "Student";

  currentProfile = { name, role };
  isAdminAuthenticated = false;
  isMapEditMode = false;
  sessionStorage.setItem("cc_logged_in", "true");
  localStorage.setItem("cc_logged_in", "true");
  localStorage.removeItem("cc_admin_authenticated");
  sessionStorage.removeItem("cc_admin_authenticated");
  localStorage.setItem("cc_user_profile", JSON.stringify(currentProfile));

  updateProfileDisplay();
  updateMapEditorUI();
  closeAllModals();
  showToast(`Signed in as ${name} (${role})`, "success");
}

function handleAdminAuthSubmit(e) {
  if (e) e.preventDefault();
  const passcode = (document.getElementById("profileAdminPasscode")?.value || "").trim();
  if (verifyAdminPasscode(passcode)) {
    sessionStorage.setItem("cc_logged_in", "true");
    localStorage.setItem("cc_logged_in", "true");
  }
}

function handleLogout() {
  sessionStorage.removeItem("cc_logged_in");
  localStorage.removeItem("cc_logged_in");
  sessionStorage.removeItem("cc_admin_authenticated");
  localStorage.removeItem("cc_admin_authenticated");
  isAdminAuthenticated = false;
  isMapEditMode = false;
  currentProfile = { name: "Mayank", role: "Student" };
  localStorage.setItem("cc_user_profile", JSON.stringify(currentProfile));
  updateProfileDisplay();
  updateMapEditorUI();
  showToast("Logged out successfully.", "info");
  openAuthModal();
}

function saveProfile() {
  handleMemberAuthSubmit();
}

function verifyAdminPasscode(passcode) {
  if (passcode === ADMIN_PASSCODE) {
    isAdminAuthenticated = true;
    sessionStorage.setItem("cc_logged_in", "true");
    localStorage.setItem("cc_logged_in", "true");
    localStorage.setItem("cc_admin_authenticated", "true");
    sessionStorage.setItem("cc_admin_authenticated", "true");
    currentProfile = { name: "Administrator", role: "Administrator" };
    localStorage.setItem("cc_user_profile", JSON.stringify(currentProfile));
    isMapEditMode = true;
    updateAdminAuthUI();
    updateProfileDisplay();
    updateMapEditorUI();
    closeAllModals();
    showToast("Admin verified! Campus layout editing unlocked.", "success");
    return true;
  } else {
    showToast("Incorrect passcode! Default: admin123", "error");
    return false;
  }
}

function logoutAdmin() {
  isAdminAuthenticated = false;
  localStorage.removeItem("cc_admin_authenticated");
  sessionStorage.removeItem("cc_admin_authenticated");
  isMapEditMode = false;
  currentProfile = { name: "Mayank", role: "Student" };
  localStorage.setItem("cc_user_profile", JSON.stringify(currentProfile));
  updateAdminAuthUI();
  updateProfileDisplay();
  updateMapEditorUI();
  showToast("Switched back to Student member role.", "info");
  switchAuthTab("member");
}

/* =====================================================================
   NAVIGATION & TABS
   ===================================================================== */
function initNavigation() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.target;
      window.location.hash = target;
    });
  });

  window.addEventListener("hashchange", handleHashChange);
}

function handleHashChange() {
  window.scrollTo(0, 0);
  const hash = window.location.hash.replace("#", "") || "dashboard";
  const tabs = document.querySelectorAll(".nav-tab");
  const sections = document.querySelectorAll(".section");

  let found = false;
  sections.forEach(sec => {
    if (sec.id === hash) {
      sec.classList.add("active");
      found = true;
    } else {
      sec.classList.remove("active");
    }
  });

  if (!found && sections.length > 0) {
    sections[0].classList.add("active");
  }

  tabs.forEach(tab => {
    if (tab.dataset.target === hash) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  // Section specific refreshes
  if (hash === "dashboard") loadDashboard();
  if (hash === "resources") loadResources();
  if (hash === "book") initBookSection();
  if (hash === "bookings") loadBookings();
  if (hash === "waitlist") initWaitlistSection();
  if (hash === "map") loadMapSection();
}

function refreshAll() {
  loadDashboard();
  loadResources();
}

/* =====================================================================
   METADATA (Categories, Roles, Venues, Slots)
   ===================================================================== */
async function loadMeta() {
  try {
    const res = await fetch(`${API}/meta`);
    const data = await res.json();
    metaData = data;

    // Populate category filter in resources
    const catFilter = document.getElementById("resCategoryFilter");
    if (catFilter) {
      catFilter.innerHTML = '<option value="">All Categories</option>';
      data.categories.forEach(c => {
        catFilter.innerHTML += `<option value="${c}">${c}</option>`;
      });
    }

    // Populate Add Resource Categories & Venues
    const addCat = document.getElementById("addResCategory");
    const addLoc = document.getElementById("addResLocation");
    if (addCat) {
      addCat.innerHTML = data.categories.map(c => `<option value="${c}">${c}</option>`).join("");
    }
    if (addLoc) {
      addLoc.innerHTML = data.venues.map(v => `<option value="${v}">${v}</option>`).join("");
    }

    // Populate Edit Resource Categories & Venues
    const editCat = document.getElementById("editResCategory");
    const editLoc = document.getElementById("editResLocation");
    if (editCat) {
      editCat.innerHTML = data.categories.map(c => `<option value="${c}">${c}</option>`).join("");
    }
    if (editLoc) {
      editLoc.innerHTML = data.venues.map(v => `<option value="${v}">${v}</option>`).join("");
    }

    // Populate Map From / To
    const mapFrom = document.getElementById("routeFromSelect");
    const mapTo = document.getElementById("routeToSelect");
    if (mapFrom && mapTo) {
      mapFrom.innerHTML = data.venues.map(v => `<option value="${v}">${v}</option>`).join("");
      mapTo.innerHTML = data.venues.map(v => `<option value="${v}">${v}</option>`).join("");
      if (data.venues.length > 1) {
        mapFrom.selectedIndex = 0;
        mapTo.selectedIndex = 1;
      }
    }

    // Set placeholder next ID
    const addResId = document.getElementById("addResId");
    if (addResId && data.nextId) {
      addResId.placeholder = `e.g. ${data.nextId} (auto if blank)`;
    }

    // Populate Waitlist slot select
    const wlSlot = document.getElementById("wlSlotSelect");
    if (wlSlot) {
      wlSlot.innerHTML = data.slots.map(s => `<option value="${s}">${s}</option>`).join("");
    }
  } catch (err) {
    console.error("Failed to load metadata", err);
  }
}

/* =====================================================================
   1. DASHBOARD
   ===================================================================== */
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/stats`);
    const s = await res.json();

    const elRes = document.getElementById("dashStatResources");
    const elBk = document.getElementById("dashStatBookings");
    const elWl = document.getElementById("dashStatWaitlisted");
    const elVn = document.getElementById("dashStatVenues");
    const elMy = document.getElementById("dashStatMyBookings");

    if (elRes) elRes.textContent = s.resources ?? 0;
    if (elBk) elBk.textContent = s.bookings ?? 0;
    if (elWl) elWl.textContent = s.waitlisted ?? 0;
    if (elVn) elVn.textContent = s.venues ?? 0;

    if (elMy) {
      try {
        const myRes = await fetch(`${API}/bookings?user=${encodeURIComponent(currentProfile.name)}`);
        const myB = await myRes.json();
        elMy.textContent = Array.isArray(myB) ? myB.length : 0;
      } catch {
        elMy.textContent = "0";
      }
    }

    // Render Resources by Category chart
    renderBarChart("chartCategoryContainer", s.resourcesByCategory, s.resources, "fill-vermilion");

    // Render Bookings by Role chart
    renderRoleChart("chartRoleContainer", s.bookingsByRole, s.bookings);
  } catch (err) {
    console.error("Dashboard stats error", err);
  }

  loadActivity();
}

function renderBarChart(containerId, dataMap = {}, total = 0, fillClass = "fill-vermilion") {
  const container = document.getElementById(containerId);
  if (!container) return;

  const entries = Object.entries(dataMap);
  if (entries.length === 0) {
    container.innerHTML = '<div style="color: var(--muted); font-size: 13px;">No data recorded</div>';
    return;
  }

  const maxVal = Math.max(...entries.map(e => e[1]), 1);

  container.innerHTML = entries.map(([key, count]) => {
    const pct = Math.round((count / maxVal) * 100);
    return `
      <div class="bar-chart-row">
        <div class="bar-chart-label-row">
          <span>${key}</span>
          <span style="color: var(--text); font-family: var(--font-mono); font-size: 12px;">${count}</span>
        </div>
        <div class="bar-chart-track">
          <div class="bar-chart-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderRoleChart(containerId, dataMap = {}, total = 0) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const roles = [
    { name: "Faculty", count: dataMap.Faculty || 0 },
    { name: "Club", count: dataMap.Club || 0 },
    { name: "Student", count: dataMap.Student || 0 }
  ];

  const maxVal = Math.max(...roles.map(r => r.count), 1);

  container.innerHTML = roles.map(r => {
    const pct = Math.round((r.count / maxVal) * 100);
    return `
      <div class="bar-chart-row">
        <div class="bar-chart-label-row">
          <span>${r.name}</span>
          <span style="color: var(--text); font-family: var(--font-mono); font-size: 12px;">${r.count}</span>
        </div>
        <div class="bar-chart-track">
          <div class="bar-chart-fill" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function formatActivityMessage(item) {
  const text = item.text || "";
  const kind = (item.kind || "").toLowerCase();

  // 1. Cancel with promotion: "{name} cancelled. {next person} got the slot."
  if (kind === "cancel" || text.includes("Cancelled booking of")) {
    const promoMatch = text.match(/Cancelled booking of ([^.]+)\.\s*([^(]+)\s*\([^)]*\)\s*promoted/i);
    if (promoMatch) {
      return `${promoMatch[1].trim()} cancelled. ${promoMatch[2].trim()} got the slot.`;
    }
    const cancelMatch = text.match(/Cancelled booking of ([^.]+)/i);
    if (cancelMatch) {
      return `${cancelMatch[1].trim()} cancelled their booking.`;
    }
  }

  // 2. Undo: "Undo: {name}'s booking is back."
  if (kind === "undo" || text.startsWith("Undone:")) {
    const undoMatch = text.match(/booking by ([^ ]+) restored/i);
    if (undoMatch) {
      return `Undo: ${undoMatch[1].trim()}'s booking is back.`;
    }
    const cancelUndoMatch = text.match(/cancellation of ([^ ]+) reversed/i);
    if (cancelUndoMatch) {
      return `Undo: ${cancelUndoMatch[1].trim()}'s booking is back.`;
    }
    return text.replace(/^Undone:\s*/i, "Undo: ");
  }

  // 3. New booking: "{name} booked {room} for {time}."
  if (kind === "booking" || text.includes("booked")) {
    const bookMatch = text.match(/^([^(]+)\s*\([^)]*\)\s*booked\s+([^\s]+(?: [^\s]+)*?)\s+on\s+([^\s]+)\s+([^\s]+)$/i);
    if (bookMatch) {
      const name = bookMatch[1].trim();
      const room = bookMatch[2].trim();
      const slot = bookMatch[4].trim();
      return `${name} booked ${room} for ${slot}.`;
    }
    const simpleMatch = text.match(/([^(]+)\s*\([^)]*\)\s*booked\s+(.+)/i);
    if (simpleMatch) {
      return `${simpleMatch[1].trim()} booked ${simpleMatch[2].trim()}.`;
    }
  }

  // 4. Added to waitlist: "{name} joined the waitlist for {room}."
  if (kind === "waitlist" || text.includes("waitlisted")) {
    const wlMatch = text.match(/([^(]+)\s*\([^)]*\)\s*waitlisted for\s+([^(]+)/i);
    if (wlMatch) {
      return `${wlMatch[1].trim()} joined the waitlist for ${wlMatch[2].trim()}.`;
    }
  }

  return text;
}

function formatActivityTime(raw) {
  if (!raw) return "";
  const d = new Date(raw.replace(" ", "T"));
  if (isNaN(d.getTime())) return raw;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = d.getDate();
  const month = months[d.getMonth()];
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day} ${month}, ${hours}:${minutes} ${ampm}`;
}

async function loadActivity() {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;

  try {
    const res = await fetch(`${API}/activity`);
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) {
      feed.innerHTML = '<div class="empty-state">No recent activity right now.</div>';
      return;
    }

    feed.innerHTML = list.map(item => {
      const msg = formatActivityMessage(item);
      const time = formatActivityTime(item.time);
      const tagKind = (item.kind || "system").toLowerCase();
      return `
        <div class="activity-row">
          <div class="activity-left">
            <span class="activity-tag tag-${tagKind}">${tagKind}</span>
            <span class="activity-msg">${escapeHtml(msg)}</span>
          </div>
          <span class="activity-time">${time}</span>
        </div>
      `;
    }).join("");
  } catch (err) {
    feed.innerHTML = '<div class="empty-state">Failed to load activity</div>';
  }
}

/* =====================================================================
   2. RESOURCES
   ===================================================================== */
async function loadResources() {
  const tbody = document.getElementById("resourcesTableBody");
  if (!tbody) return;

  const q = document.getElementById("resSearchInput")?.value.trim() || "";
  const cat = document.getElementById("resCategoryFilter")?.value || "";
  const sort = document.getElementById("resSortFilter")?.value || "id";

  const url = `${API}/resources?sort=${encodeURIComponent(sort)}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    allResources = data;

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No rooms found.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr id="resRow-${r.id}">
        <td><strong style="color: var(--text);">${r.id}</strong></td>
        <td>${escapeHtml(r.name)}</td>
        <td><span class="role-text">${r.category}</span></td>
        <td>${r.location}</td>
        <td>${r.capacity} seats</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" onclick="bookResource('${r.id}')">Book</button>
            <button class="btn btn-secondary btn-sm" onclick="openEditModal('${r.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteResource('${r.id}')">Delete</button>
            <button class="btn btn-secondary btn-sm" onclick="routeToVenue('${r.location}')">Route</button>
          </div>
        </td>
      </tr>
    `).join("");

    updateResourceSelects();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #ff6b64;">Error loading resources</td></tr>`;
  }
}

async function lookupResourceById() {
  const input = document.getElementById("resLookupInput");
  const id = input.value.trim().toUpperCase();
  if (!id) return;

  try {
    const res = await fetch(`${API}/resources/${id}`);
    if (res.status === 404) {
      showToast(`Resource ${id} not found`, "error");
      return;
    }
    const data = await res.json();
    showToast(`Found: ${data.name} (${data.category}) at ${data.location}`, "success");

    // Highlight row
    const existingRow = document.getElementById(`resRow-${id}`);
    if (existingRow) {
      existingRow.classList.add("highlighted");
      existingRow.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => existingRow.classList.remove("highlighted"), 3000);
    } else {
      // Clear filters so it appears
      document.getElementById("resSearchInput").value = id;
      loadResources();
    }
  } catch {
    showToast("Lookup request failed", "error");
  }
}

function updateResourceSelects() {
  const bookSelect = document.getElementById("bookResourceSelect");
  const bFilterSelect = document.getElementById("bookingsResourceFilter");
  const wlSelect = document.getElementById("wlResourceSelect");

  const options = allResources.map(r => `<option value="${r.id}">${r.id} — ${escapeHtml(r.name)} (${r.location})</option>`).join("");

  if (bookSelect) {
    const curVal = bookSelect.value;
    bookSelect.innerHTML = `<option value="">Select Resource...</option>` + options;
    if (curVal && allResources.some(r => r.id === curVal)) bookSelect.value = curVal;
    else if (allResources.length > 0) bookSelect.value = allResources[0].id;
  }

  if (bFilterSelect) {
    bFilterSelect.innerHTML = `<option value="">All Resources</option>` + options;
  }

  if (wlSelect) {
    const curVal = wlSelect.value;
    wlSelect.innerHTML = options;
    if (curVal && allResources.some(r => r.id === curVal)) wlSelect.value = curVal;
    else if (allResources.length > 0) wlSelect.value = allResources[0].id;
  }
}

async function handleAddResource(e) {
  e.preventDefault();
  const id = document.getElementById("addResId").value.trim();
  const name = document.getElementById("addResName").value.trim();
  const category = document.getElementById("addResCategory").value;
  const location = document.getElementById("addResLocation").value;
  const capacity = parseInt(document.getElementById("addResCapacity").value, 10);

  if (!name || isNaN(capacity)) {
    showToast("Please provide valid name and capacity", "error");
    return;
  }

  const payload = { name, category, location, capacity };
  if (id) payload.id = id;

  try {
    const res = await fetch(`${API}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast(data.message, "success");
      closeAllModals();
      document.getElementById("addResourceForm").reset();
      loadResources();
      loadDashboard();
      loadMeta();
    } else {
      showToast(data.error || "Failed to create resource", "error");
    }
  } catch (err) {
    showToast("Network error creating resource", "error");
  }
}

function openEditModal(id) {
  const r = allResources.find(x => x.id === id);
  if (!r) return;

  document.getElementById("editResIdTitle").textContent = r.id;
  document.getElementById("editResId").value = r.id;
  document.getElementById("editResName").value = r.name;
  document.getElementById("editResCategory").value = r.category;
  document.getElementById("editResLocation").value = r.location;
  document.getElementById("editResCapacity").value = r.capacity;

  openModal("editResourceModal");
}

async function handleEditResource(e) {
  e.preventDefault();
  const id = document.getElementById("editResId").value;
  const name = document.getElementById("editResName").value.trim();
  const category = document.getElementById("editResCategory").value;
  const location = document.getElementById("editResLocation").value;
  const capVal = document.getElementById("editResCapacity").value.trim();

  const payload = {};
  if (name) payload.name = name;
  if (category) payload.category = category;
  if (location) payload.location = location;
  if (capVal) payload.capacity = parseInt(capVal, 10);

  try {
    const res = await fetch(`${API}/resources/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast(data.message, "success");
      closeAllModals();
      loadResources();
      loadDashboard();
    } else {
      showToast(data.error || "Failed to update resource", "error");
    }
  } catch (err) {
    showToast("Network error updating resource", "error");
  }
}

function confirmDeleteResource(id) {
  const r = allResources.find(x => x.id === id);
  const name = r ? r.name : id;

  showConfirm(
    "Delete Resource",
    `Are you sure you want to delete ${id} — "${name}"? If it has active bookings, deletion will be blocked by the server.`,
    async () => {
      try {
        const res = await fetch(`${API}/resources/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (res.ok && data.ok) {
          showToast(data.message, "success");
          loadResources();
          loadDashboard();
        } else {
          // Backend says "Cannot delete: it has active bookings"
          showToast(data.error || "Cannot delete resource", "error");
        }
      } catch (err) {
        showToast("Network error deleting resource", "error");
      }
    }
  );
}

function bookResource(id) {
  window.location.hash = "book";
  setTimeout(() => {
    const select = document.getElementById("bookResourceSelect");
    if (select) {
      select.value = id;
      loadSlots();
    }
  }, 50);
}

function routeToVenue(venue) {
  window.location.hash = "map";
  setTimeout(() => {
    const toSelect = document.getElementById("routeToSelect");
    if (toSelect) {
      toSelect.value = venue;
      findRoute();
    }
  }, 50);
}

/* =====================================================================
   3. BOOK A SLOT (#book)
   ===================================================================== */
function initBookSection() {
  const dateInput = document.getElementById("bookDateInput");
  if (dateInput && !dateInput.value) {
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;
  }
  loadSlots();
}

async function loadSlots() {
  const resId = document.getElementById("bookResourceSelect")?.value;
  const date = document.getElementById("bookDateInput")?.value;
  const grid = document.getElementById("slotsGrid");

  if (!resId || !date) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">Select a resource and date to view time slots.</div>';
    resetSlotSelection();
    return;
  }

  try {
    const res = await fetch(`${API}/slots?resId=${encodeURIComponent(resId)}&date=${encodeURIComponent(date)}`);
    const slots = await res.json();

    if (!Array.isArray(slots) || slots.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--muted);">No slots available.</div>';
      resetSlotSelection();
      return;
    }

    grid.innerHTML = slots.map(s => {
      const isFree = s.status === "free";
      const statusClass = isFree ? "slot-free" : "slot-booked";
      const isSelected = selectedSlotData && selectedSlotData.slot === s.slot;
      const selectClass = isSelected ? "selected" : "";

      const waitlistBadge = s.waitlistCount > 0 ? `<span class="slot-waitlist-badge">${s.waitlistCount} waiting</span>` : "";
      const holderName = isFree ? "Available now" : (s.holder?.user || "Booked");

      return `
        <div class="slot-card ${statusClass} ${selectClass}" onclick="selectSlot('${s.slot}', '${s.status}', '${escapeHtml(holderName)}', ${s.waitlistCount || 0})">
          ${waitlistBadge}
          <div>
            <div class="slot-time">${s.slot}</div>
            <div class="slot-status-text">${isFree ? "Free" : "Booked"}</div>
          </div>
          <div class="slot-holder" style="font-size: 11.5px; color: var(--text-dim); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(holderName)}">
            ${escapeHtml(holderName)}
          </div>
        </div>
      `;
    }).join("");

    // If previously selected slot is still present, update selected data
    if (selectedSlotData) {
      const updated = slots.find(s => s.slot === selectedSlotData.slot);
      if (updated) {
        selectSlot(updated.slot, updated.status, updated.holder, updated.waitlistCount);
      }
    }
  } catch (err) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ff6b64;">Error loading slots.</div>';
  }
}

function selectSlot(slot, status, holder, waitlistCount) {
  const resId = document.getElementById("bookResourceSelect").value;
  const date = document.getElementById("bookDateInput").value;

  selectedSlotData = { resId, date, slot, status, holder, waitlistCount };

  // Highlight selected card
  document.querySelectorAll(".slot-card").forEach(c => {
    const t = c.querySelector(".slot-time")?.textContent;
    if (t === slot) c.classList.add("selected");
    else c.classList.remove("selected");
  });

  const display = document.getElementById("bookSlotDisplay");
  const btn = document.getElementById("bookActionBtn");

  display.value = `${slot} (${status.toUpperCase()})`;
  btn.disabled = false;

  if (status === "free") {
    btn.textContent = `Book Slot (${slot})`;
    btn.className = "btn btn-primary";
  } else {
    btn.textContent = `Join Waitlist (${slot})`;
    btn.className = "btn btn-primary";
  }
}

function resetSlotSelection() {
  selectedSlotData = null;
  const display = document.getElementById("bookSlotDisplay");
  const btn = document.getElementById("bookActionBtn");
  if (display) display.value = "Select a slot on the grid ->";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Select a Slot";
  }
}

async function handleBookAction() {
  if (!selectedSlotData) {
    showToast("Please choose a slot first", "error");
    return;
  }

  const { resId, date, slot } = selectedSlotData;
  const user = document.getElementById("bookUserName").value.trim();
  const role = document.getElementById("bookUserRole").value;

  if (!user) {
    showToast("Please enter your name", "error");
    return;
  }

  const payload = { resId, date, slot, user, role };

  try {
    const res = await fetch(`${API}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    const resultBox = document.getElementById("bookingResultBox");
    const resultTitle = document.getElementById("bookingResultTitle");
    const resultDesc = document.getElementById("bookingResultDesc");
    const resultActions = document.getElementById("bookingResultActions");

    if (res.ok && data.ok) {
      showToast(data.message, "success");

      if (data.status === "confirmed") {
        resultBox.className = "booking-result-box confirmed";
        resultTitle.textContent = "Booking Confirmed!";
        resultDesc.textContent = `${data.message}`;

        // Find venue of this resource
        const rObj = allResources.find(x => x.id === resId);
        const venue = rObj ? rObj.location : "";

        resultActions.innerHTML = `
          <button class="btn btn-secondary btn-sm" onclick="routeToVenue('${venue}')">Show route to venue</button>
        `;
      } else if (data.status === "waitlisted") {
        resultBox.className = "booking-result-box waitlisted";
        resultTitle.textContent = `Waitlisted (Position #${data.position})`;
        resultDesc.textContent = `${data.message}`;
        resultActions.innerHTML = `
          <button class="btn btn-secondary btn-sm" onclick="viewWaitlistForSlot('${resId}', '${date}', '${slot}')">View waitlist</button>
        `;
      }

      loadSlots();
      loadDashboard();
    } else {
      // 409 or other errors: "You already hold this slot"
      showToast(data.error || "Booking failed", "error");
    }
  } catch (err) {
    showToast("Network error submitting booking", "error");
  }
}

function viewWaitlistForSlot(resId, date, slot) {
  window.location.hash = "waitlist";
  setTimeout(() => {
    document.getElementById("wlResourceSelect").value = resId;
    document.getElementById("wlDateInput").value = date;
    document.getElementById("wlSlotSelect").value = slot;
    inspectWaitlist();
  }, 50);
}

/* =====================================================================
   4. BOOKINGS SECTION (#bookings)
   ===================================================================== */
async function loadBookings() {
  const tbody = document.getElementById("bookingsTableBody");
  if (!tbody) return;

  const resId = document.getElementById("bookingsResourceFilter")?.value || "";
  const date = document.getElementById("bookingsDateFilter")?.value || "";
  const userQuery = document.getElementById("bookingsUserFilter")?.value.trim() || "";
  const role = document.getElementById("bookingsRoleFilter")?.value || "";
  const myOnly = document.getElementById("bookingsMyOnlyToggle")?.checked;

  let userParam = userQuery;
  if (myOnly) {
    userParam = currentProfile.name;
  }

  const queryParams = new URLSearchParams();
  if (resId) queryParams.set("resId", resId);
  if (date) queryParams.set("date", date);
  if (userParam) queryParams.set("user", userParam);
  if (role) queryParams.set("role", role);

  try {
    const res = await fetch(`${API}/bookings?${queryParams.toString()}`);
    const bookings = await res.json();

    if (!Array.isArray(bookings) || bookings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No active bookings right now.</td></tr>`;
      return;
    }

    tbody.innerHTML = bookings.map(b => `
      <tr>
        <td><strong style="color: var(--text);">${b.resId}</strong> — ${escapeHtml(b.resourceName || "")}</td>
        <td>${b.location || ""}</td>
        <td>${b.date}</td>
        <td><strong style="color: var(--text); font-family: var(--font-mono);">${b.slot}</strong></td>
        <td>${escapeHtml(b.user)}</td>
        <td><span class="role-text role-${(b.role || "student").toLowerCase()}">${b.role}</span></td>
        <td>${b.waitlistCount > 0 ? `<span style="color: var(--status-waitlisted); font-family: var(--font-mono); font-size: 12px;">${b.waitlistCount} waiting</span>` : '<span style="color: var(--text-dim); font-family: var(--font-mono); font-size: 12px;">0</span>'}</td>
        <td>
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm" onclick="openEditBookingModal('${b.resId}', '${b.date}', '${b.slot}', '${escapeHtml(b.user)}', '${escapeHtml(b.role)}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="cancelBooking('${b.resId}', '${b.date}', '${b.slot}')">Cancel</button>
            <button class="btn btn-secondary btn-sm" onclick="viewWaitlistForSlot('${b.resId}', '${b.date}', '${b.slot}')">Waitlist</button>
            <button class="btn btn-secondary btn-sm" onclick="routeToVenue('${b.location}')">Route</button>
          </div>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    if (!serverIsOnline) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding: 32px 16px; color: var(--text-dim);">
            <div style="font-weight: 500; color: var(--accent); margin-bottom: 6px;">Waking up server instance...</div>
            <div style="font-size: 12px; margin-bottom: 12px; opacity: 0.8;">Cloud free-tier instance is resuming. Connecting automatically...</div>
            <button class="btn btn-secondary btn-sm" onclick="loadBookings()">Retry now</button>
          </td>
        </tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: #ff6b64;">Error loading bookings. <button class="btn btn-secondary btn-sm" onclick="loadBookings()" style="margin-left: 8px;">Retry</button></td></tr>`;
    }
  }
}

function openEditBookingModal(resId, date, slot, user, role) {
  const modal = document.getElementById("editBookingModal");
  if (!modal) return;

  document.getElementById("editBookingOldResId").value = resId;
  document.getElementById("editBookingOldDate").value = date;
  document.getElementById("editBookingOldSlot").value = slot;

  const summary = document.getElementById("editBookingSummaryText");
  if (summary) {
    summary.textContent = `${resId} · ${date} · ${slot} (Booked by ${user})`;
  }

  const resSelect = document.getElementById("editBookingResSelect");
  if (resSelect) {
    resSelect.innerHTML = allResources.map(r => `
      <option value="${r.id}" ${r.id === resId ? "selected" : ""}>
        ${r.id} — ${escapeHtml(r.name)} (${escapeHtml(r.location)}) [Cap: ${r.capacity}]
      </option>
    `).join("");
  }

  const dateInput = document.getElementById("editBookingDateInput");
  if (dateInput) {
    dateInput.value = date;
    dateInput.min = new Date().toISOString().split("T")[0];
  }

  const slotSelect = document.getElementById("editBookingSlotSelect");
  const slots = (metaData && metaData.slots && metaData.slots.length > 0)
    ? metaData.slots
    : ["09:00-10:00", "10:00-11:00", "11:00-12:00", "14:00-15:00", "15:00-16:00"];

  if (slotSelect) {
    slotSelect.innerHTML = slots.map(s => `
      <option value="${s}" ${s === slot ? "selected" : ""}>${s}</option>
    `).join("");
  }

  const userInput = document.getElementById("editBookingUser");
  const roleInput = document.getElementById("editBookingRole");
  if (userInput) userInput.value = user;
  if (roleInput) roleInput.value = role;

  openModal("editBookingModal");
}

async function handleEditBookingSubmit(e) {
  e.preventDefault();
  const oldResId = document.getElementById("editBookingOldResId").value;
  const oldDate = document.getElementById("editBookingOldDate").value;
  const oldSlot = document.getElementById("editBookingOldSlot").value;

  const newResId = document.getElementById("editBookingResSelect").value;
  const newDate = document.getElementById("editBookingDateInput").value;
  const newSlot = document.getElementById("editBookingSlotSelect").value;
  const user = document.getElementById("editBookingUser").value;
  const role = document.getElementById("editBookingRole").value;

  if (oldResId === newResId && oldDate === newDate && oldSlot === newSlot) {
    showToast("No changes made to booking.", "info");
    closeAllModals();
    return;
  }

  const submitBtn = document.getElementById("editBookingSubmitBtn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";
  }

  try {
    const res = await fetch(`${API}/bookings/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oldResId,
        oldDate,
        oldSlot,
        newResId,
        newDate,
        newSlot,
        user,
        role
      })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showToast(data.message || `Booking updated to ${newResId} (${newDate} ${newSlot})!`, "success");
      closeAllModals();
      loadBookings();
      loadDashboard();
      if (typeof loadSlots === "function") loadSlots();
    } else {
      showToast(data.error || "Failed to update booking. Target slot may already be reserved.", "error");
    }
  } catch (err) {
    showToast("Network error updating booking", "error");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save changes";
    }
  }
}

function cancelBooking(resId, date, slot) {
  showConfirm(
    "Cancel Booking",
    `Cancel the booking for ${resId} on ${date} (${slot})? If waitlisted users exist, the highest priority user will automatically be promoted.`,
    async () => {
      try {
        const res = await fetch(`${API}/bookings/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resId, date, slot })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          if (data.promoted) {
            showToast(`${data.promoted.user} (${data.promoted.role}) moved from waitlist to confirmed!`, "success");
          } else {
            showToast(data.message, "success");
          }
          loadBookings();
          loadDashboard();
        } else {
          showToast(data.error || "Failed to cancel booking", "error");
        }
      } catch {
        showToast("Network error cancelling booking", "error");
      }
    }
  );
}

/* =====================================================================
   5. WAITLIST
   ===================================================================== */
function initWaitlistSection() {
  const dateInput = document.getElementById("wlDateInput");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }
  inspectWaitlist();
}

async function inspectWaitlist() {
  const resId = document.getElementById("wlResourceSelect")?.value;
  const date = document.getElementById("wlDateInput")?.value;
  const slot = document.getElementById("wlSlotSelect")?.value;

  const holderName = document.getElementById("wlHolderName");
  const holderRole = document.getElementById("wlHolderRoleBadge");
  const queueList = document.getElementById("wlQueueList");

  if (!resId || !date || !slot) {
    queueList.innerHTML = '<div style="color: var(--muted); font-size: 13.5px;">Select a resource, date and slot.</div>';
    return;
  }

  try {
    const res = await fetch(`${API}/waitlist?resId=${encodeURIComponent(resId)}&date=${encodeURIComponent(date)}&slot=${encodeURIComponent(slot)}`);
    const data = await res.json();

    if (data.heldBy) {
      holderName.textContent = `${data.heldBy.user} (${resId} · ${date} ${slot})`;
      holderRole.innerHTML = `<span class="role-text" style="color: var(--status-confirmed);">Confirmed (${data.heldBy.role})</span>`;
    } else {
      holderName.textContent = "Slot is currently free (No booking)";
      holderRole.innerHTML = '<span class="role-text" style="color: var(--status-confirmed);">Available</span>';
    }

    if (!Array.isArray(data.queue) || data.queue.length === 0) {
      queueList.innerHTML = '<div class="empty-state">No one on the waitlist right now.</div>';
      return;
    }

    queueList.innerHTML = data.queue.map(item => `
      <div class="queue-item">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div class="queue-rank">#${item.position}</div>
          <div class="queue-user">${escapeHtml(item.user)}</div>
        </div>
        <div>
          <span class="role-text" style="color: var(--status-waitlisted);">${item.role}</span>
        </div>
      </div>
    `).join("");
  } catch (err) {
    queueList.innerHTML = '<div style="color: #ff6b64; font-size: 13.5px;">Error loading waitlist.</div>';
  }
}

/* =====================================================================
   6. CAMPUS MAP, ROUTING & EDITING
   ===================================================================== */
let pendingClickPos = null; // {x, y} when user double-clicks canvas
let draggingNode = null;     // {name, startX, startY, origX, origY, hasMoved}
let selectedVenueForAction = null;

const DEFAULT_VENUE_COORDS = {
  MainGate: { x: 90, y: 360 },
  Block1: { x: 260, y: 220 },
  Block2: { x: 440, y: 220 },
  Library: { x: 290, y: 90 },
  library: { x: 290, y: 90 },
  SportsComplex: { x: 580, y: 360 },
  "Block A": { x: 210, y: 190 },
  "block C": { x: 360, y: 200 },
  "Block D": { x: 510, y: 180 },
  "block E(Nursing Block)": { x: 600, y: 290 },
  canteen: { x: 220, y: 370 },
  nescafe: { x: 450, y: 400 },
  "mess/DS": { x: 330, y: 410 },
  OAT: { x: 400, y: 310 }
};

function getNodePositions(nodes) {
  const positions = {};
  const list = Array.isArray(nodes) ? nodes : Object.values(nodes || {});
  list.forEach((n, idx) => {
    if (typeof n.x === "number" && typeof n.y === "number") {
      positions[n.name] = { x: n.x, y: n.y };
    } else if (DEFAULT_VENUE_COORDS[n.name]) {
      positions[n.name] = { ...DEFAULT_VENUE_COORDS[n.name] };
    } else {
      const angle = (idx / Math.max(list.length, 1)) * 2 * Math.PI - (Math.PI / 2);
      positions[n.name] = {
        x: Math.round(360 + 220 * Math.cos(angle)),
        y: Math.round(240 + 150 * Math.sin(angle))
      };
    }
  });
  return positions;
}

async function loadMapSection() {
  updateMapEditorUI();
  await loadGraph();
}

async function loadGraph() {
  try {
    const res = await fetch(`${API}/graph`);
    const data = await res.json();
    graphData = data;
    renderCampusSvg(data);
    renderInfrastructureLists(data);
    updateVenueSelects(data.nodes || []);
  } catch (err) {
    console.error("Error loading campus graph", err);
  }
}

function updateVenueSelects(nodes) {
  const mapFrom = document.getElementById("routeFromSelect");
  const mapTo = document.getElementById("routeToSelect");
  const connectTo = document.getElementById("newVenueConnectTo");
  const edgeFrom = document.getElementById("edgeFromSelect");
  const edgeTo = document.getElementById("edgeToSelect");
  const addLoc = document.getElementById("addResLocation");
  const editLoc = document.getElementById("editResLocation");

  const names = nodes.map(n => n.name);

  if (mapFrom && mapTo) {
    const curFrom = mapFrom.value;
    const curTo = mapTo.value;
    mapFrom.innerHTML = names.map(v => `<option value="${v}">${v}</option>`).join("");
    mapTo.innerHTML = names.map(v => `<option value="${v}">${v}</option>`).join("");
    if (names.includes(curFrom)) mapFrom.value = curFrom;
    if (names.includes(curTo)) mapTo.value = curTo;
    else if (names.length > 1 && mapFrom.value === mapTo.value) mapTo.selectedIndex = 1;
  }

  if (connectTo) {
    connectTo.innerHTML = names.map(v => `<option value="${v}">${v}</option>`).join("");
  }
  if (edgeFrom && edgeTo) {
    edgeFrom.innerHTML = names.map(v => `<option value="${v}">${v}</option>`).join("");
    edgeTo.innerHTML = names.map(v => `<option value="${v}">${v}</option>`).join("");
    if (names.length > 1) edgeTo.selectedIndex = 1;
  }
  if (addLoc) {
    const cur = addLoc.value;
    addLoc.innerHTML = names.map(v => `<option value="${v}">${v}</option>`).join("");
    if (names.includes(cur)) addLoc.value = cur;
  }
  if (editLoc) {
    const cur = editLoc.value;
    editLoc.innerHTML = names.map(v => `<option value="${v}">${v}</option>`).join("");
    if (names.includes(cur)) editLoc.value = cur;
  }
}

function renderCampusSvg(data) {
  const svg = document.getElementById("campusSvg");
  if (!svg) return;

  const { nodes = [], edges = [] } = data;
  const positions = getNodePositions(nodes);

  let svgHtml = `
    <defs>
      <filter id="nodeGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
  `;

  // Draw Edges
  edges.forEach((edge) => {
    const p1 = positions[edge.from];
    const p2 = positions[edge.to];
    if (!p1 || !p2) return;

    const edgeId = `edge-${edge.from}-${edge.to}`;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    const isHighlighted = isEdgeInPath(edge.from, edge.to, lastRoutePath);
    const hlClass = isHighlighted ? "highlighted" : "";

    const canEdit = isMapEditMode && isAdminAuthenticated;
    const cursorStyle = "cursor: pointer;";
    const tooltipText = canEdit ? "Click to edit or delete pathway" : "Click to select in walking route";

    svgHtml += `
      <g id="${edgeId}">
        <line class="map-edge ${hlClass}" id="line-${edge.from}-${edge.to}" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"></line>
        <g style="${cursorStyle}" onclick="handleEdgeClick('${edge.from}', '${edge.to}', ${edge.distance})" title="${tooltipText}">
          <rect class="map-edge-bg" id="edgeBg-${edge.from}-${edge.to}" x="${midX - 22}" y="${midY - 10}" width="44" height="20"></rect>
          <text class="map-edge-label" id="edgeLabel-${edge.from}-${edge.to}" x="${midX}" y="${midY}">${edge.distance}m</text>
        </g>
      </g>
    `;
  });

  // Draw Nodes
  const canEdit = isMapEditMode && isAdminAuthenticated;
  nodes.forEach(n => {
    const p = positions[n.name];
    if (!p) return;

    const isActive = lastRoutePath.includes(n.name);
    const activeClass = isActive ? "active" : "";
    const dragClass = canEdit ? "draggable" : "";
    const nodeTitle = canEdit ? 'Drag to reposition, click to manage' : 'Click to select in route finder / inspect';

    svgHtml += `
      <g class="map-node ${activeClass} ${dragClass}" id="node-${n.name}" 
         onmousedown="startNodeDrag(event, '${n.name}')" 
         ontouchstart="startNodeDrag(event, '${n.name}')"
         onclick="handleNodeClick('${n.name}')"
         title="${nodeTitle}">
        <circle class="map-node-circle" id="circle-${n.name}" cx="${p.x}" cy="${p.y}" r="26"></circle>
        <text class="map-node-text" id="text-${n.name}" x="${p.x}" y="${p.y - 3}">${escapeHtml(n.name)}</text>
        <text class="map-node-sub" id="sub-${n.name}" x="${p.x}" y="${p.y + 12}">${n.resources} spaces</text>
      </g>
    `;
  });

  svg.innerHTML = svgHtml;
}

function renderInfrastructureLists(data) {
  const vList = document.getElementById("infraVenuesList");
  const eList = document.getElementById("infraEdgesList");
  if (!vList || !eList) return;

  const { nodes = [], edges = [] } = data;
  const canEdit = isMapEditMode && isAdminAuthenticated;

  const infraAddVenueBtn = document.getElementById("infraAddVenueBtn");
  const infraAddPathBtn = document.getElementById("infraAddPathBtn");
  if (infraAddVenueBtn) infraAddVenueBtn.style.display = canEdit ? "inline-flex" : "none";
  if (infraAddPathBtn) infraAddPathBtn.style.display = canEdit ? "inline-flex" : "none";

  if (nodes.length === 0) {
    vList.innerHTML = '<div style="color: var(--muted); font-size: 13px;">No buildings registered.</div>';
  } else {
    vList.innerHTML = nodes.map(n => `
      <div class="infra-item" style="cursor: pointer;" onclick="handleNodeClick('${escapeHtml(n.name)}')">
        <div>
          <strong style="color: #fff;">${escapeHtml(n.name)}</strong>
          <span style="font-size: 11px; color: var(--muted); margin-left: 6px;">(${n.resources} resources)</span>
        </div>
        ${canEdit ? `
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); promptAddEdgeFrom('${n.name}')">+ Path</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); confirmDeleteVenue('${n.name}')">Delete</button>
        </div>` : `<span style="font-size: 11px; color: var(--muted);">Click to inspect</span>`}
      </div>
    `).join("");
  }

  if (edges.length === 0) {
    eList.innerHTML = '<div style="color: var(--muted); font-size: 13px;">No pathways created.</div>';
  } else {
    eList.innerHTML = edges.map(e => `
      <div class="infra-item" style="cursor: pointer;" onclick="handleEdgeClick('${e.from}', '${e.to}', ${e.distance})">
        <div>
          <span style="color: #fff;">${e.from}</span> &harr; <span style="color: #fff;">${e.to}</span>
          <span class="cat-pill" style="margin-left: 8px;">${e.distance} m</span>
        </div>
        ${canEdit ? `
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openEditEdgeModal('${e.from}', '${e.to}', ${e.distance})">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); confirmDeleteEdge('${e.from}', '${e.to}')">Delete</button>
        </div>` : `<span style="font-size: 11px; color: var(--muted);">Walking pathway</span>`}
      </div>
    `).join("");
  }
}

function isEdgeInPath(from, to, path) {
  if (!Array.isArray(path) || path.length < 2) return false;
  for (let i = 0; i < path.length - 1; i++) {
    if ((path[i] === from && path[i + 1] === to) || (path[i] === to && path[i + 1] === from)) {
      return true;
    }
  }
  return false;
}

/* =====================================================================
   MAP EDIT MODE CONTROLLER
   ===================================================================== */
function toggleMapEditMode() {
  if (!isAdminAuthenticated) {
    const input = document.getElementById("adminPasscodeInput");
    if (input) input.value = "";
    openModal("adminPasscodeModal");
    return;
  }
  isMapEditMode = !isMapEditMode;
  updateMapEditorUI();
}

function lockMapEditor() {
  saveCampusLayoutToServer();
  isMapEditMode = false;
  updateMapEditorUI();
  showToast("Map locked. Building positions are permanently fixed for all users.", "info");
}

async function saveCampusLayoutToServer() {
  if (!isAdminAuthenticated) {
    showToast("Admin verification required to save campus layout", "error");
    return;
  }

  const positions = {};
  (graphData.nodes || []).forEach(n => {
    const circle = document.getElementById(`circle-${n.name}`);
    if (circle) {
      positions[n.name] = {
        x: Math.round(parseFloat(circle.getAttribute("cx"))),
        y: Math.round(parseFloat(circle.getAttribute("cy")))
      };
    }
  });

  try {
    const res = await fetch(`${API}/campus/positions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": ADMIN_PASSCODE
      },
      body: JSON.stringify({ positions })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (graphData && graphData.nodes) {
        graphData.nodes.forEach(n => {
          if (positions[n.name]) {
            n.x = positions[n.name].x;
            n.y = positions[n.name].y;
          }
        });
      }
      localStorage.removeItem("cc_campus_node_positions");
      showToast("Campus layout locked and saved to server! All visitors now see this fixed layout.", "success");
    } else {
      showToast(data.message || "Failed to save positions", "error");
    }
  } catch (err) {
    console.error("Error saving positions", err);
    showToast("Network error saving campus layout", "error");
  }
}

function updateMapEditorUI() {
  const banner = document.getElementById("mapEditorBanner");
  const btnText = document.getElementById("mapEditBtnText");
  const btn = document.getElementById("toggleMapEditBtn");
  const hint = document.getElementById("mapCanvasHint");
  const lockIcon = document.getElementById("mapEditLockIcon");

  const canEdit = isMapEditMode && isAdminAuthenticated;

  if (!isAdminAuthenticated) {
    if (banner) banner.style.display = "none";
    if (btnText) btnText.textContent = "Edit map";
    if (btn) btn.className = "btn btn-secondary";
    if (hint) hint.textContent = "Click a building to see its rooms";
    if (lockIcon) {
      lockIcon.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path>';
    }
  } else if (canEdit) {
    if (banner) banner.style.display = "flex";
    if (btnText) btnText.textContent = "Exit edit mode";
    if (btn) btn.className = "btn btn-primary";
    if (hint) hint.textContent = "Admin mode: Drag buildings to reposition. Click Save layout to fix.";
    if (lockIcon) {
      lockIcon.innerHTML = '<path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"></path>';
    }
  } else {
    if (banner) banner.style.display = "none";
    if (btnText) btnText.textContent = "Edit map";
    if (btn) btn.className = "btn btn-secondary";
    if (hint) hint.textContent = "Click a building to see its rooms";
    if (lockIcon) {
      lockIcon.innerHTML = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0110 0v4"></path>';
    }
  }

  renderCampusSvg(graphData);
  renderInfrastructureLists(graphData);
}

// Node Dragging implementation
function getSvgPoint(e, svg) {
  const pt = svg.createSVGPoint();
  if (e.touches && e.touches.length > 0) {
    pt.x = e.touches[0].clientX;
    pt.y = e.touches[0].clientY;
  } else {
    pt.x = e.clientX;
    pt.y = e.clientY;
  }
  const ctm = svg.getScreenCTM();
  if (ctm) {
    return pt.matrixTransform(ctm.inverse());
  }
  return { x: pt.x, y: pt.y };
}

function startNodeDrag(e, name) {
  if (!isMapEditMode || !isAdminAuthenticated) return;
  const svg = document.getElementById("campusSvg");
  if (!svg) return;

  const pt = getSvgPoint(e, svg);
  const pos = getNodePositions(graphData.nodes || {})[name];

  draggingNode = {
    name,
    startX: pt.x,
    startY: pt.y,
    origX: pos ? pos.x : pt.x,
    origY: pos ? pos.y : pt.y,
    hasMoved: false
  };

  const nodeEl = document.getElementById(`node-${name}`);
  if (nodeEl) nodeEl.classList.add("dragging");

  const moveHandler = (moveEvent) => {
    if (!draggingNode) return;
    const curPt = getSvgPoint(moveEvent, svg);
    const dx = curPt.x - draggingNode.startX;
    const dy = curPt.y - draggingNode.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      draggingNode.hasMoved = true;
    }

    const newX = Math.round(Math.max(30, Math.min(690, draggingNode.origX + dx)));
    const newY = Math.round(Math.max(30, Math.min(450, draggingNode.origY + dy)));

    // Live update circle & texts
    const circle = document.getElementById(`circle-${name}`);
    const text = document.getElementById(`text-${name}`);
    const sub = document.getElementById(`sub-${name}`);
    if (circle) { circle.setAttribute("cx", newX); circle.setAttribute("cy", newY); }
    if (text) { text.setAttribute("x", newX); text.setAttribute("y", newY - 3); }
    if (sub) { sub.setAttribute("x", newX); sub.setAttribute("y", newY + 12); }

    // Live update connected lines & labels
    const currentPositions = getNodePositions(graphData.nodes || {});
    currentPositions[name] = { x: newX, y: newY };

    (graphData.edges || []).forEach(edge => {
      if (edge.from === name || edge.to === name) {
        const p1 = currentPositions[edge.from];
        const p2 = currentPositions[edge.to];
        if (p1 && p2) {
          const line = document.getElementById(`line-${edge.from}-${edge.to}`);
          const edgeBg = document.getElementById(`edgeBg-${edge.from}-${edge.to}`);
          const edgeLabel = document.getElementById(`edgeLabel-${edge.from}-${edge.to}`);
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          if (line) {
            line.setAttribute("x1", p1.x); line.setAttribute("y1", p1.y);
            line.setAttribute("x2", p2.x); line.setAttribute("y2", p2.y);
          }
          if (edgeBg) {
            edgeBg.setAttribute("x", midX - 22); edgeBg.setAttribute("y", midY - 10);
          }
          if (edgeLabel) {
            edgeLabel.setAttribute("x", midX); edgeLabel.setAttribute("y", midY);
          }
        }
      }
    });
  };

  const upHandler = () => {
    window.removeEventListener("mousemove", moveHandler);
    window.removeEventListener("mouseup", upHandler);
    window.removeEventListener("touchmove", moveHandler);
    window.removeEventListener("touchend", upHandler);

    if (draggingNode) {
      const nodeEl = document.getElementById(`node-${draggingNode.name}`);
      if (nodeEl) nodeEl.classList.remove("dragging");

      if (draggingNode.hasMoved) {
        const circle = document.getElementById(`circle-${draggingNode.name}`);
        if (circle) {
          const finalX = Math.round(parseFloat(circle.getAttribute("cx")));
          const finalY = Math.round(parseFloat(circle.getAttribute("cy")));
          if (graphData && graphData.nodes) {
            const nd = graphData.nodes.find(n => n.name === draggingNode.name);
            if (nd) { nd.x = finalX; nd.y = finalY; }
          }
          // Auto-save to server
          fetch(`${API}/campus/positions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Admin-Key": ADMIN_PASSCODE },
            body: JSON.stringify({ name: draggingNode.name, x: finalX, y: finalY })
          }).catch(err => console.error("Error auto-saving position", err));
        }
      }
      setTimeout(() => { draggingNode = null; }, 50);
    }
  };

  window.addEventListener("mousemove", moveHandler);
  window.addEventListener("mouseup", upHandler);
  window.addEventListener("touchmove", moveHandler);
  window.addEventListener("touchend", upHandler);
}

// Double click to add venue
function handleSvgDblClick(e) {
  if (!isMapEditMode || !isAdminAuthenticated) return;
  const svg = document.getElementById("campusSvg");
  if (!svg) return;
  const pt = getSvgPoint(e, svg);
  pendingClickPos = { x: Math.round(pt.x), y: Math.round(pt.y) };
  openAddVenueModal();
}

function openAddVenueModal() {
  document.getElementById("addVenueForm").reset();
  const toggle = document.getElementById("venueConnectToggle");
  const fields = document.getElementById("venueConnectFields");
  if (toggle) toggle.checked = false;
  if (fields) fields.style.display = "none";
  openModal("addVenueModal");
}

function promptAddEdgeFrom(venueName) {
  openEditEdgeModal(venueName, "", "");
}

function openEditEdgeModal(from = "", to = "", dist = "") {
  const form = document.getElementById("addEdgeForm");
  form.reset();
  const fromSel = document.getElementById("edgeFromSelect");
  const toSel = document.getElementById("edgeToSelect");
  const distInp = document.getElementById("edgeDistanceInput");

  if (from && fromSel) fromSel.value = from;
  if (to && toSel) toSel.value = to;
  if (dist && distInp) distInp.value = dist;

  openModal("addEdgeModal");
}

async function handleAddVenueSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("newVenueName").value.trim();
  const shouldConnect = document.getElementById("venueConnectToggle").checked;
  const connectTo = document.getElementById("newVenueConnectTo").value;
  const connectDist = parseInt(document.getElementById("newVenueConnectDist").value, 10);

  if (!name) {
    showToast("Building name is required", "error");
    return;
  }

  try {
    const res = await fetch(`${API}/campus/venue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      if (pendingClickPos) {
        saveNodePosition(name, pendingClickPos.x, pendingClickPos.y);
        pendingClickPos = null;
      }

      showToast(data.message, "success");

      // Optional immediate pathway connection
      if (shouldConnect && connectTo && !isNaN(connectDist) && connectDist > 0) {
        await fetch(`${API}/campus/edge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: name, to: connectTo, distance: connectDist })
        });
      }

      closeAllModals();
      await loadGraph();
      await loadMeta();
      loadDashboard();
    } else {
      showToast(data.error || "Failed to add venue", "error");
    }
  } catch (err) {
    showToast("Network error adding venue", "error");
  }
}

async function handleAddEdgeSubmit(e) {
  e.preventDefault();
  const from = document.getElementById("edgeFromSelect").value;
  const to = document.getElementById("edgeToSelect").value;
  const distance = parseInt(document.getElementById("edgeDistanceInput").value, 10);

  if (!from || !to || isNaN(distance) || distance <= 0) {
    showToast("Please provide valid from, to and distance", "error");
    return;
  }

  if (from === to) {
    showToast("Starting venue and destination must be different", "error");
    return;
  }

  try {
    const res = await fetch(`${API}/campus/edge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, distance })
    });
    const data = await res.json();

    if (res.ok && data.ok) {
      showToast(data.message, "success");
      closeAllModals();
      await loadGraph();
    } else {
      showToast(data.error || "Failed to save pathway", "error");
    }
  } catch (err) {
    showToast("Network error saving pathway", "error");
  }
}

function handleEdgeClick(from, to, dist) {
  if (!isMapEditMode || !isAdminAuthenticated) {
    const mapFrom = document.getElementById("routeFromSelect");
    const mapTo = document.getElementById("routeToSelect");
    if (mapFrom && mapTo) {
      mapFrom.value = from;
      mapTo.value = to;
      findRoute();
      showToast(`Selected walking route: ${from} → ${to} (${dist}m)`, "info");
    }
    return;
  }
  showConfirm(
    "Pathway Options",
    `Pathway between ${from} and ${to} (${dist} metres). Would you like to remove this pathway, or edit its distance?`,
    () => { confirmDeleteEdge(from, to); }
  );
  // Modify button text in confirm modal for clarity
  const proceedBtn = document.getElementById("confirmActionBtn");
  if (proceedBtn) proceedBtn.textContent = "Delete Pathway";
}

function confirmDeleteEdge(from, to) {
  showConfirm(
    "Delete Pathway",
    `Are you sure you want to remove the pathway between ${from} and ${to}?`,
    async () => {
      try {
        const res = await fetch(`${API}/campus/edge/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          showToast(data.message, "success");
          await loadGraph();
        } else {
          showToast(data.error || "Failed to remove pathway", "error");
        }
      } catch {
        showToast("Network error deleting pathway", "error");
      }
    }
  );
}

function confirmDeleteVenue(name) {
  showConfirm(
    "Delete Campus Venue",
    `Are you sure you want to delete building "${name}"? If any resource is registered at this building, deletion will be blocked.`,
    async () => {
      try {
        const res = await fetch(`${API}/campus/venue/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          // Remove from local saved positions
          const saved = getSavedNodePositions();
          delete saved[name];
          localStorage.setItem("cc_campus_node_positions", JSON.stringify(saved));

          showToast(data.message, "success");
          document.getElementById("venueResourcesCard").style.display = "none";
          await loadGraph();
          await loadMeta();
          loadDashboard();
        } else {
          showToast(data.error || "Cannot delete venue", "error");
        }
      } catch {
        showToast("Network error deleting venue", "error");
      }
    }
  );
}

function resetCampusMap() {
  showConfirm(
    "Reset Campus to Default",
    "Are you sure you want to restore the default 5 venues (MainGate, Block1, Block2, Library, SportsComplex) and sample pathways?",
    async () => {
      try {
        const res = await fetch(`${API}/campus/reset`, { method: "POST" });
        const data = await res.json();
        if (res.ok && data.ok) {
          localStorage.removeItem("cc_campus_node_positions");
          showToast("Campus map restored to default layout", "success");
          await loadGraph();
          await loadMeta();
          loadDashboard();
        } else {
          showToast(data.error || "Reset failed", "error");
        }
      } catch {
        showToast("Network error resetting campus", "error");
      }
    }
  );
}

function resetLayoutPositions() {
  localStorage.removeItem("cc_campus_node_positions");
  showToast("Building positions reset to automatic arrangement", "info");
  renderCampusSvg(graphData);
}

/* =====================================================================
   WALKING ROUTE
   ===================================================================== */
async function findRoute() {
  const from = document.getElementById("routeFromSelect").value;
  const to = document.getElementById("routeToSelect").value;

  if (from === to) {
    showToast("Starting venue and destination must be different", "info");
    return;
  }

  try {
    const res = await fetch(`${API}/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    const data = await res.json();

    if (res.ok && data.ok) {
      lastRoutePath = data.path || [];

      // Re-render SVG to show animations
      renderCampusSvg(graphData);

      const resultBox = document.getElementById("routeResultBox");
      const summary = document.getElementById("routeSummary");
      const steps = document.getElementById("routePathSteps");

      resultBox.classList.add("active");
      summary.textContent = `${data.distance} m · about ${data.walkMinutes} min walk`;
      steps.innerHTML = `Route: ${data.path.join(" &rarr; ")}`;

      showToast(`Route found: ${data.distance} m (${data.walkMinutes} min walk)`, "info");
    } else {
      showToast(data.error || "Route could not be calculated", "error");
    }
  } catch (err) {
    showToast("Network error calculating route", "error");
  }
}

function swapRouteVenues() {
  const fromSel = document.getElementById("routeFromSelect");
  const toSel = document.getElementById("routeToSelect");
  const tmp = fromSel.value;
  fromSel.value = toSel.value;
  toSel.value = tmp;
  findRoute();
}

function handleNodeClick(venueName) {
  if (draggingNode && draggingNode.hasMoved) return;

  selectedVenueForAction = venueName;
  const card = document.getElementById("venueResourcesCard");
  const title = document.getElementById("venueCardTitle");
  const list = document.getElementById("venueResourcesList");
  const editActions = document.getElementById("venueEditActions");

  title.textContent = `Building: ${venueName}`;
  const atVenue = allResources.filter(r => r.location === venueName);

  if (atVenue.length === 0) {
    list.innerHTML = `<div style="color: var(--muted); padding: 4px 0;">No resources registered at ${venueName}.</div>`;
  } else {
    list.innerHTML = atVenue.map(r => `
      <div style="display: flex; justify-content: space-between; align-items: center; background: var(--ink-card); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--line-soft);">
        <div>
          <strong>${r.id}</strong> — ${escapeHtml(r.name)}
          <span class="cat-pill" style="margin-left: 6px;">${r.capacity} seats</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="bookResource('${r.id}')">Book</button>
      </div>
    `).join("");
  }

  if (editActions) {
    if (isMapEditMode && isAdminAuthenticated) {
      editActions.style.display = "block";
      const delBtn = document.getElementById("venueDeleteBtn");
      if (delBtn) delBtn.onclick = () => confirmDeleteVenue(venueName);
    } else {
      editActions.style.display = "none";
    }
  }

  if (!isMapEditMode || !isAdminAuthenticated) {
    const toSel = document.getElementById("routeToSelect");
    if (toSel && toSel.value !== venueName) {
      toSel.value = venueName;
    }
  }

  card.style.display = "block";
}

/* =====================================================================
   MODAL CONTROLLER & DIALOGS
   ==================================================================== */
function openModal(id) {
  let m = document.getElementById(id);
  if (!m && (id === "profileModal" || id === "authModal")) {
    m = document.getElementById("authModal") || document.getElementById("profileModal");
  }
  if (m) {
    m.classList.add("active");
    m.classList.add("open");
  }
}

function closeAllModals() {
  document.querySelectorAll(".modal-overlay").forEach(m => {
    m.classList.remove("active");
    m.classList.remove("open");
  });
}

function showConfirm(title, message, onConfirm) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;
  const btn = document.getElementById("confirmActionBtn");
  btn.textContent = "Proceed";

  // Clone button to clear old event listeners
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.onclick = () => {
    closeAllModals();
    onConfirm();
  };

  openModal("confirmModal");
}

/* =====================================================================
   EVENT LISTENERS & BINDINGS
   ===================================================================== */
function initEventListeners() {
  // Top bar & Profile / Authentication
  document.getElementById("topbarLogoutBtn")?.addEventListener("click", handleLogout);
  document.getElementById("profileChip")?.addEventListener("click", openAuthModal);
  document.getElementById("tabMemberSignInBtn")?.addEventListener("click", () => switchAuthTab("member"));
  document.getElementById("tabAdminSignInBtn")?.addEventListener("click", () => switchAuthTab("admin"));
  document.getElementById("memberAuthForm")?.addEventListener("submit", handleMemberAuthSubmit);
  document.getElementById("adminAuthForm")?.addEventListener("submit", handleAdminAuthSubmit);
  document.getElementById("randomizeNameBtn")?.addEventListener("click", randomizeStudentName);
  document.getElementById("profileAdminLogoutBtn")?.addEventListener("click", logoutAdmin);

  // Edit Booking Modal
  document.getElementById("editBookingForm")?.addEventListener("submit", handleEditBookingSubmit);

  // Dashboard quick actions
  document.getElementById("dashBookBtn")?.addEventListener("click", () => { window.location.hash = "book"; });
  document.getElementById("dashAddResBtn")?.addEventListener("click", () => openModal("addResourceModal"));
  document.getElementById("dashRouteBtn")?.addEventListener("click", () => { window.location.hash = "map"; });
  document.getElementById("refreshActivityBtn")?.addEventListener("click", loadActivity);

  // Resources
  document.getElementById("openAddResourceModalBtn")?.addEventListener("click", () => openModal("addResourceModal"));
  document.getElementById("addResourceForm")?.addEventListener("submit", handleAddResource);
  document.getElementById("editResourceForm")?.addEventListener("submit", handleEditResource);
  document.getElementById("resSearchInput")?.addEventListener("input", debounce(loadResources, 250));
  document.getElementById("resCategoryFilter")?.addEventListener("change", loadResources);
  document.getElementById("resSortFilter")?.addEventListener("change", loadResources);
  document.getElementById("resLookupBtn")?.addEventListener("click", lookupResourceById);
  document.getElementById("resLookupInput")?.addEventListener("keydown", e => { if (e.key === "Enter") lookupResourceById(); });

  // Book
  document.getElementById("bookResourceSelect")?.addEventListener("change", loadSlots);
  document.getElementById("bookDateInput")?.addEventListener("change", loadSlots);
  document.getElementById("bookActionBtn")?.addEventListener("click", handleBookAction);

  // Bookings
  document.getElementById("bookingsResourceFilter")?.addEventListener("change", loadBookings);
  document.getElementById("bookingsDateFilter")?.addEventListener("change", loadBookings);
  document.getElementById("bookingsUserFilter")?.addEventListener("input", debounce(loadBookings, 250));
  document.getElementById("bookingsRoleFilter")?.addEventListener("change", loadBookings);
  document.getElementById("bookingsMyOnlyToggle")?.addEventListener("change", loadBookings);

  // Waitlist
  document.getElementById("wlInspectBtn")?.addEventListener("click", inspectWaitlist);
  document.getElementById("wlResourceSelect")?.addEventListener("change", inspectWaitlist);
  document.getElementById("wlDateInput")?.addEventListener("change", inspectWaitlist);
  document.getElementById("wlSlotSelect")?.addEventListener("change", inspectWaitlist);

  // Map & Navigation
  document.getElementById("findRouteBtn")?.addEventListener("click", findRoute);
  document.getElementById("routeSwapBtn")?.addEventListener("click", swapRouteVenues);
  document.getElementById("closeVenueCardBtn")?.addEventListener("click", () => {
    document.getElementById("venueResourcesCard").style.display = "none";
  });

  // Map Editor triggers
  document.getElementById("toggleMapEditBtn")?.addEventListener("click", toggleMapEditMode);
  document.getElementById("editorSavePositionsBtn")?.addEventListener("click", saveCampusLayoutToServer);
  document.getElementById("editorLockExitBtn")?.addEventListener("click", lockMapEditor);
  document.getElementById("editorAddVenueBtn")?.addEventListener("click", openAddVenueModal);
  document.getElementById("editorAddEdgeBtn")?.addEventListener("click", () => openEditEdgeModal());
  document.getElementById("editorResetLayoutBtn")?.addEventListener("click", resetLayoutPositions);
  document.getElementById("editorResetCampusBtn")?.addEventListener("click", resetCampusMap);
  document.getElementById("infraAddVenueBtn")?.addEventListener("click", openAddVenueModal);
  document.getElementById("infraAddPathBtn")?.addEventListener("click", () => openEditEdgeModal());

  // Admin passcode form
  document.getElementById("adminPasscodeForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = document.getElementById("adminPasscodeInput").value.trim();
    verifyAdminPasscode(code);
  });

  // SVG double click to place building
  document.getElementById("campusSvg")?.addEventListener("dblclick", handleSvgDblClick);

  // Add Venue & Pathway forms
  document.getElementById("addVenueForm")?.addEventListener("submit", handleAddVenueSubmit);
  document.getElementById("addEdgeForm")?.addEventListener("submit", handleAddEdgeSubmit);
  document.getElementById("venueConnectToggle")?.addEventListener("change", (e) => {
    const f = document.getElementById("venueConnectFields");
    if (f) f.style.display = e.target.checked ? "block" : "none";
  });

  // Modal dismiss buttons
  document.querySelectorAll("[data-close-modal]").forEach(b => {
    b.addEventListener("click", closeAllModals);
  });
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", e => {
      if (e.target === overlay) closeAllModals();
    });
  });
}

// Helpers
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
