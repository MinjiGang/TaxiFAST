let map;
let markers = [];
let circles = [];
let polylines = [];
const TMAP_API_KEY = "zDKuxKrvNq5CnzUDpGFUy3AidWG84exu9ufMwPyt";

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
  if (typeof Tmapv2 === "undefined") {
    const el = document.getElementById("map_div");
    if (el) {
      el.innerText = "지도 로드에 실패했습니다. 콘솔과 네트워크(스크립트 로드)를 확인하세요.";
      el.style.display = "flex";
      el.style.alignItems = "center";
      el.style.justifyContent = "center";
      el.style.background = "#f8d7da";
      el.style.color = "#721c24";
    }
    console.error("Tmapv2 is undefined. Tmap 스크립트가 로드되지 않았습니다.");
    return;
  }

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

async function applyTmapCost(candidate) {
  const walkRoute = await getTmapPedestrianRoute(passenger, candidate);
  const carRoute = await getTmapCarRoute(taxi, candidate);

  // API 실패 시 직선거리 기반 기본값 사용
  if (!walkRoute) {
    const walkDist = getStraightDistanceMeter(passenger.lat, passenger.lon, candidate.lat, candidate.lon);
    candidate.walkTime = walkDist / 1.2; // 시속 4.3km = 1.2m/s
    candidate.walkDistance = walkDist;
  } else {
    candidate.walkTime = walkRoute.totalTime;
    candidate.walkDistance = walkRoute.totalDistance;
  }

  if (!carRoute) {
    const carDist = getStraightDistanceMeter(taxi.lat, taxi.lon, candidate.lat, candidate.lon);
    candidate.taxiTime = carDist / 8.3; // 시속 30km = 8.3m/s
    candidate.taxiDistance = carDist;
  } else {
    candidate.taxiTime = carRoute.totalTime;
    candidate.taxiDistance = carRoute.totalDistance;
  }

  candidate.valid = true;

  // 교통량 계산
  const freeFlowSpeed = 13.9; // 약 50km/h = 13.9m/s
  const freeFlowTime = candidate.taxiDistance / freeFlowSpeed;

  candidate.trafficRatio = candidate.taxiTime / freeFlowTime;

  // 교통 혼잡 패널티
  if (candidate.trafficRatio >= 2.0) {
    candidate.trafficPenalty = 120;
  } else if (candidate.trafficRatio >= 1.5) {
    candidate.trafficPenalty = 60;
  } else {
    candidate.trafficPenalty = 0;
  }

  // 일단 회전 패널티는 기존처럼 임시값
  const uTurnPenalty = Math.random() < 0.15 ? 120 : 0;
  const leftTurnPenalty = Math.floor(Math.random() * 3) * 20;
  const rightTurnPenalty = Math.floor(Math.random() * 3) * 5;

  candidate.turnPenalty =
    uTurnPenalty +
    leftTurnPenalty +
    rightTurnPenalty;

  candidate.penalty =
    candidate.trafficPenalty +
    candidate.turnPenalty;

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

function buildGraph(candidates) {
  const graph = {};

  graph["START"] = [];

  for (const c of candidates) {
    graph["START"].push({
      node: c.id,
      weight: c.cost
    });

    graph[c.id] = [];
  }

  return graph;
}

function dijkstraSelectBest(candidates) {
  const graph = buildGraph(candidates);

  const distances = {};
  const visited = new Set();

  distances["START"] = 0;

  for (const c of candidates) {
    distances[c.id] = Infinity;
  }

  while (true) {
    let currentNode = null;
    let minDistance = Infinity;

    for (const node in distances) {
      if (!visited.has(node) && distances[node] < minDistance) {
        minDistance = distances[node];
        currentNode = node;
      }
    }

    if (currentNode === null) break;

    visited.add(currentNode);

    for (const edge of graph[currentNode] || []) {
      const newDistance = distances[currentNode] + edge.weight;

      if (newDistance < distances[edge.node]) {
        distances[edge.node] = newDistance;
      }
    }
  }

  let best = candidates[0];

  for (const c of candidates) {
    if (distances[c.id] < distances[best.id]) {
      best = c;
    }
  }

  best.dijkstraCost = distances[best.id];

  return best;
}

function generateFourCandidates(A) {
  return [
    {
      id: "current",
      name: "현위치",
      lat: A.lat,
      lon: A.lon,
      walkTime: 0,
      taxiTime: 0,
      penalty: 0,
      cost: 0
    },
    {
      id: "opposite",
      name: "건너편",
      lat: A.lat + 0.00018,
      lon: A.lon,
      walkTime: 0,
      taxiTime: 0,
      penalty: 0,
      cost: 0
    },
    {
      id: "front",
      name: "50m앞",
      lat: A.lat + 0.00045,
      lon: A.lon,
      walkTime: 0,
      taxiTime: 0,
      penalty: 0,
      cost: 0
    },
    {
      id: "back",
      name: "50m뒤",
      lat: A.lat - 0.00045,
      lon: A.lon,
      walkTime: 0,
      taxiTime: 0,
      penalty: 0,
      cost: 0
    }
  ];
}

async function runSimulation() {
  clearMap();

  addMarker(passenger.lat, passenger.lon, "A");
  addMarker(taxi.lat, taxi.lon, "T");

  drawWalkingRadius();

  const rawCandidates = generateFourCandidates(passenger);
  let candidates = await filterCandidates(rawCandidates);
  if (candidates.length === 0) {
    candidates = rawCandidates;
  }

  const costCandidates = [];

for (const c of candidates) {
  const result = await applyTmapCost(c);

  if (result.valid) {
    costCandidates.push(result);
  }
}

  candidates = costCandidates;

  if (!candidates || candidates.length === 0) {
    console.warn("유효한 후보가 없습니다. Tmap API 응답을 확인하세요.");
    document.getElementById("result").innerText = "경로를 계산할 수 있는 후보가 없습니다. Tmap API 키나 네트워크 상태를 확인하세요.";
    return;
  }

  for (const c of candidates) {
    addMarker(c.lat, c.lon, c.name || c.id);
  }

  const best = dijkstraSelectBest(candidates);

  const bestCandidateIndex = candidates.findIndex(c => c.id === best.id);
  const bestMarkerIndex = 2 + bestCandidateIndex; // 0:A, 1:T, 2부터 후보 마커들
  if (markers[bestMarkerIndex]) {
    markers[bestMarkerIndex].setMap(null);
  }

  new Tmapv2.Marker({
    position: new Tmapv2.LatLng(best.lat, best.lon),
    iconHTML: `
      <div style="
        background:#ff3333;
        color:white;
        padding:10px 14px;
        border-radius:999px;
        font-weight:bold;
        font-size:14px;
        border:3px solid white;
        box-shadow:0 0 12px rgba(255,0,0,.7);
      ">
        BEST
      </div>
    `,
    map: map
  });

  await drawTmapPedestrianRoute(passenger, best);
  await drawTmapCarRoute(taxi, best);

  const displayName = best.name ? `${best.name} (${best.id})` : best.id;
  const currentRoute = await getTmapCarRoute(taxi, passenger);
  const currentCallCost = currentRoute ? currentRoute.totalTime : 0;

  const savedTime = currentCallCost - best.cost;
  const savedPercent = (savedTime / currentCallCost) * 100;

  document.getElementById("result").innerText =
    "===== 추천 결과 =====\n\n" +
    "현재 승객 위치 : A\n" +
    "추천 승차 위치 : " + displayName + "\n\n" +
    "【현재 위치에서 호출】\n" +
    "택시 예상 도착 시간 : " +
    currentCallCost.toFixed(1) +
    "초\n\n" +
    "【추천 위치 이용 시】\n" +
    "승객 도보 시간 : " +
    best.walkTime.toFixed(1) +
    "초\n" +
    "택시 도착 시간 : " +
    best.taxiTime.toFixed(1) +
    "초\n" +
    "유턴/회전 패널티 : " +
    best.penalty.toFixed(1) +
    "초\n" +
    "총 소요 시간 : " +
    best.cost.toFixed(1) +
    "초\n\n" +
    "【개선 효과】\n" +
    "절약 시간 : " +
    savedTime.toFixed(1) +
    "초\n" +
    "개선율 : " +
    savedPercent.toFixed(1) +
    "%\n\n" +
    "【선정 이유】\n" +
    displayName +
    " 위치가 후보 " +
    candidates.length +
    "개 중 가장 낮은 비용을 가져 선택되었습니다.\n\n" +
    "【비용 계산식】\n" +
    "비용 = 도보 시간 + 택시 도착 시간 + 유턴/회전 패널티\n\n" +
    "【탐색 정보】\n" +
    "후보 위치 수 : " +
    candidates.length +
    "개\n" +
    "도보 가능 반경 : 200m\n" +
    "탐색 알고리즘 : Dijkstra 기반 최소 비용 탐색";
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
    if (marker && typeof marker.setMap === "function") {
      marker.setMap(null);
    } else {
      console.warn("clearMap: skipping invalid marker", marker);
    }
  }

  for (const line of polylines) {
    if (line && typeof line.setMap === "function") {
      line.setMap(null);
    } else {
      console.warn("clearMap: skipping invalid polyline", line);
    }
  }

  for (const circle of circles) {
    if (circle && typeof circle.setMap === "function") {
      circle.setMap(null);
    } else {
      console.warn("clearMap: skipping invalid circle", circle);
    }
  }

  markers = [];
  polylines = [];
  circles = [];
}

