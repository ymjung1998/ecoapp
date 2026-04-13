function createMap(containerId) {
  const map = L.map(containerId);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  map.setView([36.5, 127.8], 7);
  return map;
}

function renderProjectGeometries(map, geometries) {
  const layers = [];

  (geometries || []).forEach(item => {
    const layer = L.geoJSON(item.geojson, {
      style: () => {
        if (item.geometry_type === "route") {
          return {
            color: "#1e6fff",
            weight: 4
          };
        }

        return {
          color: "#1e6fff",
          weight: 2,
          fillColor: "#1e6fff",
          fillOpacity: 0.12
        };
      }
    }).addTo(map);

    layers.push(layer);
  });

  return layers;
}

function fitMapToLayers(map, layers) {
  const validLayers = layers.filter(Boolean);
  if (!validLayers.length) return;

  const group = L.featureGroup(validLayers);
  const bounds = group.getBounds();

  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.12));
  }
}

function createCurrentLocationMarker(map, lat, lng) {
  return L.circleMarker([lat, lng], {
    radius: 8,
    color: "#d93025",
    fillColor: "#d93025",
    fillOpacity: 0.9
  }).addTo(map).bindPopup("현재 위치");
}

function pointInsideAllowedArea(lat, lng, geometries) {
  const point = turf.point([lng, lat]);

  const allowed = (geometries || []).some(item => {
    if (!item?.geojson) return false;
    if (!["buffer", "polygon"].includes(item.geometry_type)) return false;

    try {
      const features = item.geojson.features || [];
      return features.some(feature => turf.booleanPointInPolygon(point, feature));
    } catch (error) {
      return false;
    }
  });

  return allowed;
}

function createPhotoThumbnailMarker(map, photo, signedUrl, extraHtml = "") {
  if (!photo.photo_lat || !photo.photo_lng || !signedUrl) return null;

  const thumbHtml = `
    <div class="map-thumb-marker">
      <img src="${signedUrl}" alt="사진 썸네일" />
    </div>
  `;

  const icon = L.divIcon({
    html: thumbHtml,
    className: "custom-thumb-icon",
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    popupAnchor: [0, -24]
  });

  const marker = L.marker([photo.photo_lat, photo.photo_lng], { icon }).addTo(map);

  const popupHtml = `
    <div>
      <img class="popup-thumb" src="${signedUrl}" alt="썸네일" />
      <div><strong>${escapeHtml(photo.file_name || "사진")}</strong></div>
      ${extraHtml}
      <div>촬영: ${escapeHtml(formatDateTime(photo.photo_taken_at))}</div>
      <div>위치: ${escapeHtml(formatCoord(photo.photo_lat))}, ${escapeHtml(formatCoord(photo.photo_lng))}</div>
    </div>
  `;

  marker.bindPopup(popupHtml);
  return marker;
}