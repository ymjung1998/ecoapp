const backToProjectsBtn = qs("#backToProjectsBtn");
const goUploadBtn = qs("#goUploadBtn");
const projectNameText = qs("#projectNameText");
const photoCountText = qs("#photoCountText");
const photoList = qs("#photoList");

let myMap;

backToProjectsBtn.addEventListener("click", () => {
  window.location.href = "./projects.html";
});

goUploadBtn.addEventListener("click", () => {
  window.location.href = "./upload.html";
});

async function loadMyPhotosPage() {
  try {
    hideMessage();
    bindLogoutButton();

    const user = await requireAuth();
    const projectId = getSelectedProjectId();

    if (!projectId) {
      showMessage("선택된 프로젝트가 없습니다. 프로젝트를 다시 선택해 주세요.", "error");
      return;
    }

    myMap = createMap("map");

    const project = await fetchProject(projectId);
    projectNameText.textContent = project.name;

    const geometries = await fetchProjectGeometries(projectId);
    const photos = await fetchMyPhotos(projectId, user.id);
    const signedUrlMap = await getSignedUrlMap(photos.map(item => item.storage_path));

    const layers = renderProjectGeometries(myMap, geometries);
    const markerLayers = [];

    photos.forEach(photo => {
      const marker = createPhotoThumbnailMarker(
        myMap,
        photo,
        signedUrlMap[photo.storage_path] || ""
      );
      if (marker) markerLayers.push(marker);
    });

    fitMapToLayers(myMap, [...layers, ...markerLayers]);
    renderPhotoList(photos, signedUrlMap);
    photoCountText.textContent = `${photos.length}건`;
  } catch (error) {
    showMessage(error.message || "내 사진 페이지를 불러오지 못했습니다.", "error");
  }
}

async function fetchProject(projectId) {
  const { data, error } = await window.sb
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error) throw error;
  return data;
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

async function fetchMyPhotos(projectId, userId) {
  const { data, error } = await window.sb
    .from("photos")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("photo_taken_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderPhotoList(photos, signedUrlMap) {
  if (!photos.length) {
    photoList.innerHTML = `
      <article class="project-card">
        <p>아직 업로드한 사진이 없습니다.</p>
      </article>
    `;
    return;
  }

  photoList.innerHTML = photos.map(photo => `
    <article class="photo-card">
      <div>
        <img class="photo-thumb" src="${signedUrlMap[photo.storage_path] || ""}" alt="사진 썸네일" />
      </div>

      <div class="photo-meta">
        <h3>${escapeHtml(photo.file_name)}</h3>
        <p><strong>촬영 시간:</strong> ${escapeHtml(formatDateTime(photo.photo_taken_at))}</p>
        <p><strong>업로드 시간:</strong> ${escapeHtml(formatDateTime(photo.uploaded_at))}</p>
        <p><strong>사진 위치:</strong> ${escapeHtml(formatCoord(photo.photo_lat))}, ${escapeHtml(formatCoord(photo.photo_lng))}</p>
        <p><strong>업로드 위치:</strong> ${escapeHtml(formatCoord(photo.upload_lat))}, ${escapeHtml(formatCoord(photo.upload_lng))}</p>
        <p><strong>메모:</strong> ${escapeHtml(photo.memo || "-")}</p>
      </div>

      <div class="photo-actions">
        <button class="danger-btn delete-photo-btn" type="button" data-id="${photo.id}" data-path="${photo.storage_path}">
          삭제
        </button>
      </div>
    </article>
  `).join("");

  qsa(".delete-photo-btn").forEach(button => {
    button.addEventListener("click", async () => {
      const ok = confirm("이 사진을 삭제하시겠습니까?");
      if (!ok) return;

      try {
        hideMessage();

        const photoId = button.dataset.id;
        const storagePath = button.dataset.path;

        const { error: storageError } = await window.sb.storage
          .from("photos")
          .remove([storagePath]);

        if (storageError) throw storageError;

        const { error: deleteError } = await window.sb
          .from("photos")
          .delete()
          .eq("id", photoId);

        if (deleteError) throw deleteError;

        showMessage("사진이 삭제되었습니다.", "success");
        loadMyPhotosPage();
      } catch (error) {
        showMessage(error.message || "사진 삭제 중 오류가 발생했습니다.", "error");
      }
    });
  });
}

loadMyPhotosPage();