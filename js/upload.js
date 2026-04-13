const backToMyPhotosBtn = qs("#backToMyPhotosBtn");
const locationStatus = qs("#locationStatus");
const uploadBtn = qs("#uploadBtn");
const projectNameUploadText = qs("#projectNameText");
const cameraInput = qs("#cameraInput");
const galleryInput = qs("#galleryInput");
const previewImage = qs("#previewImage");
const fileInfo = qs("#fileInfo");
const memoInput = qs("#memoInput");

let uploadMap;
let selectedFile = null;
let selectedExif = null;
let selectedSourceType = null; // "camera" | "gallery"
let currentProject = null;
let currentGeometries = [];
let currentLocation = null;

backToMyPhotosBtn.addEventListener("click", () => {
  window.location.href = "./my-photos.html";
});

cameraInput.addEventListener("change", event => {
  handleFileSelected(event.target.files?.[0], "camera");
});

galleryInput.addEventListener("change", event => {
  handleFileSelected(event.target.files?.[0], "gallery");
});

uploadBtn.addEventListener("click", handleUpload);

async function loadUploadPage() {
  try {
    hideMessage();
    bindLogoutButton();
    await requireAuth();

    const projectId = getSelectedProjectId();
    if (!projectId) {
      showMessage("선택된 프로젝트가 없습니다. 프로젝트를 다시 선택해 주세요.", "error");
      return;
    }

    uploadMap = createMap("map");

    currentProject = await fetchProject(projectId);
    currentGeometries = await fetchProjectGeometries(projectId);

    projectNameUploadText.textContent = currentProject.name;

    const layers = renderProjectGeometries(uploadMap, currentGeometries);
    fitMapToLayers(uploadMap, layers);

    await loadCurrentLocation();
  } catch (error) {
    showMessage(error.message || "업로드 페이지를 불러오지 못했습니다.", "error");
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

function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 정보를 지원하지 않습니다."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      () => reject(new Error("현재 위치를 가져오지 못했습니다. 위치 권한을 허용해 주세요.")),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

async function loadCurrentLocation() {
  currentLocation = await getBrowserLocation();

  createCurrentLocationMarker(uploadMap, currentLocation.lat, currentLocation.lng);
  uploadMap.setView([currentLocation.lat, currentLocation.lng], 16);

  const inside = pointInsideAllowedArea(
    currentLocation.lat,
    currentLocation.lng,
    currentGeometries
  );

  if (inside) {
    locationStatus.textContent = "현재 위치는 프로젝트 반경 안에 있습니다. 카메라 업로드가 가능합니다.";
    showMessage("현재 위치가 프로젝트 반경 안에 있습니다. 카메라 촬영 업로드가 가능합니다.", "success");
  } else {
    locationStatus.textContent = "현재 위치는 프로젝트 반경 밖입니다. 앨범 업로드는 사진 위치가 반경 안이면 가능합니다.";
    showMessage("현재 위치가 반경 밖이어도, 앨범 사진의 EXIF 위치가 반경 안이면 업로드할 수 있습니다.", "info");
  }

  updateUploadButtonState();
}

async function handleFileSelected(file, sourceType) {
  hideMessage();
  selectedSourceType = sourceType;

  if (!file) {
    resetSelectedFileState();
    return;
  }

  try {
    selectedFile = file;

    const imageUrl = URL.createObjectURL(file);
    previewImage.src = imageUrl;
    previewImage.classList.remove("hidden");

    let exif = null;
    try {
      exif = await exifr.parse(file, {
        gps: true,
        tiff: true,
        exif: true
      });
    } catch (exifError) {
      exif = null;
    }

    const photoLat = exif?.latitude ?? null;
    const photoLng = exif?.longitude ?? null;
    const rawTakenAt = exif?.DateTimeOriginal || exif?.CreateDate || null;
    const photoTakenAt = rawTakenAt ? new Date(rawTakenAt).toISOString() : null;

    selectedExif = {
      raw: exif || null,
      photoLat,
      photoLng,
      photoTakenAt
    };

    if (sourceType === "gallery") {
      await handleGalleryFileSelection(file);
    } else {
      await handleCameraFileSelection(file);
    }

    updateUploadButtonState();
  } catch (error) {
    selectedExif = null;
    fileInfo.textContent = "사진 정보를 읽지 못했습니다.";
    showMessage(error.message || "사진 정보를 처리하는 중 오류가 발생했습니다.", "error");
    updateUploadButtonState();
  }
}

async function handleGalleryFileSelection(file) {
  if (!selectedExif?.photoLat || !selectedExif?.photoLng) {
    selectedExif = null;
    fileInfo.textContent = `파일명: ${file.name} / 위치 정보(EXIF GPS)가 없습니다.`;
    showMessage("앨범 업로드는 사진의 위치 정보(EXIF GPS)가 있어야 합니다.", "error");
    return;
  }

  if (!selectedExif?.photoTakenAt) {
    selectedExif = null;
    fileInfo.textContent = `파일명: ${file.name} / 촬영 시간 정보가 없습니다.`;
    showMessage("앨범 업로드는 사진의 촬영 시간 정보가 있어야 합니다.", "error");
    return;
  }

  const exifInside = pointInsideAllowedArea(
    selectedExif.photoLat,
    selectedExif.photoLng,
    currentGeometries
  );

  fileInfo.textContent = [
    `파일명: ${file.name}`,
    `업로드 방식: 앨범 선택`,
    `사진 위치: ${formatCoord(selectedExif.photoLat)}, ${formatCoord(selectedExif.photoLng)}`,
    `촬영 시간: ${formatDateTime(selectedExif.photoTakenAt)}`,
    `사진 위치 반경 포함 여부: ${exifInside ? "포함" : "반경 밖"}`
  ].join(" / ");

  if (exifInside) {
    showMessage("앨범 사진의 촬영 위치가 프로젝트 반경 안에 있어 업로드할 수 있습니다.", "success");
  } else {
    showMessage("앨범 사진의 촬영 위치가 프로젝트 반경 밖이어서 업로드할 수 없습니다.", "error");
  }
}

async function handleCameraFileSelection(file) {
  const currentInside = currentLocation
    ? pointInsideAllowedArea(currentLocation.lat, currentLocation.lng, currentGeometries)
    : false;

  const hasExifLocation = !!(selectedExif?.photoLat && selectedExif?.photoLng);
  const hasExifTime = !!selectedExif?.photoTakenAt;

  fileInfo.textContent = [
    `파일명: ${file.name}`,
    `업로드 방식: 카메라 촬영`,
    `현재 위치 반경 포함 여부: ${currentInside ? "포함" : "반경 밖"}`,
    `사진 EXIF 위치: ${hasExifLocation ? `${formatCoord(selectedExif.photoLat)}, ${formatCoord(selectedExif.photoLng)}` : "없음(아이폰 웹카메라에서는 정상일 수 있음)"}`,
    `사진 EXIF 촬영 시간: ${hasExifTime ? formatDateTime(selectedExif.photoTakenAt) : "없음(현재 시각으로 대체 저장 예정)"}`
  ].join(" / ");

  if (currentInside) {
    showMessage("카메라 촬영 업로드는 현재 위치 기준으로 업로드할 수 있습니다.", "success");
  } else {
    showMessage("카메라 촬영 업로드는 현재 위치가 프로젝트 반경 안에 있어야 합니다.", "error");
  }
}

function resetSelectedFileState() {
  selectedFile = null;
  selectedExif = null;
  selectedSourceType = null;
  previewImage.classList.add("hidden");
  previewImage.src = "";
  fileInfo.textContent = "선택된 파일이 없습니다.";
  updateUploadButtonState();
}

function canUploadNow() {
  if (!selectedFile || !selectedSourceType || !currentGeometries.length) {
    return false;
  }

  if (selectedSourceType === "camera") {
    if (!currentLocation) return false;

    return pointInsideAllowedArea(
      currentLocation.lat,
      currentLocation.lng,
      currentGeometries
    );
  }

  if (selectedSourceType === "gallery") {
    if (!selectedExif?.photoLat || !selectedExif?.photoLng || !selectedExif?.photoTakenAt) {
      return false;
    }

    return pointInsideAllowedArea(
      selectedExif.photoLat,
      selectedExif.photoLng,
      currentGeometries
    );
  }

  return false;
}

function updateUploadButtonState() {
  uploadBtn.disabled = !canUploadNow();
}

function getPhotoLatForSave() {
  if (selectedSourceType === "gallery") {
    return selectedExif.photoLat;
  }

  if (selectedSourceType === "camera") {
    return selectedExif?.photoLat ?? currentLocation?.lat ?? null;
  }

  return null;
}

function getPhotoLngForSave() {
  if (selectedSourceType === "gallery") {
    return selectedExif.photoLng;
  }

  if (selectedSourceType === "camera") {
    return selectedExif?.photoLng ?? currentLocation?.lng ?? null;
  }

  return null;
}

function getPhotoTakenAtForSave() {
  if (selectedSourceType === "gallery") {
    return selectedExif.photoTakenAt;
  }

  if (selectedSourceType === "camera") {
    return selectedExif?.photoTakenAt ?? new Date().toISOString();
  }

  return null;
}

async function handleUpload() {
  try {
    hideMessage();

    const user = await requireAuth();

    if (!canUploadNow()) {
      if (selectedSourceType === "camera") {
        showMessage("카메라 촬영 업로드는 현재 위치가 프로젝트 반경 안에 있어야 합니다.", "error");
      } else if (selectedSourceType === "gallery") {
        showMessage("앨범 업로드는 사진의 EXIF 위치와 촬영 시간이 필요하며, 사진 위치가 프로젝트 반경 안에 있어야 합니다.", "error");
      } else {
        showMessage("업로드 조건을 다시 확인해 주세요.", "error");
      }
      return;
    }

    const projectId = getSelectedProjectId();
    const safeName = safeFileName(selectedFile.name);
    const storagePath = `${projectId}/${user.id}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await window.sb.storage
      .from("photos")
      .upload(storagePath, selectedFile, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) throw uploadError;

    const photoLatForSave = getPhotoLatForSave();
    const photoLngForSave = getPhotoLngForSave();
    const photoTakenAtForSave = getPhotoTakenAtForSave();

    if (photoLatForSave == null || photoLngForSave == null || !photoTakenAtForSave) {
      await window.sb.storage.from("photos").remove([storagePath]);
      throw new Error("사진 저장에 필요한 위치 또는 시간 정보를 만들지 못했습니다.");
    }

    const { error: insertError } = await window.sb
      .from("photos")
      .insert({
        project_id: Number(projectId),
        user_id: user.id,
        storage_bucket: "photos",
        storage_path: storagePath,
        file_name: selectedFile.name,
        memo: memoInput.value.trim() || null,
        photo_lat: photoLatForSave,
        photo_lng: photoLngForSave,
        photo_taken_at: photoTakenAtForSave,
        upload_lat: currentLocation?.lat ?? photoLatForSave,
        upload_lng: currentLocation?.lng ?? photoLngForSave,
        exif_json: selectedExif?.raw || null
      });

    if (insertError) {
      await window.sb.storage.from("photos").remove([storagePath]);
      throw insertError;
    }

    showMessage("사진 업로드가 완료되었습니다.", "success");

    setTimeout(() => {
      window.location.href = "./my-photos.html";
    }, 600);
  } catch (error) {
    showMessage(error.message || "사진 업로드 중 오류가 발생했습니다.", "error");
  }
}

loadUploadPage();