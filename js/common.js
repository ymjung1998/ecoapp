function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return document.querySelectorAll(selector);
}

function showMessage(message, type = "info") {
  const box = qs("#messageBox");
  if (!box) return;
  box.className = `message-box ${type}`;
  box.textContent = message;
  box.classList.remove("hidden");
}

function hideMessage() {
  const box = qs("#messageBox");
  if (!box) return;
  box.className = "message-box hidden";
  box.textContent = "";
}

function isSixDigitNumber(value) {
  return /^[0-9]{6}$/.test(String(value || "").trim());
}

function makeInternalEmail(loginId) {
  return `${String(loginId).trim()}@ecoapp.example.com`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function formatCoord(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return "-";
  return num.toFixed(6);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSelectedProjectId() {
  return localStorage.getItem("selectedProjectId");
}

function setSelectedProjectId(projectId) {
  localStorage.setItem("selectedProjectId", String(projectId));
}

function clearSelectedProjectId() {
  localStorage.removeItem("selectedProjectId");
}

async function getCurrentUser() {
  const { data, error } = await window.sb.auth.getUser();
  if (error) throw error;
  return data.user;
}

async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await window.sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  return data;
}

async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = "./index.html";
    throw new Error("로그인이 필요합니다.");
  }
  return user;
}

async function requireAdmin() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    alert("관리자만 접근할 수 있습니다.");
    window.location.href = "./projects.html";
    throw new Error("관리자 접근 필요");
  }
  return profile;
}

async function logoutAndGoHome() {
  await window.sb.auth.signOut();
  clearSelectedProjectId();
  window.location.href = "./index.html";
}

function bindLogoutButton() {
  const btn = qs("#logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", logoutAndGoHome);
}

function safeFileName(fileName) {
  return String(fileName || "image.jpg")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");
}

async function getSignedUrl(path, expiresIn = 3600) {
  const { data, error } = await window.sb.storage
    .from("photos")
    .createSignedUrl(path, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

async function getSignedUrlMap(paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return {};

  const { data, error } = await window.sb.storage
    .from("photos")
    .createSignedUrls(uniquePaths, 3600);

  if (error) throw error;

  const result = {};
  uniquePaths.forEach((path, index) => {
    result[path] = data[index]?.signedUrl || "";
  });

  return result;
}