#!/usr/bin/env node
/**
 * Construit les jeux de données de l'application à partir des fichiers bruts.
 *
 * Entrées  : data/raw/*.json                        (mailles Overpass / OSM)
 *            data/raw/_departements.geojson         (contours administratifs)
 *            data/raw/_odre_*.geojson               (nomenclature officielle RTE)
 * Sorties  : public/data/index.json                 (catalogue des départements)
 *            public/data/dept/<code>.json           (lignes, pylônes, postes)
 *
 * OSM fournit la géométrie (seule source nationale gratuite depuis le retrait des
 * tracés RTE de l'open data) ; ODRE fournit les codes et libellés d'ouvrage officiels.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const DEPT_DIR = path.join(OUT_DIR, 'dept');

const TENSIONS = [63, 90, 150, 225, 400];
const MIN_KV = 63;

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

const r5 = (v) => Math.round(v * 1e5) / 1e5;

function haversine(a, b) {
  const R = 6371.0088;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Tension maximale portée par le tag OSM `voltage`, en volts. */
function volts(tags = {}) {
  const vals = String(tags.voltage || '')
    .split(';')
    .map((x) => parseInt(x, 10))
    .filter(Number.isFinite);
  return vals.length ? Math.max(...vals) : 0;
}

/** Ramène une tension en volts au palier normalisé le plus proche. */
function palier(v) {
  const kv = v / 1000;
  if (kv >= 350) return 400;
  if (kv >= 200) return 225;
  if (kv >= 130) return 150;
  if (kv >= 80) return 90;
  if (kv >= 55) return 63;
  return 0;
}

function normOperateur(tags = {}) {
  // le tag `operator` d'OSM est libre : « RTE », « R.T.E. », « Électricité de France »…
  const op = String(tags.operator || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/(^|[^a-z])(rte|r\.t\.e\.?)([^a-z]|$)|reseau de transport/.test(op)) return 'RTE';
  if (op.includes('enedis') || op.includes('erdf')) return 'Enedis';
  if (op.includes('sncf')) return 'SNCF Réseau';
  if (op.includes('edf') || op.includes('electricite de france')) return 'EDF';
  return tags.operator || 'Inconnu';
}

/**
 * OSM nomme les postes « Poste électrique de X », RTE les nomme « X ».
 * On retire l'appellation générique pour obtenir le nom d'usage.
 */
function nomPropre(nom) {
  let s = String(nom || '').trim();
  s = s.replace(
    /^(poste\s+(électrique|source|de\s+transformation|de\s+répartition)|poste|sous[-\s]station(\s+sncf)?|station\s+électrique|centrale)\s+/i,
    '',
  );
  s = s.replace(/^(de\s+la|de\s+l'|d'|du|des|de)\s*/i, '');
  return s.trim();
}

/**
 * Mot le plus discriminant d'un nom de poste, pour retrouver l'ouvrage dans la
 * nomenclature ODRE malgré les variantes d'écriture (« HOSPITALET (L') »…).
 */
const MOTS_VIDES = new Set([
  'POSTE',
  'ELECTRIQUE',
  'SOUS',
  'STATION',
  'LIAISON',
  'SAINT',
  'SAINTE',
  'GRAND',
  'GRANDE',
  'PETIT',
  'PETITE',
]);
function motCle(nom) {
  const mots = cle(nom)
    .split(' ')
    .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m));
  return mots.sort((a, b) => b.length - a.length)[0] || cle(nom);
}

