import type { Ligne, Pylone } from '../types';
import type { ReferentielRte } from './rte';
import { haversine } from '../lib/geo';

/** Distance maximale entre un pylône OSM et son homologue du référentiel, en km. */
const RAYON_KM = 0.06;

export interface RattachementLigne {
  /** code d'ouvrage RTE */
  code: string;
  nom: string;
  cm: string;
  gmr: string;
  eel: string;
  /** nombre de pylônes du référentiel retrouvés sur ce tracé */
  ancres: number;
  /** numéro officiel par rang de pylône : vérifié, ou interpolé entre deux vérifiés */
  numeros: Map<number, { num: string; interpole: boolean }>;
}

/** Index régulier des pylônes du référentiel. */
function grille(ref: ReferentielRte, pas: number) {
  const cases = new Map<string, number[]>();
  ref.ancres.forEach((a, i) => {
    const k = `${Math.round(a.lat / pas)}_${Math.round(a.lon / pas)}`;
    const l = cases.get(k);
    if (l) l.push(i);
    else cases.set(k, [i]);
  });
  return (lat: number, lon: number) => {
    const out: number[] = [];
    const x = Math.round(lat / pas);
    const y = Math.round(lon / pas);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) out.push(...(cases.get(`${x + i}_${y + j}`) ?? []));
    return out;
  };
}

/**
 * Rattache les tracés chargés aux ouvrages du référentiel, par proximité
 * géométrique : les coordonnées RTE tombent sur les pylônes à quelques mètres.
 *
 * Aucun numéro n'est extrapolé : seuls sont retenus les pylônes effectivement
 * retrouvés, et ceux qui s'intercalent entre deux pylônes retrouvés dont l'écart
 * de rang correspond exactement à l'écart de numérotation.
 */
export function apparier(
  lignes: Ligne[],
  ref: ReferentielRte,
): Map<string, RattachementLigne> {
  const proches = grille(ref, 0.01);
  const out = new Map<string, RattachementLigne>();

  for (const l of lignes) {
    // rang de pylône → meilleure ancre trouvée
    const trouves = new Map<number, { idx: number; d: number }>();
    for (const p of l.pylones) {
      for (const idx of proches(p.lat, p.lon)) {
        const a = ref.ancres[idx];
        const d = haversine(p, a);
        if (d > RAYON_KM) continue;
        const dejaVu = trouves.get(p.i);
        if (!dejaVu || d < dejaVu.d) trouves.set(p.i, { idx, d });
      }
    }
    if (!trouves.size) continue;

    // l'ouvrage retenu est celui que désignent le plus d'ancres
    const votes = new Map<string, number>();
    for (const { idx } of trouves.values()) {
      const c = ref.ancres[idx].c;
      votes.set(c, (votes.get(c) ?? 0) + 1);
    }
    const code = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const liaison = ref.liaisons[code];
    if (!liaison) continue;

    const numeros = new Map<number, { num: string; interpole: boolean }>();
    const verifies: { rang: number; num: number }[] = [];
    for (const [rang, { idx }] of trouves) {
      const a = ref.ancres[idx];
      if (a.c !== code) continue;
      numeros.set(rang, { num: a.n, interpole: false });
      const n = Number(a.n);
      if (Number.isFinite(n)) verifies.push({ rang, num: n });
    }
    if (!numeros.size) continue;

    // interpolation strictement sûre : même écart de rang que de numérotation
    verifies.sort((x, y) => x.rang - y.rang);
    for (let k = 1; k < verifies.length; k++) {
      const a = verifies[k - 1];
      const b = verifies[k];
      const dRang = b.rang - a.rang;
      const dNum = b.num - a.num;
      if (dRang < 2 || Math.abs(dNum) !== dRang) continue;
      const sens = Math.sign(dNum);
      for (let i = 1; i < dRang; i++) {
        const rang = a.rang + i;
        if (numeros.has(rang)) continue;
        numeros.set(rang, { num: String(a.num + sens * i), interpole: true });
      }
    }

    out.set(l.id, {
      code,
      nom: liaison.nom,
      cm: liaison.cm,
      gmr: liaison.gmr,
      eel: liaison.eel,
      ancres: verifies.length || numeros.size,
      numeros,
    });
  }

  return out;
}

/**
 * Applique les numéros officiels à un tracé. Le tracé d'origine n'est pas modifié :
 * retirer le référentiel rétablit la numérotation calculée.
 */
export function appliquerNumeros(l: Ligne, r: RattachementLigne | undefined): Ligne {
  if (!r?.numeros.size) return l;
  const pylones: Pylone[] = l.pylones.map((p) => {
    const off = r.numeros.get(p.i);
    return off ? { ...p, num: off.num, numReel: true } : p;
  });
  return { ...l, pylones };
}

export interface BilanAppariement {
  lignes: number;
  ancresPlacees: number;
  numerosOfficiels: number;
  numerosInterpoles: number;
  gmr: string[];
  cm: string[];
}

export function bilan(rattachements: Map<string, RattachementLigne>): BilanAppariement {
  let ancres = 0;
  let officiels = 0;
  let interpoles = 0;
  const gmr = new Set<string>();
  const cm = new Set<string>();
  for (const r of rattachements.values()) {
    ancres += r.ancres;
    for (const n of r.numeros.values()) if (n.interpole) interpoles++;
      else officiels++;
    if (r.gmr) gmr.add(r.gmr);
    if (r.cm) cm.add(r.cm);
  }
  return {
    lignes: rattachements.size,
    ancresPlacees: ancres,
    numerosOfficiels: officiels,
    numerosInterpoles: interpoles,
    gmr: [...gmr].sort(),
    cm: [...cm].sort(),
  };
}
