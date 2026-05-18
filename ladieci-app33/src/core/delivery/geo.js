// Pure geographic helpers for delivery routing.

export const RISTORANTE_LAT = 36.7621;
export const RISTORANTE_LON = -2.6106;
export const BUFFER_OPS_DRIVER_MIN = 3;

const ROAD_FACTOR = 1.70;
const CAR_KMH = 20;
const MIN_GIRO = 8;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export function calcolaTempoGiro(lat, lon, zonaFallback = null) {
  if (lat == null || lon == null) return zonaFallback?.tempoGiro ?? 20;
  const distKm = haversineKm(RISTORANTE_LAT, RISTORANTE_LON, Number(lat), Number(lon));
  const tempoAndata = (distKm * ROAD_FACTOR / CAR_KMH) * 60;
  const tgCalcolato = Math.max(MIN_GIRO, Math.ceil(tempoAndata));
  return zonaFallback ? Math.min(tgCalcolato, zonaFallback.tempoGiro) : tgCalcolato;
}

export function pointInPolygon(point, polygon) {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
