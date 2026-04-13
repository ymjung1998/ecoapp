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
      style: feature => {
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
  const group = L.featureGroup(layers.filter(Boolean));
  if (layers.length) {
    map.fitBounds(group.getBounds().pad(0.12));
  }
}

function createPhotoMarker(map, photo, signedUrl, extraHtml = "") {
  if (!photo.photo_lat || !photo.photo_lng) return null;

  const marker = L.marker([photo.photo_lat, photo.photo_lng]).addTo(map);

  const popupHtml = `
    <div>
      ${signedUrl ? `<img class="popup-thumb" src="${signedUrl}" alt="썸네일" />` : ""}
      <div><strong>${escapeHtml(photo.file_name || "사진")}</strong></div>
      ${extraHtml}
      <div>촬영: ${escapeHtml(formatDateTime(photo.photo_taken_at))}</div>
      <div>위치: ${escapeHtml(formatCoord(photo.photo_lat))}, ${escapeHtml(formatCoord(photo.photo_lng))}</div>
    </div>
  `;

  marker.bindPopup(popupHtml);
  return marker;
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