/** Normalisation de libellé pour l'appariement OSM ↔ ODRE. */
function cle(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* 1. Lecture et fusion des mailles Overpass                           */
/* ------------------------------------------------------------------ */

function chargerOsm() {
  const nodes = new Map();
  const ways = new Map();
  const rels = new Map();

  const fichiers = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'));

  console.log(`→ Fusion de ${fichiers.length} mailles OSM…`);
  let lus = 0;
  for (const f of fichiers) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(RAW_DIR, f), 'utf8'));
    } catch {
      console.log(`  ! maille illisible ignorée : ${f}`);
      continue;
    }
    for (const el of data.elements || []) {
      if (el.type === 'node') {
        if (!nodes.has(el.id)) nodes.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags });
        else if (el.tags && !nodes.get(el.id).tags) nodes.get(el.id).tags = el.tags;
      } else if (el.type === 'way') {
        if (!ways.has(el.id)) ways.set(el.id, { nodes: el.nodes || [], tags: el.tags || {} });
      } else if (el.type === 'relation') {
        if (!rels.has(el.id)) rels.set(el.id, { members: el.members || [], tags: el.tags || {} });
      }
    }
    if (++lus % 40 === 0) console.log(`  … ${lus}/${fichiers.length}`);
  }
  console.log(`  ✓ ${nodes.size} nœuds, ${ways.size} chemins, ${rels.size} relations`);
  return { nodes, ways, rels };
}

/* ------------------------------------------------------------------ */
/* 2. Postes                                                           */
/* ------------------------------------------------------------------ */

function extrairePostes({ nodes, ways, rels }) {
  const postes = [];

  const pousser = (id, tags, lat, lon) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    postes.push({
      id,
      nom: nomPropre(tags.name || tags['name:fr'] || ''),
      tension: volts(tags),
      operateur: normOperateur(tags),
      fonction: tags.substation || '',
      lat: r5(lat),
      lon: r5(lon),
    });
  };

  for (const [id, n] of nodes) {
    if (n.tags?.power === 'substation') pousser(`n${id}`, n.tags, n.lat, n.lon);
  }
  for (const [id, w] of ways) {
    if (w.tags.power !== 'substation') continue;
    let sLat = 0;
    let sLon = 0;
    let k = 0;
    for (const nid of w.nodes) {
      const n = nodes.get(nid);
      if (n) {
        sLat += n.lat;
        sLon += n.lon;
        k++;
      }
    }
    if (k) pousser(`w${id}`, w.tags, sLat / k, sLon / k);
  }
  for (const [id, rl] of rels) {
    if (rl.tags.power !== 'substation') continue;
    let sLat = 0;
    let sLon = 0;
    let k = 0;
    for (const m of rl.members) {
      if (m.type === 'way') {
        const w = ways.get(m.ref);
        for (const nid of w?.nodes || []) {
          const n = nodes.get(nid);
          if (n) {
            sLat += n.lat;
            sLon += n.lon;
            k++;
          }
        }
      } else if (m.type === 'node') {
        const n = nodes.get(m.ref);
        if (n) {
          sLat += n.lat;
          sLon += n.lon;
          k++;
        }
      }
    }
    if (k) pousser(`r${id}`, rl.tags, sLat / k, sLon / k);
  }

  return postes;
}

/* ------------------------------------------------------------------ */
/* 3. Reconstruction des lignes                                        */
/* ------------------------------------------------------------------ */

/**
 * OSM découpe une ligne en de nombreux tronçons. On les recolle en « lignes »
 * allant d'une extrémité franche (poste, dérivation, changement de tension) à
 * une autre, ce qui correspond à la notion d'ouvrage utilisée en exploitation.
 */