function drawWalkingRadius() {
  const circle = new Tmapv2.Circle({
    center: new Tmapv2.LatLng(passenger.lat, passenger.lon),
    radius: 200,
    strokeColor: "#0066ff",
    strokeWeight: 3,
    strokeOpacity: 0.8,
    fillColor: "#0066ff",
    fillOpacity: 0.12,
    map: map
  });

  circles.push(circle);
}



async function filterCandidates(rawCandidates) {

  const filtered = [];

  for (const point of rawCandidates) {

    const road = await findNearestRoad(point.lat, point.lon);

    if (!road) continue;

    // 도로에서 30m 이상 떨어지면 제외
    if (road.distance > 30) continue;

    filtered.push(point);
  }

  return filtered;
}

async function findNearestRoad(lat, lon) {

  try {

    const response = await fetch(
      `https://apis.openapi.sk.com/tmap/geo/reversegeocoding?version=1&lat=${lat}&lon=${lon}`,
      {
        method: "GET",
        headers: {
          "appKey": TMAP_API_KEY
        }
      }
    );

    const data = await response.json();

    if (!data) return null;

    return {
      distance: 0
    };

  } catch (e) {

    console.log(e);

    return null;
  }
}

async function drawTmapPedestrianRoute(start, end) {
  const route = await getTmapPedestrianRoute(start, end);
  if (!route || !route.path || route.path.length === 0) {
    console.warn("보행자 경로를 그릴 수 없습니다.", start, end);
    return null;
  }

  const path = route.path.map(point => new Tmapv2.LatLng(point.lat, point.lon));
  const polyline = new Tmapv2.Polyline({
    path,
    strokeColor: "#0066ff",
    strokeWeight: 3,
    strokeOpacity: 0.7,
    map: map
  });

  polylines.push(polyline);
  return polyline;
}

