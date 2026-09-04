import { unzipSync, strFromU8 } from 'fflate';

/**
 * Référentiel RTE importé par l'exploitant : liaisons, rattachement CM / GMR / EEL
 * et pylônes géolocalisés portant leur numéro officiel.
 *
 * Ces données ne sont pas publiées avec l'application : le fichier est lu dans le
 * navigateur, conservé localement et repris dans l'export du suivi.
 */

/** Rattachement d'exploitation, du centre de maintenance à l'équipe. */
export interface ZoneRte {
  /** centre de maintenance (« plaque ») */
  cm: string;
  gmr: string;
  eel: string;
}

/** Un pylône de référence : position exacte, numéro officiel et équipe. */
export interface AncreRte {
  /** code d'ouvrage RTE, ex. A.COML61MTCRO */
  c: string;
  /** numéro officiel du pylône sur la liaison */
  n: string;
  lat: number;
  lon: number;
  /**
   * Rang dans la table des zones. Le rattachement est porté par le pylône et
   * non par l'ouvrage : une liaison change d'équipe en cours de route, et c'est
   * précisément là que passe la frontière de visite.
   */
  z: number;
}

export interface LiaisonRte extends ZoneRte {
  code: string;
  nom: string;
}

export interface ReferentielRte {
  importeLe: string;
  /** nom du fichier d'origine, pour mémoire */
  source: string;
  liaisons: Record<string, LiaisonRte>;
  /** zones distinctes rencontrées, référencées par les ancres */
  zones: ZoneRte[];
  ancres: AncreRte[];
}

/** Zone d'une ancre, avec repli sur celle de la liaison pour un import ancien. */
export function zoneAncre(r: ReferentielRte, a: AncreRte): ZoneRte {
  return r.zones?.[a.z] ?? r.liaisons[a.c] ?? { cm: '', gmr: '', eel: '' };
}

/* ------------------------------------------------------------------ */
/* Lecture du fichier                                                  */
/* ------------------------------------------------------------------ */

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function indiceColonne(ref: string): number {
  const lettres = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Extrait les lignes d'un classeur .xlsx sans dépendance lourde. */
function lireXlsx(donnees: Uint8Array): string[][] {
  const zip = unzipSync(donnees);
  const fichier = (nom: string) => (zip[nom] ? strFromU8(zip[nom]) : '');

  // chaînes partagées : une cellule texte n'y renvoie que son index
  const partagees: string[] = [];
  const ssXml = fichier('xl/sharedStrings.xml');
  for (const si of ssXml.split('<si>').slice(1)) {
    const bloc = si.split('</si>')[0];
    const morceaux = [...bloc.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    partagees.push(morceaux.join(''));
  }

  // première feuille déclarée dans le classeur
  const nomFeuille =
    Object.keys(zip).find((n) => /^xl\/worksheets\/sheet1\.xml$/.test(n)) ??
    Object.keys(zip).find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
  if (!nomFeuille) throw new Error('classeur illisible : aucune feuille trouvée');

  const xml = fichier(nomFeuille);
  const lignes: string[][] = [];
  for (const row of xml.split('<row ').slice(1)) {
    const bloc = row.split('</row>')[0];
    const cellules: string[] = [];
    for (const m of bloc.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const [, ref, attrs, contenu] = m;
      const type = attrs.match(/t="([^"]+)"/)?.[1];
      const v = contenu.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const inline = contenu.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/)?.[1];
      let valeur = '';
      if (type === 's' && v != null) valeur = partagees[Number(v)] ?? '';
      else if (type === 'inlineStr' && inline != null) valeur = decodeXml(inline);
      else if (v != null) valeur = decodeXml(v);
      cellules[indiceColonne(ref)] = valeur;
    }
    lignes.push(cellules);
  }
  return lignes;
}

