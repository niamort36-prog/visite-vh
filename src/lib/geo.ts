/** Distance orthodromique en kilomètres. */
export function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371.0088;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function km(v: number, decimales = 1): string {
  return `${v.toFixed(decimales).replace('.', ',')} km`;
}

export function octets(v: number): string {
  if (v > 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',')} Mo`;
  if (v > 1e3) return `${Math.round(v / 1e3)} ko`;
  return `${v} o`;
}

export function dateCourte(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Conversion tuile ⇄ coordonnées, pour le pré-téléchargement des fonds de carte. */
export function tuilesPourBbox(
  bbox: [number, number, number, number],
  zMin: number,
  zMax: number,
): { z: number; x: number; y: number }[] {
  const [s, w, n, e] = bbox;
  const out: { z: number; x: number; y: number }[] = [];
  for (let z = zMin; z <= zMax; z++) {
    const nTiles = 2 ** z;
    const lon2x = (lon: number) => Math.floor(((lon + 180) / 360) * nTiles);
    const lat2y = (lat: number) => {
      const r = (lat * Math.PI) / 180;
      return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * nTiles);
    };
    const x0 = lon2x(w);
    const x1 = lon2x(e);
    const y0 = lat2y(n);
    const y1 = lat2y(s);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}