async function drawTmapCarRoute(start, end) {
  const route = await getTmapCarRoute(start, end);
  if (!route || !route.path || route.path.length === 0) {
    console.warn("자동차 경로를 그릴 수 없습니다.", start, end);
    return null;
  }

  const path = route.path.map(point => new Tmapv2.LatLng(point.lat, point.lon));
  const polyline = new Tmapv2.Polyline({
    path,
    strokeColor: "#ff6600",
    strokeWeight: 3,
    strokeOpacity: 0.7,
    map: map
  });

  polylines.push(polyline);
  return polyline;
}

async function getTmapCarRoute(start, end) {
  try {
    const response = await fetch(
      "https://apis.openapi.sk.com/tmap/routes?version=1&format=json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "appKey": TMAP_API_KEY
        },
        body: JSON.stringify({
          startX: start.lon.toString(),
          startY: start.lat.toString(),
          endX: end.lon.toString(),
          endY: end.lat.toString(),
          reqCoordType: "WGS84GEO",
          resCoordType: "WGS84GEO",
          searchOption: "0"
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data || !data.features) {
      console.error('자동차 경로 API 응답 오류:', response.status, data);
      return null;
    }

    let path = [];
    let totalTime = 0;
    let totalDistance = 0;

    data.features.forEach(feature => {
      if (feature.geometry && feature.geometry.type === "LineString") {
        feature.geometry.coordinates.forEach(coord => {
          path.push({
            lon: coord[0],
            lat: coord[1]
          });
        });
      }

      if (feature.properties && feature.properties.totalTime) {
        totalTime = feature.properties.totalTime;
      }

      if (feature.properties && feature.properties.totalDistance) {
        totalDistance = feature.properties.totalDistance;
      }
    });

    return {
      path,
      totalTime,
      totalDistance
    };

  } catch (error) {
    console.error("자동차 경로 API 오류:", error);
    return null;
  }
}


async function getTmapPedestrianRoute(start, end) {
  try {
    const response = await fetch(
      "https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "appKey": TMAP_API_KEY
        },
        body: JSON.stringify({
          startX: start.lon.toString(),
          startY: start.lat.toString(),
          endX: end.lon.toString(),
          endY: end.lat.toString(),
          startName: "출발지",
          endName: "도착지",
          reqCoordType: "WGS84GEO",
          resCoordType: "WGS84GEO"
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.features) {
      console.error("보행자 경로 API 응답 오류:", data);
      return null;
    }

    let path = [];
    let totalTime = 0;
    let totalDistance = 0;

    data.features.forEach(feature => {
      if (feature.geometry && feature.geometry.type === "LineString") {
        feature.geometry.coordinates.forEach(coord => {
          path.push({
            lon: coord[0],
            lat: coord[1]
          });
        });
      }

      if (feature.properties && feature.properties.totalTime) {
        totalTime = feature.properties.totalTime;
      }

      if (feature.properties && feature.properties.totalDistance) {
        totalDistance = feature.properties.totalDistance;
      }
    });

    return {
      path,
      totalTime,
      totalDistance
    };

  } catch (error) {
    console.error("보행자 경로 API 오류:", error);
    return null;
  }
}

