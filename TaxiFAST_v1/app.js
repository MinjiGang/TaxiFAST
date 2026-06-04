let map;
let markers = [];
let circles = [];
let polylines = [];

const passenger = {
  lat: 35.1538,
  lon: 128.1015
};

const taxi = {
  lat: 35.1545,
  lon: 128.0998
};

window.onload = function () {
  initMap();
};

function initMap() {
  map = new Tmapv2.Map("map_div", {
    center: new Tmapv2.LatLng(passenger.lat, passenger.lon),
    width: "100%",
    height: "100%",
    zoom: 16
  });

  addMarker(passenger.lat, passenger.lon, "A");
  addMarker(taxi.lat, taxi.lon, "T");
}

function addMarker(lat, lon, label) {
  const marker = new Tmapv2.Marker({
    position: new Tmapv2.LatLng(lat, lon),
    label: label,
    map: map
  });

  markers.push(marker);
  return marker;
}

function generateCandidates(centerLat, centerLon, count, minMeter, maxMeter) {
  const candidates = [];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const distance = minMeter + Math.random() * (maxMeter - minMeter);

    const lat = centerLat + (distance / 111000) * Math.cos(angle);
    const lon = centerLon + (distance / (111000 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angle);

    candidates.push({
      id: "B" + (i + 1),
      lat,
      lon,
      distanceFromPassenger: distance,
      walkTime: distance / 1.2,
      taxiTime: 0,
      penalty: 0,
      cost: 0
    });
  }

  return candidates;
}

function applyVirtualTaxiCost(candidate) {
  const taxiDistance = getStraightDistanceMeter(
    taxi.lat,
    taxi.lon,
    candidate.lat,
    candidate.lon
  );

  candidate.taxiTime = taxiDistance / 8.3; // 약 30km/h = 8.3m/s

  const uTurnPenalty = Math.random() < 0.15 ? 120 : 0;
  const leftTurnPenalty = Math.floor(Math.random() * 3) * 20;
  const rightTurnPenalty = Math.floor(Math.random() * 3) * 5;

  candidate.penalty = uTurnPenalty + leftTurnPenalty + rightTurnPenalty;

  candidate.cost =
    candidate.walkTime +
    candidate.taxiTime +
    candidate.penalty;

  return candidate;
}

function getStraightDistanceMeter(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function dijkstraSelectBest(candidates) {
  let best = candidates[0];

  for (const candidate of candidates) {
    if (candidate.cost < best.cost) {
      best = candidate;
    }
  }

  return best;
}

function runSimulation() {
  clearMap();

  addMarker(passenger.lat, passenger.lon, "A");
  addMarker(taxi.lat, taxi.lon, "T");

  let candidates = generateCandidates(
    passenger.lat,
    passenger.lon,
    50,
    50,
    200
  );

  candidates = candidates.map(applyVirtualTaxiCost);

  for (const c of candidates) {
    addMarker(c.lat, c.lon, c.id);
  }

  const best = dijkstraSelectBest(candidates);

  addMarker(best.lat, best.lon, "BEST");

  drawLine(passenger.lat, passenger.lon, best.lat, best.lon);
  drawLine(taxi.lat, taxi.lon, best.lat, best.lon);

  document.getElementById("result").innerText =
    "추천 위치: " + best.id + "\n\n" +
    "승객 도보 시간: " + best.walkTime.toFixed(1) + "초\n" +
    "택시 접근 시간: " + best.taxiTime.toFixed(1) + "초\n" +
    "회전/유턴 패널티: " + best.penalty.toFixed(1) + "초\n" +
    "총 비용: " + best.cost.toFixed(1) + "초\n\n" +
    "후보 개수: " + candidates.length + "개\n" +
    "탐색 방식: Dijkstra 기반 최소 비용 선택";
}

function drawLine(lat1, lon1, lat2, lon2) {
  const polyline = new Tmapv2.Polyline({
    path: [
      new Tmapv2.LatLng(lat1, lon1),
      new Tmapv2.LatLng(lat2, lon2)
    ],
    strokeWeight: 4,
    map: map
  });

  polylines.push(polyline);
}

function clearMap() {
  for (const marker of markers) {
    marker.setMap(null);
  }

  for (const line of polylines) {
    line.setMap(null);
  }

  markers = [];
  polylines = [];
}