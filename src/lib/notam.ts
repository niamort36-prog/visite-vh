import type { Aerodrome, Ligne } from '../types';
import { haversine } from './geo';

/** Distance d'un point à un segment, en km (approximation plane, suffisante ici). */
function distancePointSegment(
  p: { lat: number; lon: number },
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  // à ces latitudes, un degré de longitude vaut cos(lat) degré de latitude
  const k = Math.cos((p.lat * Math.PI) / 180);
  const px = p.lon * k;
  const py = p.lat;
  const ax = a.lon * k;
  const ay = a.lat;
  const bx = b.lon * k;
  const by = b.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const proche = { lat: ay + t * dy, lon: (ax + t * dx) / k };
  return haversine(p, proche);
}

/** Distance d'un aérodrome au tracé d'une ligne, en km. */
export function distanceAuTrace(a: Aerodrome, geom: [number, number][]): number {
  let min = Infinity;
  for (let i = 1; i < geom.length; i++) {
    const d = distancePointSegment(
      { lat: a.y, lon: a.x },
      { lat: geom[i - 1][0], lon: geom[i - 1][1] },
      { lat: geom[i][0], lon: geom[i][1] },
    );
    if (d < min) min = d;
    if (min === 0) break;
  }
  return min;
}

export interface TerrainConcerne {
  aerodrome: Aerodrome;
  /** distance au plus proche des tracés retenus, en km */
  distance: number;
  /** libellés des ouvrages qui passent dans le rayon */
  lignes: string[];
}

/**
 * Terrains dont l'emprise est traversée ou frôlée par les ouvrages planifiés.
 * Seuls les terrains porteurs d'un code OACI sont retenus : ce sont eux qui font
 * l'objet de NOTAM.
 */
export function terrainsConcernes(
  aerodromes: Aerodrome[],
  lignes: { nom: string; geom: [number, number][] }[],
  rayonKm: number,
): TerrainConcerne[] {
  if (!lignes.length) return [];

  // emprise globale élargie du rayon, pour écarter d'emblée l'essentiel des terrains
  let s = 90;
  let w = 180;
  let n = -90;
  let e = -180;
  for (const l of lignes)
    for (const [lat, lon] of l.geom) {
      if (lat < s) s = lat;
      if (lat > n) n = lat;
      if (lon < w) w = lon;
      if (lon > e) e = lon;
    }
  const margeLat = rayonKm / 111;
  const margeLon = rayonKm / (111 * Math.max(Math.cos((((s + n) / 2) * Math.PI) / 180), 0.1));

  const parCode = new Map<string, TerrainConcerne>();
  for (const a of aerodromes) {
    if (!a.c) continue;
    if (a.y < s - margeLat || a.y > n + margeLat || a.x < w - margeLon || a.x > e + margeLon)
      continue;
    for (const l of lignes) {
      const d = distanceAuTrace(a, l.geom);
      if (d > rayonKm) continue;
      const existant = parCode.get(a.c);
      if (existant) {
        existant.distance = Math.min(existant.distance, d);
        if (!existant.lignes.includes(l.nom)) existant.lignes.push(l.nom);
      } else {
        parCode.set(a.c, { aerodrome: a, distance: d, lignes: [l.nom] });
      }
    }
  }
  return [...parCode.values()].sort((x, y) => x.distance - y.distance);
}

/** Retrouve les tracés des ouvrages planifiés parmi les lignes chargées. */
export function tracesDesVols(
  ligneIds: string[],
  lignes: Ligne[],
): { nom: string; geom: [number, number][] }[] {
  const parId = new Map(lignes.map((l) => [l.id, l]));
  const out: { nom: string; geom: [number, number][] }[] = [];
  for (const id of ligneIds) {
    const l = parId.get(id);
    if (l) out.push({ nom: l.nom, geom: l.geom });
  }
  return out;
}

/** Service officiel de consultation des NOTAM en France (DGAC). */
export const URL_SOFIA = 'https://sofia-briefing.aviation-civile.gouv.fr/';

/** Libellé du type de terrain. */
export function typeTerrain(t: string): string {
  switch (t) {
    case 'large_airport':
      return 'grand aérodrome';
    case 'medium_airport':
      return 'aérodrome';
    case 'small_airport':
      return 'petit aérodrome';
    case 'heliport':
      return 'hélistation';
    case 'seaplane_base':
      return 'hydrobase';
    default:
      return t;
  }
}
