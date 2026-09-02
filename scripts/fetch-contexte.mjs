#!/usr/bin/env node
/**
 * Contexte réglementaire des survols :
 *  - sites Seveso (WFS Géorisques / BRGM) ;
 *  - zones urbanisées (Corine Land Cover 2018, classes 111 et 112), qui servent
 *    d'approximation nationale des agglomérations au sens du survol.
 *
 * Les deux jeux sont volumineux mais ne sont utilisés qu'au build : seuls des
 * indicateurs par ligne finissent dans l'application.
 *
 *   node scripts/fetch-contexte.mjs [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, '..', 'data', 'raw');
const FORCE = process.argv.includes('--force');

const GEOPF = 'https://data.geopf.fr/wfs/ows';
const SEVESO = 'https://mapsref.brgm.fr/wxs/georisques/seveso';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Récupère toutes les entités d'une couche WFS, par pages. */
async function wfsComplet(
  base,
  couche,
  { filtre = null, pas = 1000, label = couche, format = 'application/json' } = {},
) {
  const features = [];
  let debut = 0;
  for (;;) {
    const params = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '2.0.0',
      REQUEST: 'GetFeature',
      TYPENAMES: couche,
      OUTPUTFORMAT: format,
      SRSNAME: 'EPSG:4326',
      COUNT: String(pas),
      STARTINDEX: String(debut),
    });
    if (filtre) params.set('CQL_FILTER', filtre);

    let lot = null;
    for (let essai = 0; essai < 4 && !lot; essai++) {
      try {
        const res = await fetch(`${base}?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txt = await res.text();
        if (!txt.trim().startsWith('{')) throw new Error('réponse non JSON');
        lot = JSON.parse(txt);
      } catch (err) {
        console.log(`    ↻ ${label} @${debut} : ${err.message}`);
        await sleep(4000 * (essai + 1));
      }
    }
    if (!lot) throw new Error(`${label} : échec définitif à l'index ${debut}`);

    features.push(...(lot.features || []));
    const total = lot.totalFeatures ?? lot.numberMatched ?? features.length;
    console.log(`    ${label} : ${features.length}/${total}`);
    if (!lot.features?.length || features.length >= total) break;
    debut += pas;
    await sleep(300);
  }
  return { type: 'FeatureCollection', features };
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const fSeveso = path.join(RAW_DIR, '_seveso.geojson');
  if (FORCE || !fs.existsSync(fSeveso)) {
    console.log('→ Sites Seveso (Géorisques)…');
    // MapServer ne comprend que « geojson » ici, et sert tout le jeu en une fois
    const gj = await wfsComplet(SEVESO, 'ms:SEVESO_GE_FXX', {
      pas: 5000,
      label: 'seveso',
      format: 'geojson',
    });
    fs.writeFileSync(fSeveso, JSON.stringify(gj));
    console.log(`  ✓ ${gj.features.length} établissements`);
  } else {
    console.log('→ Sites Seveso : déjà présents');
  }

  const fAgglo = path.join(RAW_DIR, '_agglomerations.geojson');
  if (FORCE || !fs.existsSync(fAgglo)) {
    console.log('→ Zones urbanisées (Corine Land Cover 2018, classes 111 et 112)…');
    const gj = await wfsComplet(GEOPF, 'LANDCOVER.CLC18_FR:clc18_fr', {
      filtre: "code_18 IN ('111','112')",
      pas: 1000,
      label: 'agglos',
    });
    fs.writeFileSync(fAgglo, JSON.stringify(gj));
    console.log(`  ✓ ${gj.features.length} zones urbanisées`);
  } else {
    console.log('→ Zones urbanisées : déjà présentes');
  }

  console.log('\n✓ Terminé. Étape suivante : npm run data:build');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
