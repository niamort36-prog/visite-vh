#!/usr/bin/env node
/**
 * Téléchargement du réseau électrique HTB français depuis OpenStreetMap (Overpass API).
 *
 * Stratégie : la France métropolitaine est découpée en une grille de mailles de 1°.
 * Chaque maille est interrogée séparément ; si Overpass refuse (timeout / trop de
 * données), la maille est subdivisée en 4 et retentée. Les résultats sont écrits dans
 * data/raw/ : le script est donc reprenable, on peut l'interrompre et le relancer.
 *
 *   node scripts/fetch-osm.mjs            # France métropolitaine + DROM
 *   node scripts/fetch-osm.mjs --force    # ignore le cache et retélécharge tout
 *   node scripts/fetch-osm.mjs --bbox 44,-1,46,2   # une zone précise (S,W,N,E)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

// Zones couvertes : métropole + Corse, puis les DROM (réseaux EDF SEI).
const ZONES = [
  { nom: 'metropole', s: 41.3, w: -5.3, n: 51.2, e: 9.7 },
  { nom: 'guadeloupe', s: 15.8, w: -61.9, n: 16.6, e: -60.9 },
  { nom: 'martinique', s: 14.3, w: -61.3, n: 14.95, e: -60.75 },
  { nom: 'guyane', s: 2.0, w: -54.7, n: 5.9, e: -51.5 },
  { nom: 'reunion', s: -21.5, w: 55.1, n: -20.8, e: 55.9 },
  { nom: 'mayotte', s: -13.1, w: 44.9, n: -12.6, e: 45.35 },
];

const STEP = 1.0; // taille de maille en degrés
const MAX_DEPTH = 3; // subdivisions maximum d'une maille récalcitrante
const PAUSE_MS = 1500; // respiration entre deux requêtes, par courtoisie pour Overpass
// Un worker par miroir : chaque miroir ne reçoit jamais plus d'une requête à la fois.
const WORKERS = MIRRORS.length;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const bboxArg = args.includes('--bbox') ? args[args.indexOf('--bbox') + 1] : null;

/** Requête Overpass : lignes HTB, postes, et tous les nœuds porteurs (pylônes). */
function query(s, w, n, e) {
  const bbox = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  return `[out:json][timeout:240][bbox:${bbox}];
(
  way["power"="line"];
  way["power"="substation"];
  node["power"="substation"];
  relation["power"="substation"];
  node["power"="tower"]["ref"];
);
out body;
>;
out body qt;`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cellKey(s, w, n, e) {
  const f = (v) => v.toFixed(3).replace('-', 'm').replace('.', 'p');
  return `${f(s)}_${f(w)}_${f(n)}_${f(e)}`;
}

async function overpass(q, worker = 0, attempt = 0) {
  // Le worker reste sur son miroir ; en cas d'échec il tente le suivant.
  const url = MIRRORS[(worker + attempt) % MIRRORS.length];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(q),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'visite-vh/0.1 (preparation visites heliportees HTB)',
      },
      signal: ctrl.signal,
    });
    if (res.status === 429 || res.status === 504 || res.status === 503) {
      throw new Error(`HTTP ${res.status} (${url})`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    const text = await res.text();
    if (text.startsWith('<')) throw new Error(`réponse non-JSON (${url})`);
    return JSON.parse(text);
  } catch (err) {
    if (attempt < 3) {
      const wait = 5000 * (attempt + 1);
      console.log(`    ↻ ${err.message} — nouvelle tentative dans ${wait / 1000}s`);
      await sleep(wait);
      return overpass(q, worker, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCell(s, w, n, e, worker = 0, depth = 0) {
  const key = cellKey(s, w, n, e);
  const file = path.join(RAW_DIR, `${key}.json`);
  const marker = path.join(RAW_DIR, `${key}.split`);

  if (!FORCE && fs.existsSync(file)) return { skipped: true, elements: 0 };
  if (!FORCE && fs.existsSync(marker)) {
    // maille déjà subdivisée lors d'un run précédent : on traite les sous-mailles
    return splitCell(s, w, n, e, worker, depth);
  }

  const pad = '  '.repeat(depth);
  try {
    const data = await overpass(query(s, w, n, e), worker);
    const els = data.elements || [];
    fs.writeFileSync(file, JSON.stringify({ elements: els }));
    console.log(`${pad}✓ ${key} — ${els.length} éléments`);
    await sleep(PAUSE_MS);
    return { skipped: false, elements: els.length };
  } catch (err) {
    if (depth >= MAX_DEPTH) {
      console.log(`${pad}✗ ${key} — abandon (${err.message})`);
      fs.writeFileSync(file, JSON.stringify({ elements: [], error: String(err.message) }));
      return { skipped: false, elements: 0 };
    }
    console.log(`${pad}⊞ ${key} — subdivision (${err.message})`);
    fs.writeFileSync(marker, '');
    return splitCell(s, w, n, e, worker, depth);
  }
}

async function splitCell(s, w, n, e, worker, depth) {
  const ms = (s + n) / 2;
  const mw = (w + e) / 2;
  let total = 0;
  for (const [a, b, c, d] of [
    [s, w, ms, mw],
    [s, mw, ms, e],
    [ms, w, n, mw],
    [ms, mw, n, e],
  ]) {
    const r = await fetchCell(a, b, c, d, worker, depth + 1);
    total += r.elements;
  }
  return { skipped: false, elements: total };
}

/**
 * Contours des départements — utilisés au build pour rattacher lignes et pylônes.
 * geo.api.gouv.fr ne sert plus les géométries : on prend france-geojson, qui couvre
 * la métropole et la Corse. Les DROM sont rattachés par emprise dans build-dataset.
 */
async function fetchDepartements() {
  const file = path.join(RAW_DIR, '_departements.geojson');
  if (!FORCE && fs.existsSync(file)) {
    const test = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (test?.features?.[0]?.geometry) return;
  }
  console.log('→ Contours des départements (france-geojson)…');
  const res = await fetch(
    'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements.geojson',
  );
  if (!res.ok) {
    console.log(`  ✗ échec (HTTP ${res.status}) — le rattachement départemental sera ignoré`);
    return;
  }
  fs.writeFileSync(file, await res.text());
  console.log('  ✓ contours enregistrés');
}

/**
 * Référentiel des aérodromes (OurAirports, domaine public) : sert à repérer les
 * terrains concernés par un vol pour aller consulter les NOTAM correspondants.
 */
async function fetchAerodromes() {
  const file = path.join(RAW_DIR, '_airports.csv');
  if (!FORCE && fs.existsSync(file)) return;
  console.log('→ Référentiel des aérodromes (OurAirports)…');
  const res = await fetch('https://davidmegginson.github.io/ourairports-data/airports.csv');
  if (!res.ok) {
    console.log(`  ✗ échec (HTTP ${res.status}) — la liste des terrains sera vide`);
    return;
  }
  fs.writeFileSync(file, await res.text());
  console.log('  ✓ aérodromes enregistrés');
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  await fetchDepartements();
  await fetchAerodromes();

  const zones = bboxArg
    ? [
        (() => {
          const [s, w, n, e] = bboxArg.split(',').map(Number);
          return { nom: 'bbox', s, w, n, e };
        })(),
      ]
    : ZONES;

  const cells = [];
  for (const z of zones) {
    for (let lat = z.s; lat < z.n; lat += STEP) {
      for (let lon = z.w; lon < z.e; lon += STEP) {
        cells.push([lat, lon, Math.min(lat + STEP, z.n), Math.min(lon + STEP, z.e)]);
      }
    }
  }

  console.log(`→ ${cells.length} mailles à traiter sur ${WORKERS} miroirs en parallèle\n`);
  let done = 0;
  let elements = 0;
  let cursor = 0;
  const t0 = Date.now();

  async function worker(id) {
    while (cursor < cells.length) {
      const [s, w, n, e] = cells[cursor++];
      const r = await fetchCell(s, w, n, e, id);
      done++;
      elements += r.elements;
      if (done % 10 === 0) {
        const min = (Date.now() - t0) / 60000;
        const eta = (min / done) * (cells.length - done);
        console.log(
          `  — ${done}/${cells.length} mailles, ${elements} éléments, ` +
            `${min.toFixed(1)} min écoulées, ~${eta.toFixed(0)} min restantes`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i)));

  console.log(`\n✓ Terminé : ${done} mailles, ${elements} éléments bruts dans data/raw/`);
  console.log('  Étape suivante : npm run data:build');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