function reconstruireLignes({ nodes, ways }) {
  const troncons = new Map();
  for (const [id, w] of ways) {
    if (w.tags.power !== 'line') continue;
    const v = palier(volts(w.tags));
    if (!v || v < MIN_KV) continue;
    if (w.nodes.length < 2) continue;
    troncons.set(id, { id, nodes: w.nodes, tags: w.tags, kv: v, op: normOperateur(w.tags) });
  }
  console.log(`→ ${troncons.size} tronçons HTB retenus`);

  // degré de chaque nœud d'extrémité : combien de tronçons s'y rejoignent
  const degre = new Map();
  for (const t of troncons.values()) {
    for (const nid of [t.nodes[0], t.nodes[t.nodes.length - 1]]) {
      degre.set(nid, (degre.get(nid) || 0) + 1);
    }
  }
  // index nœud d'extrémité → tronçons
  const parNoeud = new Map();
  for (const t of troncons.values()) {
    for (const nid of [t.nodes[0], t.nodes[t.nodes.length - 1]]) {
      if (!parNoeud.has(nid)) parNoeud.set(nid, []);
      parNoeud.get(nid).push(t.id);
    }
  }

  const vus = new Set();
  const chaines = [];

  /** Tronçon suivant dans la continuité, s'il est unique et compatible. */
  function suivant(nid, depuis) {
    if ((degre.get(nid) || 0) !== 2) return null;
    const cands = (parNoeud.get(nid) || []).filter((x) => x !== depuis.id && !vus.has(x));
    if (cands.length !== 1) return null;
    const t = troncons.get(cands[0]);
    if (!t || t.kv !== depuis.kv || t.op !== depuis.op) return null;
    return t;
  }

  for (const depart of troncons.values()) {
    if (vus.has(depart.id)) continue;
    vus.add(depart.id);

    let seq = depart.nodes.slice();
    let cur = depart;

    // extension vers la fin
    for (;;) {
      const t = suivant(seq[seq.length - 1], cur);
      if (!t) break;
      vus.add(t.id);
      const jonction = seq[seq.length - 1];
      const suite = t.nodes[0] === jonction ? t.nodes.slice(1) : t.nodes.slice(0, -1).reverse();
      seq = seq.concat(suite);
      cur = t;
    }
    // extension vers le début
    cur = depart;
    for (;;) {
      const t = suivant(seq[0], cur);
      if (!t) break;
      vus.add(t.id);
      const jonction = seq[0];
      const avant = t.nodes[t.nodes.length - 1] === jonction ? t.nodes.slice(0, -1) : t.nodes.slice(1).reverse();
      seq = avant.concat(seq);
      cur = t;
    }

    chaines.push({
      idBase: depart.id,
      kv: depart.kv,
      op: depart.op,
      tags: depart.tags,
      seq,
    });
  }

  console.log(`  ✓ ${chaines.length} lignes reconstituées`);
  return chaines;
}

/* ------------------------------------------------------------------ */
/* 4. Rattachement départemental                                       */
/* ------------------------------------------------------------------ */

/** Les DROM ne figurent pas dans le fichier de contours : emprises rectangulaires. */
const DROM = [
  { code: '971', nom: 'Guadeloupe', bbox: [15.8, -61.9, 16.6, -60.9] },
  { code: '972', nom: 'Martinique', bbox: [14.3, -61.3, 14.95, -60.75] },
  { code: '973', nom: 'Guyane', bbox: [2.0, -54.7, 5.9, -51.5] },
  { code: '974', nom: 'La Réunion', bbox: [-21.5, 55.1, -20.8, 55.9] },
  { code: '976', nom: 'Mayotte', bbox: [-13.1, 44.9, -12.6, 45.35] },
].map((d) => {
  const [s, w, n, e] = d.bbox;
  return {
    ...d,
    polys: [[[[w, s], [e, s], [e, n], [w, n], [w, s]]]],
  };
});

function chargerDepartements() {
  const f = path.join(RAW_DIR, '_departements.geojson');
  if (!fs.existsSync(f)) {
    console.log('  ! contours départementaux absents — rattachement ignoré');
    return DROM;
  }
  const gj = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!gj.features?.[0]?.geometry) {
    console.log('  ! fichier de contours sans géométrie — relancez npm run data:fetch');
    return DROM;
  }
  return gj.features.map((ft) => {
    const polys =
      ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates;
    let s = 90;
    let w = 180;
    let n = -90;
    let e = -180;
    for (const poly of polys)
      for (const ring of poly)
        for (const [lon, lat] of ring) {
          if (lat < s) s = lat;
          if (lat > n) n = lat;
          if (lon < w) w = lon;
          if (lon > e) e = lon;
        }
    return {
      code: ft.properties.code,
      nom: ft.properties.nom,
      region: ft.properties.codeRegion,
      polys,
      bbox: [s, w, n, e],
    };
  }).concat(DROM);
}

