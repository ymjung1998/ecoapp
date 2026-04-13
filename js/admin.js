const projectSelect = qs("#projectSelect");
const userSelect = qs("#userSelect");
const startDateInput = qs("#startDate");
const endDateInput = qs("#endDate");

const loadBtn = qs("#loadBtn");
const downloadCsvBtn = qs("#downloadCsvBtn");
const downloadZipBtn = qs("#downloadZipBtn");

const adminCountText = qs("#adminCountText");
const adminPhotoList = qs("#adminPhotoList");
const goProjectsBtn = qs("#goProjectsBtn");

let adminMap;
let adminRows = [];
let currentProjectGeometries = [];

goProjectsBtn.addEventListener("click", () => {
  window.location.href = "./projects.html";
});

loadBtn.addEventListener("click", loadAdminProjectData);
downloadCsvBtn.addEventListener("click", downloadCsv);
downloadZipBtn.addEventListener("click", downloadZip);

projectSelect.addEventListener("change", async () => {
  await loadUserOptionsByProject();
});

async function initAdminPage() {
  try {
    hideMessage();
    bindLogoutButton();
    await requireAuth();
    await requireAdmin();

    adminMap = createMap("map");
    await loadProjectOptions();
  } catch (error) {
    showMessage(error.message || "관리자 페이지를 불러오지 못했습니다.", "error");
  }
}

async function loadProjectOptions() {
  const { data, error } = await window.sb
    .from("projects")
    .select("*")
    .order("id", { ascending: true });

  if (error) throw error;

  projectSelect.innerHTML = (data || []).map(project => `
    <option value="${project.id}">${escapeHtml(project.name)}</option>
  `).join("");

  if (data?.length) {
    await loadUserOptionsByProject();
    await loadAdminProjectData();
  }
}

