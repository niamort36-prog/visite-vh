import type { Ligne, Pylone } from '../types';
import type { ReferentielRte } from './rte';
import { haversine } from '../lib/geo';

/** Distance maximale entre un pylône OSM et son homologue du référentiel, en km. */
const RAYON_KM = 0.06;

/**
 * Portion de tracé relevant d'un même ouvrage du référentiel. Un tracé continu
 * traverse souvent deux GMR — deux équipes — et le référentiel change alors de
 * code d'ouvrage : c'est la frontière où la visite d'une équipe s'arrête.
 */
export interface SectionRte {
  code: string;
  nom: string;
  cm: string;
  gmr: string;
  eel: string;
  /** rangs de pylône couverts, bornes comprises */
  du: number;
  au: number;
  /** pylônes du référentiel retrouvés sur cette section */
  ancres: number;
}

export interface RattachementLigne {
  /** code d'ouvrage RTE de la section principale */
  code: string;
  nom: string;
  cm: string;
  gmr: string;
  eel: string;
  /** sections du tracé, dans l'ordre des rangs ; une seule hors frontière */
  sections: SectionRte[];
  /** nombre de pylônes du référentiel retrouvés sur ce tracé */
  ancres: number;
  /** numéro officiel par rang de pylône : vérifié, ou interpolé entre deux vérifiés */
  numeros: Map<number, { num: string; interpole: boolean }>;
}

/** Le tracé relève-t-il, par l'une de ses sections, du secteur demandé ? */
export function couvre(
  r: RattachementLigne,
  champ: 'cm' | 'gmr' | 'eel',
  valeurs: string[],
): boolean {
  return r.sections.some((s) => valeurs.includes(s[champ]));
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
 *
 * Un tracé ne relève pas forcément d'un seul ouvrage : à la frontière entre deux
 * GMR le référentiel change de code, et ne retenir que le code majoritaire
 * amputait la ligne de sa seconde moitié — nom, rattachement et numéros. Le
 * tracé est donc découpé en sections, chacune avec sa numérotation propre.
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

    // regroupement des ancres par ouvrage : une entrée par section du tracé
    const parCode = new Map<string, number[]>();
    for (const [rang, { idx }] of trouves) {
      const c = ref.ancres[idx].c;
      const liste = parCode.get(c);
      if (liste) liste.push(rang);
      else parCode.set(c, [rang]);
    }

    /*
     * Les pylônes d'une ligne parallèle tombent parfois dans le rayon et
     * désignent un autre ouvrage : ils découperaient le tracé à tort. Une vraie
     * section de frontière occupe une plage de rangs qui lui est propre, alors
     * qu'une ligne parallèle se superpose à la section dominante — c'est ce
     * recouvrement, plus que le nombre d'ancres, qui les distingue.
     */
    const classes = [...parCode.entries()]
      .filter(([c]) => ref.liaisons[c])
      .sort((a, b) => b[1].length - a[1].length);
    if (!classes.length) continue;
    const dominant = classes[0];
    const domDu = Math.min(...dominant[1]);
    const domAu = Math.max(...dominant[1]);
    const retenus = classes.filter(([c, rangs]) => {
      if (c === dominant[0]) return true;
      if (rangs.length < 3) return false;
      const du = Math.min(...rangs);
      const au = Math.max(...rangs);
      const chevauche = Math.max(0, Math.min(au, domAu) - Math.max(du, domDu) + 1);
      return chevauche <= (au - du + 1) * 0.2;
    });

    // sections ordonnées le long du tracé
    const sections: SectionRte[] = retenus
      .map(([code, rangs]) => {
        const liaison = ref.liaisons[code];
        return {
          code,
          nom: liaison.nom,
          cm: liaison.cm,
          gmr: liaison.gmr,
          eel: liaison.eel,
          du: Math.min(...rangs),
          au: Math.max(...rangs),
          ancres: rangs.length,
        };
      })
      .sort((a, b) => a.du - b.du);

    /*
     * Les bornes ne couvrent que les pylônes retrouvés ; chaque section est
     * étendue jusqu'à mi-chemin de la suivante, de sorte que la frontière tombe
     * entre les deux derniers pylônes connus de part et d'autre.
     */
    sections[0].du = l.pylones[0]?.i ?? sections[0].du;
    sections[sections.length - 1].au =
      l.pylones[l.pylones.length - 1]?.i ?? sections[sections.length - 1].au;
    for (let k = 1; k < sections.length; k++) {
      const frontiere = Math.floor((sections[k - 1].au + sections[k].du) / 2);
      sections[k - 1].au = frontiere;
      sections[k].du = frontiere + 1;
    }

    /*
     * Numérotation section par section : les rangs d'une section ne sont jamais
     * renumérotés d'après les ancres d'une autre, dont la numérotation repart.
     */
    const numeros = new Map<number, { num: string; interpole: boolean }>();
    let ancresTotal = 0;
    for (const [, rangs] of retenus) {
      const verifies: { rang: number; num: number }[] = [];
      for (const rang of rangs) {
        const a = ref.ancres[trouves.get(rang)!.idx];
        numeros.set(rang, { num: a.n, interpole: false });
        const n = Number(a.n);
        if (Number.isFinite(n)) verifies.push({ rang, num: n });
      }
      ancresTotal += rangs.length;

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
    }
    if (!numeros.size) continue;

    const principale = sections.reduce((a, b) => (b.ancres > a.ancres ? b : a));
    out.set(l.id, {
      code: principale.code,
      nom: principale.nom,
      cm: principale.cm,
      gmr: principale.gmr,
      eel: principale.eel,
      sections,
      ancres: ancresTotal,
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
  /** tracés partagés avec une autre équipe, donc coupés par une frontière */
  lignesFrontieres: number;
  gmr: string[];
  cm: string[];
}

export function bilan(rattachements: Map<string, RattachementLigne>): BilanAppariement {
  let ancres = 0;
  let officiels = 0;
  let interpoles = 0;
  let frontieres = 0;
  const gmr = new Set<string>();
  const cm = new Set<string>();
  for (const r of rattachements.values()) {
    ancres += r.ancres;
    for (const n of r.numeros.values()) if (n.interpole) interpoles++;
      else officiels++;
    if (r.sections.length > 1) frontieres++;
    for (const s of r.sections) {
      if (s.gmr) gmr.add(s.gmr);
      if (s.cm) cm.add(s.cm);
    }
  }
  return {
    lignes: rattachements.size,
    ancresPlacees: ancres,
    numerosOfficiels: officiels,
    numerosInterpoles: interpoles,
    lignesFrontieres: frontieres,
    gmr: [...gmr].sort(),
    cm: [...cm].sort(),
  };
}