function dansAnneau(lon, lat, ring) {
  let dedans = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

function departementDe(lat, lon, depts) {
  for (const d of depts) {
    const [s, w, n, e] = d.bbox;
    if (lat < s || lat > n || lon < w || lon > e) continue;
    for (const poly of d.polys) {
      if (!dansAnneau(lon, lat, poly[0])) continue;
      let trou = false;
      for (let k = 1; k < poly.length; k++) if (dansAnneau(lon, lat, poly[k])) trou = true;
      if (!trou) return d.code;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 5. Nomenclature officielle RTE (ODRE)                               */
/* ------------------------------------------------------------------ */

function chargerOdre() {
  const lire = (f) => {
    const p = path.join(RAW_DIR, f);
    if (!fs.existsSync(p)) return [];
    return (JSON.parse(fs.readFileSync(p, 'utf8')).features || []).map((x) => x.properties);
  };
  const postes = lire('_odre_postes-electriques-rte.geojson').filter(
    (p) => p.etat === 'EN EXPLOITATION',
  );
  const lignes = lire('_odre_lignes-aeriennes-rte-nv.geojson').filter(
    (l) => l.etat === 'EN EXPLOITATION',
  );
  console.log(`→ ODRE : ${postes.length} sites, ${lignes.length} ouvrages aériens`);

  const parNomPoste = new Map();
  for (const p of postes) {
    const k = cle(p.nom_poste);
    if (!parNomPoste.has(k)) parNomPoste.set(k, p);
  }
  return { postes, lignes, parNomPoste };
}

/** Recherche l'ouvrage ODRE correspondant à une ligne (tension + extrémités). */
function apparierLigne(odre, kv, nomA, nomB) {
  if (!nomA || !nomB) return null;
  const a = motCle(nomA);
  const b = motCle(nomB);
  if (!a || !b || a === b) return null;
  const cands = odre.lignes.filter((l) => {
    if (parseInt(String(l.tension), 10) !== kv) return false;
    const t = cle(l.nom_ligne || l.nom_ouvrage_1);
    return t.includes(a) && t.includes(b);
  });
  return cands.length ? cands : null;
}

/* ------------------------------------------------------------------ */
/* 5 bis. Aérodromes                                                    */
/* ------------------------------------------------------------------ */

/** Découpe une ligne CSV en respectant les guillemets. */
function champsCsv(l) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"') {
      if (q && l[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Terrains français, hors aérodromes fermés. Ceux qui portent un code OACI sont
 * ceux pour lesquels des NOTAM sont publiés ; les autres restent utiles à situer.
 */
function construireAerodromes() {
  const f = path.join(RAW_DIR, '_airports.csv');
  if (!fs.existsSync(f)) {
    console.log('  ! référentiel des aérodromes absent — étape ignorée');
    return [];
  }
  const lignes = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const entete = champsCsv(lignes[0]).map((x) => x.replace(/"/g, ''));
  const col = (nom) => entete.indexOf(nom);
  const iPays = col('iso_country');
  const iType = col('type');
  const iNom = col('name');
  const iLat = col('latitude_deg');
  const iLon = col('longitude_deg');
  const iIdent = col('ident');
  const iOaci = col('icao_code');
  const iVille = col('municipality');

  const out = [];
  for (let i = 1; i < lignes.length; i++) {
    if (!lignes[i]) continue;
    const c = champsCsv(lignes[i]);
    if (c[iPays] !== 'FR') continue;
    if (c[iType] === 'closed' || c[iType] === 'balloonport') continue;
    const lat = Number(c[iLat]);
    const lon = Number(c[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const oaci = (c[iOaci] || '').trim() || (/^LF[A-Z]{2}$/.test(c[iIdent]) ? c[iIdent] : '');
    out.push({
      c: oaci,
      n: c[iNom],
      v: c[iVille] || '',
      t: c[iType],
      y: r5(lat),
      x: r5(lon),
    });
  }
  console.log(
    `→ ${out.length} aérodromes français (${out.filter((a) => a.c).length} avec code OACI)`,
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* 6. Assemblage                                                       */
/* ------------------------------------------------------------------ */

function main() {
  if (!fs.existsSync(RAW_DIR)) {
    console.error('data/raw introuvable — lancez d\'abord : npm run data:fetch');
    process.exit(1);
  }
  fs.mkdirSync(DEPT_DIR, { recursive: true });

  const osm = chargerOsm();
  const depts = chargerDepartements();
  const odre = chargerOdre();

  // -- postes -------------------------------------------------------
  let postes = extrairePostes(osm);
  console.log(`→ ${postes.length} postes OSM bruts`);

  // On garde les postes HTB : tension ≥ 63 kV, ou nom apparié à un site RTE.
  postes = postes.filter((p) => {
    if (palier(p.tension) >= MIN_KV) return true;
    if (p.nom && odre.parNomPoste.has(cle(p.nom))) return true;
    return false;
  });

  for (const p of postes) {
    const off = p.nom ? odre.parNomPoste.get(cle(p.nom)) : null;
    if (off) {
      p.nom = off.nom_poste;
      p.code = off.code_poste;
      p.fonction = off.fonction;
      if (off.tension) p.tensionRte = off.tension;
      if (p.operateur === 'Inconnu') p.operateur = 'RTE';
    }
    p.dept = departementDe(p.lat, p.lon, depts);
  }
  console.log(`  ✓ ${postes.length} postes HTB retenus`);

  // index spatial grossier des postes, pour nommer les extrémités de ligne
  const grille = new Map();
  const cellOf = (lat, lon) => `${Math.round(lat * 50)}_${Math.round(lon * 50)}`;
  for (const p of postes) {
    const k = cellOf(p.lat, p.lon);
    if (!grille.has(k)) grille.set(k, []);
    grille.get(k).push(p);
  }
  function posteProche(lat, lon, rayonKm = 1.2) {
    let best = null;
    let bd = rayonKm;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const k = `${Math.round(lat * 50) + dy}_${Math.round(lon * 50) + dx}`;
        for (const p of grille.get(k) || []) {
          const d = haversine({ lat, lon }, p);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
      }
    return best;
  }

  // -- lignes -------------------------------------------------------
  const chaines = reconstruireLignes(osm);
  const lignes = [];
  let sansNumero = 0;
  let total = 0;

  for (const ch of chaines) {
    const pts = ch.seq.map((nid) => osm.nodes.get(nid)).filter(Boolean);
    if (pts.length < 2) continue;

    // pylônes = nœuds explicitement taggés comme supports
    const estSupport = (n) => ['tower', 'portal', 'terminal'].includes(n.tags?.power);
    let supports = ch.seq
      .map((nid) => ({ nid, n: osm.nodes.get(nid) }))
      .filter((x) => x.n && estSupport(x.n));
    if (supports.length < 2) {
      supports = ch.seq.map((nid) => ({ nid, n: osm.nodes.get(nid) })).filter((x) => x.n);
    }
    if (supports.length < 2) continue;

    // orientation : on suit la numérotation de terrain si elle existe
    const refs = supports
      .map((x, idx) => ({ idx, r: parseInt(x.n.tags?.ref, 10) }))
      .filter((x) => Number.isFinite(x.r));
    let inverser = false;
    if (refs.length >= 2) {
      inverser = refs[refs.length - 1].r < refs[0].r;
    } else {
      const a = pts[0];
      const b = pts[pts.length - 1];
      inverser = a.lat < b.lat || (a.lat === b.lat && a.lon < b.lon);
    }
    const seqPts = inverser ? pts.slice().reverse() : pts;
    const seqSup = inverser ? supports.slice().reverse() : supports;

    // longueur cumulée le long du tracé complet
    let km = 0;
    for (let i = 1; i < seqPts.length; i++) km += haversine(seqPts[i - 1], seqPts[i]);

    const pylones = [];
    let cum = 0;
    for (let i = 0; i < seqSup.length; i++) {
      if (i > 0) cum += haversine(seqSup[i - 1].n, seqSup[i].n);
      const ref = seqSup[i].n.tags?.ref;
      pylones.push({
        i: i + 1,
        num: ref ? String(ref) : String(i + 1),
        numReel: Boolean(ref),
        lat: r5(seqSup[i].n.lat),
        lon: r5(seqSup[i].n.lon),
        d: Math.round(cum * 1000) / 1000,
      });
    }

    const pA = posteProche(seqPts[0].lat, seqPts[0].lon);
    const pB = posteProche(seqPts[seqPts.length - 1].lat, seqPts[seqPts.length - 1].lon);
    const nomA = pA?.nom || '';
    const nomB = pB?.nom || '';

    // Les liaisons courtes qui partent et reviennent au même poste sont des
    // raccordements internes (jeux de barres, entrées de cellule) : pas des ouvrages.
    if (pA && pB && pA.id === pB.id && km < 1.5) continue;
    // Idem pour les moignons de quelques dizaines de mètres sans extrémité identifiée.
    if (km < 0.25 && pylones.length <= 3) continue;

    total += pylones.length;
    sansNumero += pylones.filter((p) => !p.numReel).length;

    // départements traversés : échantillonnage des pylônes (1 sur 5 suffit)
    const setDepts = new Set();
    for (let i = 0; i < pylones.length; i += 5) {
      const d = departementDe(pylones[i].lat, pylones[i].lon, depts);
      if (d) setDepts.add(d);
    }
    const dFin = departementDe(
      pylones[pylones.length - 1].lat,
      pylones[pylones.length - 1].lon,
      depts,
    );
    if (dFin) setDepts.add(dFin);

    const cands = apparierLigne(odre, ch.kv, nomA, nomB);
    // Libellé à la manière RTE : extrémités en capitales, séparées par un tiret.
    // Les ouvrages dont OSM ne nomme aucune extrémité sont nommés plus bas.
    const maj = (s) => s.toLocaleUpperCase('fr-FR');
    const nom =
      nomA && nomB
        ? `${maj(nomA)} – ${maj(nomB)}`
        : nomA || nomB
          ? `${maj(nomA || nomB)} – ?`
          : '';

    lignes.push({
      id: `L${ch.idBase}`,
      nom,
      codeRte: cands && cands.length === 1 ? cands[0].code_ligne : undefined,
      nomRte: cands && cands.length === 1 ? cands[0].nom_ligne : undefined,
      candidatsRte:
        cands && cands.length > 1 ? cands.map((c) => c.code_ligne).slice(0, 6) : undefined,
      tension: ch.kv,
      operateur: ch.op,
      nbCircuits: ch.tags.circuits ? parseInt(ch.tags.circuits, 10) : undefined,
      km: Math.round(km * 1000) / 1000,
      nbPylones: pylones.length,
      depts: [...setDepts],
      extremites: [nomA, nomB],
      geom: seqPts.map((p) => [r5(p.lat), r5(p.lon)]),
      pylones,
    });
  }

  // Ouvrages dont aucune extrémité n'est nommée dans OSM : on leur donne un
  // repère stable et lisible (département + rang), à charge pour l'exploitant de
  // rattacher l'ouvrage officiel depuis l'application.
  const compteurs = new Map();
  for (const l of lignes.filter((x) => !x.nom).sort((a, b) => a.id.localeCompare(b.id))) {
    const d = l.depts[0] || '00';
    const n = (compteurs.get(d) || 0) + 1;
    compteurs.set(d, n);
    l.nom = `${l.tension} kV — ${d}·${String(n).padStart(3, '0')} (à identifier)`;
    l.aIdentifier = true;
  }

  console.log(
    `  ✓ ${lignes.length} lignes, ${total} pylônes ` +
      `(${(((total - sansNumero) / total) * 100).toFixed(1)} % avec numéro de terrain)`,
  );
  console.log(
    `  · ${lignes.filter((l) => l.codeRte).length} appariées à un ouvrage RTE, ` +
      `${lignes.filter((l) => l.candidatsRte).length} ambiguës, ` +
      `${lignes.filter((l) => l.aIdentifier).length} à identifier`,
  );

  // Catalogue officiel embarqué : permet de rattacher un ouvrage à la main.
  const catalogue = odre.lignes
    .map((l) => ({
      c: l.code_ligne,
      n: l.nom_ligne || l.nom_ouvrage_1 || '',
      t: parseInt(String(l.tension), 10) || 0,
    }))
    .filter((l) => l.c && l.n)
    .sort((a, b) => a.n.localeCompare(b.n, 'fr'));
  fs.writeFileSync(path.join(OUT_DIR, 'ouvrages-rte.json'), JSON.stringify(catalogue));
  console.log(`  · catalogue RTE embarqué : ${catalogue.length} ouvrages`);

  const aerodromes = construireAerodromes();
  fs.writeFileSync(path.join(OUT_DIR, 'aerodromes.json'), JSON.stringify(aerodromes));

  // -- écriture par département --------------------------------------
  const parDept = new Map();
  const ajouter = (code) => {
    if (!parDept.has(code)) parDept.set(code, { lignes: [], postes: [] });
    return parDept.get(code);
  };
  for (const l of lignes) for (const d of l.depts) ajouter(d).lignes.push(l);
  for (const p of postes) if (p.dept) ajouter(p.dept).postes.push(p);

  const index = { genereLe: new Date().toISOString(), version: 1, departements: [] };
  const nomDept = new Map(depts.map((d) => [d.code, d]));

  for (const [code, jeu] of [...parDept.entries()].sort()) {
    const d = nomDept.get(code);
    const sortie = {
      code,
      nom: d?.nom || code,
      lignes: jeu.lignes,
      postes: jeu.postes.map(({ dept, ...p }) => p),
    };
    const f = path.join(DEPT_DIR, `${code}.json`);
    fs.writeFileSync(f, JSON.stringify(sortie));

    let s = 90;
    let w = 180;
    let n = -90;
    let e = -180;
    for (const l of jeu.lignes)
      for (const [lat, lon] of l.geom) {
        if (lat < s) s = lat;
        if (lat > n) n = lat;
        if (lon < w) w = lon;
        if (lon > e) e = lon;
      }

    index.departements.push({
      code,
      nom: sortie.nom,
      region: d?.region,
      nbLignes: jeu.lignes.length,
      nbPylones: jeu.lignes.reduce((a, l) => a + l.nbPylones, 0),
      nbPostes: jeu.postes.length,
      km: Math.round(jeu.lignes.reduce((a, l) => a + l.km, 0) * 10) / 10,
      taille: fs.statSync(f).size,
      bbox: [r5(s), r5(w), r5(n), r5(e)],
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 1));

  const poids = index.departements.reduce((a, d) => a + d.taille, 0);
  console.log(
    `\n✓ ${index.departements.length} départements écrits dans public/data ` +
      `(${(poids / 1e6).toFixed(1)} Mo au total)`,
  );
}

main();
