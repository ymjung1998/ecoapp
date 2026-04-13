const projectSelect = qs("#projectSelect");
const loadBtn = qs("#loadBtn");
const downloadCsvBtn = qs("#downloadCsvBtn");
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
    await loadAdminProjectData();
  }
}

async function loadAdminProjectData() {
  try {
    hideMessage();

    const projectId = projectSelect.value;
    if (!projectId) return;

    currentProjectGeometries = await fetchProjectGeometries(projectId);

    const { data, error } = await window.sb
      .from("admin_photo_overview")
      .select("*")
      .eq("project_id", projectId)
      .order("photo_taken_at", { ascending: false });

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
    const marker = createPhotoMarker(
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
        <p>해당 프로젝트에 등록된 사진이 없습니다.</p>
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
    a.download = `project_${projectSelect.value}_photos.csv`;
    a.click();

    URL.revokeObjectURL(url);
  } catch (error) {
    showMessage(error.message || "CSV 다운로드 중 오류가 발생했습니다.", "error");
  }
}

initAdminPage();