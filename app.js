// NOTE: this UI is only a convenience. All permissions are enforced by the server.
const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem("token");
let me = null;
let currentId = null; // null = new, unsaved document

// ---------- helpers ----------
async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && token) { logout(); throw new Error("Session expired. Please sign in again."); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data.detail;
    throw new Error(typeof d === "string" ? d : "Invalid input. Please check the fields.");
  }
  return data;
}

function say(el, text, ok = false) {
  el.textContent = text || "";
  el.classList.toggle("ok", ok);
}

// ---------- auth ----------
$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  say($("login-msg"), "");
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: { username: $("username").value.trim(), password: $("password").value },
    });
    token = data.access_token;
    sessionStorage.setItem("token", token);
    $("password").value = "";
    await start();
  } catch (err) { say($("login-msg"), err.message); }
});

function logout() {
  token = null; me = null; currentId = null;
  sessionStorage.removeItem("token");
  $("app-view").hidden = true;
  $("login-view").hidden = false;
}
$("logout").addEventListener("click", logout);

async function start() {
  me = await api("/me");
  $("who").textContent = `${me.username} (${me.role})`;
  $("login-view").hidden = true;
  $("app-view").hidden = false;
  const canAudit = me.role === "admin" || me.role === "auditor";
  $("audit-tab").hidden = !canAudit;
  $("new-doc").hidden = me.role === "auditor";
  showTab("docs");
  newDoc();
  await loadDocs();
}

// ---------- tabs ----------
document.querySelectorAll(".tab").forEach((b) =>
  b.addEventListener("click", () => showTab(b.dataset.tab)));

function showTab(name) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $("docs-tab").hidden = name !== "docs";
  $("audit-view").hidden = name !== "audit";
  if (name === "audit") loadAudit();
}

// ---------- documents ----------
async function loadDocs() {
  try {
    const docs = await api("/documents");
    const list = $("doc-list");
    list.replaceChildren();
    $("empty").hidden = docs.length > 0;
    for (const d of docs) {
      const li = document.createElement("li");
      li.textContent = d.title;            // textContent: never innerHTML (prevents XSS)
      li.classList.toggle("active", d.id === currentId);
      li.addEventListener("click", () => openDoc(d.id));
      list.appendChild(li);
    }
  } catch (err) { say($("doc-msg"), err.message); }
}

function newDoc() {
  currentId = null;
  $("doc-title").value = "";
  $("doc-content").value = "";
  $("delete").hidden = true;
  $("share-form").hidden = true;
  say($("doc-msg"), "");
}

async function openDoc(id) {
  say($("doc-msg"), "");
  try {
    const d = await api("/documents/" + encodeURIComponent(id));
    currentId = d.id;
    $("doc-title").value = d.title;
    $("doc-content").value = d.content;
    $("delete").hidden = false;
    $("share-form").hidden = false;
    await loadDocs();
  } catch (err) { say($("doc-msg"), err.message); }
}

$("new-doc").addEventListener("click", newDoc);

$("save").addEventListener("click", async () => {
  const body = { title: $("doc-title").value.trim(), content: $("doc-content").value };
  try {
    if (currentId) {
      await api("/documents/" + currentId, { method: "PUT", body });
    } else {
      const created = await api("/documents", { method: "POST", body });
      currentId = created.id;
      $("delete").hidden = false;
      $("share-form").hidden = false;
    }
    say($("doc-msg"), "Saved.", true);
    await loadDocs();
  } catch (err) { say($("doc-msg"), err.message); }
});

$("delete").addEventListener("click", async () => {
  if (!currentId || !confirm("Delete this document permanently?")) return;
  try {
    await api("/documents/" + currentId, { method: "DELETE" });
    newDoc();
    await loadDocs();
    say($("doc-msg"), "Deleted.", true);
  } catch (err) { say($("doc-msg"), err.message); }
});

$("share-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const r = await api(`/documents/${currentId}/share`, {
      method: "POST",
      body: { username: $("share-user").value.trim(), can_edit: $("share-edit").checked },
    });
    say($("doc-msg"), `Shared with ${r.shared_with} (${r.can_edit ? "can edit" : "read only"}).`, true);
    $("share-user").value = "";
  } catch (err) { say($("doc-msg"), err.message); }
});

// ---------- audit ----------
async function loadAudit() {
  say($("audit-msg"), "");
  try {
    const rows = await api("/audit");
    const body = $("audit-body");
    body.replaceChildren();
    for (const r of rows) {
      const tr = document.createElement("tr");
      [r.ts, r.actor, r.action, r.target || "", r.outcome, r.detail || ""].forEach((v, i) => {
        const td = document.createElement("td");
        td.textContent = v;
        if (i === 4 && v === "denied") td.className = "denied";
        tr.appendChild(td);
      });
      body.appendChild(tr);
    }
  } catch (err) { say($("audit-msg"), err.message); }
}
$("refresh-audit").addEventListener("click", loadAudit);

// ---------- boot ----------
if (token) start().catch(logout);