async function loadUserOptionsByProject() {
  try {
    const projectId = projectSelect.value;

    userSelect.innerHTML = `<option value="">전체</option>`;

    if (!projectId) return;

    const { data, error } = await window.sb
      .from("admin_photo_overview")
      .select("user_id, user_name, login_id")
      .eq("project_id", projectId)
      .order("user_name", { ascending: true });

    if (error) throw error;

    const uniqueUsers = [];
    const seen = new Set();

    (data || []).forEach(row => {
      const key = `${row.user_id}|${row.login_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueUsers.push(row);
      }
    });

    userSelect.innerHTML = `
      <option value="">전체</option>
      ${uniqueUsers.map(user => `
        <option value="${escapeHtml(user.login_id)}">
          ${escapeHtml(user.user_name)} (${escapeHtml(user.login_id)})
        </option>
      `).join("")}
    `;
  } catch (error) {
    showMessage(error.message || "주민 목록을 불러오지 못했습니다.", "error");
  }
}

async function loadAdminProjectData() {
  try {
    hideMessage();

    const projectId = projectSelect.value;
    const selectedLoginId = userSelect.value;
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    if (!projectId) return;

    currentProjectGeometries = await fetchProjectGeometries(projectId);

    let query = window.sb
      .from("admin_photo_overview")
      .select("*")
      .eq("project_id", projectId);

    if (selectedLoginId) {
      query = query.eq("login_id", selectedLoginId);
    }

    if (startDate) {
      query = query.gte("photo_taken_at", `${startDate}T00:00:00`);
    }

    if (endDate) {
      query = query.lte("photo_taken_at", `${endDate}T23:59:59`);
    }

    query = query.order("photo_taken_at", { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    adminRows = data || [];
    const signedUrlMap = await getSignedUrlMap(adminRows.map(row => row.storage_path));

    renderAdminMap(adminRows, signedUrlMap);
    renderAdminPhotoList(adminRows, signedUrlMap);
    adminCountText.textContent = `${adminRows.length}건`;
  } catch (error) {
    showMessage(error.message || "프로젝트 사진을 불러오지 못했습니다.", "error");
  }
}

async function fetchProjectGeometries(projectId) {
  const { data, error } = await window.sb
    .from("project_geometries")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (error) throw error;
  return data || [];
}

function renderAdminMap(rows, signedUrlMap) {
  adminMap.eachLayer(layer => {
    if (!(layer instanceof L.TileLayer)) {
      adminMap.removeLayer(layer);
    }
  });

  const geometryLayers = renderProjectGeometries(adminMap, currentProjectGeometries);
  const markerLayers = [];

  rows.forEach(row => {
    const marker = createPhotoThumbnailMarker(
      adminMap,
      row,
      signedUrlMap[row.storage_path] || "",
      `<div>업로더: ${escapeHtml(row.user_name)} (${escapeHtml(row.login_id)})</div>`
    );
    if (marker) markerLayers.push(marker);
  });

  fitMapToLayers(adminMap, [...geometryLayers, ...markerLayers]);
}

function renderAdminPhotoList(rows, signedUrlMap) {
  if (!rows.length) {
    adminPhotoList.innerHTML = `
      <article class="project-card">
        <p>조건에 맞는 사진이 없습니다.</p>
      </article>
    `;
    return;
  }

  adminPhotoList.innerHTML = rows.map(row => `
    <article class="photo-card">
      <div>
        <img class="photo-thumb" src="${signedUrlMap[row.storage_path] || ""}" alt="사진 썸네일" />
      </div>

      <div class="photo-meta">
        <h3>${escapeHtml(row.file_name)}</h3>
        <p><strong>업로더:</strong> ${escapeHtml(row.user_name)} (${escapeHtml(row.login_id)})</p>
        <p><strong>프로젝트:</strong> ${escapeHtml(row.project_name)}</p>
        <p><strong>촬영 시간:</strong> ${escapeHtml(formatDateTime(row.photo_taken_at))}</p>
        <p><strong>업로드 시간:</strong> ${escapeHtml(formatDateTime(row.uploaded_at))}</p>
        <p><strong>사진 위치:</strong> ${escapeHtml(formatCoord(row.photo_lat))}, ${escapeHtml(formatCoord(row.photo_lng))}</p>
        <p><strong>업로드 위치:</strong> ${escapeHtml(formatCoord(row.upload_lat))}, ${escapeHtml(formatCoord(row.upload_lng))}</p>
        <p><strong>메모:</strong> ${escapeHtml(row.memo || "-")}</p>
      </div>

      <div class="photo-actions">
        <a class="primary-btn" href="${signedUrlMap[row.storage_path] || "#"}" target="_blank" rel="noopener noreferrer">이미지 열기</a>
      </div>
    </article>
  `).join("");
}

async function downloadCsv() {
  try {
    if (!adminRows.length) {
      showMessage("다운로드할 사진 데이터가 없습니다.", "error");
      return;
    }

    const signedUrlMap = await getSignedUrlMap(adminRows.map(row => row.storage_path));

    const headers = [
      "photo_id",
      "project_id",
      "project_name",
      "user_id",
      "user_name",
      "login_id",
      "file_name",
      "storage_path",
      "signed_url",
      "memo",
      "photo_lat",
      "photo_lng",
      "photo_taken_at",
      "upload_lat",
      "upload_lng",
      "uploaded_at"
    ];

    const lines = [headers.join(",")];

    adminRows.forEach(row => {
      const values = [
        row.id,
        row.project_id,
        row.project_name,
        row.user_id,
        row.user_name,
        row.login_id,
        row.file_name,
        row.storage_path,
        signedUrlMap[row.storage_path] || "",
        row.memo || "",
        row.photo_lat,
        row.photo_lng,
        row.photo_taken_at,
        row.upload_lat,
        row.upload_lng,
        row.uploaded_at
      ].map(value => `"${String(value ?? "").replaceAll('"', '""')}"`);

      lines.push(values.join(","));
    });

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "filtered_photos.csv";
    a.click();

    URL.revokeObjectURL(url);
  } catch (error) {
    showMessage(error.message || "CSV 다운로드 중 오류가 발생했습니다.", "error");
  }
}

async function downloadZip() {
  try {
    if (!adminRows.length) {
      showMessage("ZIP으로 다운로드할 사진이 없습니다.", "error");
      return;
    }

    showMessage("ZIP 파일을 생성하는 중입니다. 사진 수가 많으면 시간이 걸릴 수 있습니다.", "info");

    const signedUrlMap = await getSignedUrlMap(adminRows.map(row => row.storage_path));
    const zip = new JSZip();

    const projectName = sanitizeForFileName(adminRows[0]?.project_name || "project");

    for (const row of adminRows) {
      const signedUrl = signedUrlMap[row.storage_path];
      if (!signedUrl) continue;

      const response = await fetch(signedUrl);
      if (!response.ok) continue;

      const blob = await response.blob();

      const userFolder = `${sanitizeForFileName(row.user_name)}_${sanitizeForFileName(row.login_id)}`;
      const datePart = formatDateForFileName(row.photo_taken_at || row.uploaded_at);
      const originalFileName = sanitizeForFileName(row.file_name || "image.jpg");
      const zipPath = `${projectName}/${userFolder}/${datePart}_${originalFileName}`;

      zip.file(zipPath, blob);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}_filtered_photos.zip`;
    a.click();

    URL.revokeObjectURL(url);
    showMessage("ZIP 다운로드가 준비되었습니다.", "success");
  } catch (error) {
    showMessage(error.message || "ZIP 다운로드 중 오류가 발생했습니다.", "error");
  }
}

function sanitizeForFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_");
}

function formatDateForFileName(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown_date";

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}_${hh}${mi}${ss}`;
}

initAdminPage();