/** Découpe une ligne CSV en respectant les guillemets. */
function champsCsv(ligne: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (q && ligne[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === sep && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function lireCsv(texte: string): string[][] {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return [];
  const sep = (lignes[0].match(/;/g)?.length ?? 0) > (lignes[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  return lignes.map((l) => champsCsv(l, sep));
}

/* ------------------------------------------------------------------ */
/* Interprétation des colonnes                                         */
/* ------------------------------------------------------------------ */

function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Retrouve une colonne par son intitulé, quelles que soient casse et accents. */
function colonne(entete: string[], ...candidats: string[]): number {
  const norm = entete.map(normalise);
  for (const c of candidats) {
    const i = norm.indexOf(normalise(c));
    if (i >= 0) return i;
  }
  // repli : correspondance partielle
  for (const c of candidats) {
    const n = normalise(c);
    const i = norm.findIndex((x) => x.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

/** Coordonnées « [2.5187,50.2771] » → { lat, lon }. */
function coordGps(v: string): { lat: number; lon: number } | null {
  const m = v.match(/-?\d+(?:[.,]\d+)?/g);
  if (!m || m.length < 2) return null;
  const lon = Number(m[0].replace(',', '.'));
  const lat = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // le fichier RTE donne l'ordre longitude puis latitude
  return { lat, lon };
}

export class ErreurImport extends Error {}

/** Construit le référentiel à partir du fichier choisi par l'exploitant. */
export async function lireReferentiel(fichier: File): Promise<ReferentielRte> {
  const nom = fichier.name.toLowerCase();
  let lignes: string[][];
  if (nom.endsWith('.xlsx') || nom.endsWith('.xlsm')) {
    lignes = lireXlsx(new Uint8Array(await fichier.arrayBuffer()));
  } else if (nom.endsWith('.csv') || nom.endsWith('.txt')) {
    lignes = lireCsv(await fichier.text());
  } else {
    throw new ErreurImport('Format non reconnu : attendu .xlsx ou .csv.');
  }
  if (lignes.length < 2) throw new ErreurImport('Le fichier ne contient aucune donnée.');

  const entete = lignes[0].map((x) => x ?? '');
  const iCm = colonne(entete, 'CM');
  const iGmr = colonne(entete, 'GMR');
  const iEel = colonne(entete, 'EEL');
  const iCode = colonne(entete, 'Code Liaison', 'code_ligne', 'code');
  const iNom = colonne(entete, 'Nom liaison', 'nom_ligne', 'nom');
  const iNum = colonne(entete, 'Numéro Pylône de la liaison', 'numero pylone', 'pylone');
  const iGps = colonne(entete, 'Coord GPS', 'gps');

  const manquantes: string[] = [];
  if (iCode < 0) manquantes.push('Code Liaison');
  if (iNum < 0) manquantes.push('Numéro Pylône');
  if (iGps < 0) manquantes.push('Coord GPS');
  if (manquantes.length) {
    throw new ErreurImport(
      `Colonnes introuvables : ${manquantes.join(', ')}. ` +
        `Colonnes lues : ${entete.filter(Boolean).join(', ')}.`,
    );
  }

  const liaisons: Record<string, LiaisonRte> = {};
  const zones: ZoneRte[] = [];
  const rangZone = new Map<string, number>();
  const ancres: AncreRte[] = [];
  let ignorees = 0;

  for (const r of lignes.slice(1)) {
    const code = (r[iCode] ?? '').trim();
    if (!code) continue;
    const g = coordGps(r[iGps] ?? '');
    if (!g) {
      ignorees++;
      continue;
    }
    const cm = (iCm >= 0 ? r[iCm] : '')?.trim() ?? '';
    const gmr = (iGmr >= 0 ? r[iGmr] : '')?.trim() ?? '';
    const eel = (iEel >= 0 ? r[iEel] : '')?.trim() ?? '';
    // les zones se répètent d'un pylône à l'autre : on les référence plutôt
    // que de les recopier des centaines de milliers de fois
    const k = `${cm}|${gmr}|${eel}`;
    let z = rangZone.get(k);
    if (z === undefined) {
      z = zones.length;
      zones.push({ cm, gmr, eel });
      rangZone.set(k, z);
    }
    if (!liaisons[code]) liaisons[code] = { code, nom: (r[iNom] ?? '').trim(), cm, gmr, eel };
    ancres.push({
      c: code,
      n: (r[iNum] ?? '').trim(),
      lat: Math.round(g.lat * 1e5) / 1e5,
      lon: Math.round(g.lon * 1e5) / 1e5,
      z,
    });
  }

  if (!ancres.length) throw new ErreurImport('Aucun pylône exploitable dans ce fichier.');
  if (ignorees > ancres.length / 2) {
    throw new ErreurImport(
      `${ignorees} lignes sans coordonnées lisibles : vérifiez la colonne « Coord GPS ».`,
    );
  }

  return {
    importeLe: new Date().toISOString(),
    source: fichier.name,
    liaisons,
    zones,
    ancres,
  };
}

/** Comptages présentés à l'exploitant après import. */
export function resumeReferentiel(r: ReferentielRte) {
  const cm = new Set<string>();
  const gmr = new Set<string>();
  // les zones font foi : une liaison qui change d'équipe en compte plusieurs
  for (const z of r.zones ?? Object.values(r.liaisons)) {
    if (z.cm) cm.add(z.cm);
    if (z.gmr) gmr.add(z.gmr);
  }
  return {
    ancres: r.ancres.length,
    liaisons: Object.keys(r.liaisons).length,
    cm: [...cm].sort(),
    gmr: [...gmr].sort(),
  };
}
