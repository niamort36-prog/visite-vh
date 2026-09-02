import type { Aerodrome, IndexReseau, JeuDepartement } from '../types';

const BASE = import.meta.env.BASE_URL;

const cacheDept = new Map<string, JeuDepartement>();
let cacheIndex: IndexReseau | null = null;

export async function chargerIndex(): Promise<IndexReseau> {
  if (cacheIndex) return cacheIndex;
  const res = await fetch(`${BASE}data/index.json`);
  if (!res.ok) throw new Error(`index des données indisponible (HTTP ${res.status})`);
  cacheIndex = (await res.json()) as IndexReseau;
  return cacheIndex;
}

export async function chargerDept(code: string): Promise<JeuDepartement> {
  const enCache = cacheDept.get(code);
  if (enCache) return enCache;
  const res = await fetch(`${BASE}data/dept/${code}.json`);
  if (!res.ok) throw new Error(`département ${code} indisponible (HTTP ${res.status})`);
  const jeu = (await res.json()) as JeuDepartement;
  cacheDept.set(code, jeu);
  return jeu;
}

export function deptEnMemoire(code: string): JeuDepartement | undefined {
  return cacheDept.get(code);
}

/** Le jeu est-il déjà présent dans le cache du service worker (donc utilisable hors ligne) ? */
export async function estHorsLigne(code: string): Promise<boolean> {
  if (!('caches' in window)) return false;
  try {
    const c = await caches.open('reseau-htb');
    const hit = await c.match(`${BASE}data/dept/${code}.json`);
    return Boolean(hit);
  } catch {
    return false;
  }
}

export interface OuvrageRte {
  /** code d'ouvrage, ex. NENTIL51ORLU */
  c: string;
  /** libellé officiel */
  n: string;
  /** tension en kV */
  t: number;
}

let cacheCatalogue: OuvrageRte[] | null = null;

/** Catalogue officiel des ouvrages aériens RTE (ODRE), pour rattachement manuel. */
export async function chargerCatalogue(): Promise<OuvrageRte[]> {
  if (cacheCatalogue) return cacheCatalogue;
  const res = await fetch(`${BASE}data/ouvrages-rte.json`);
  if (!res.ok) throw new Error(`catalogue RTE indisponible (HTTP ${res.status})`);
  cacheCatalogue = (await res.json()) as OuvrageRte[];
  return cacheCatalogue;
}

let cacheAerodromes: Aerodrome[] | null = null;

/** Référentiel des terrains français, chargé à la demande puis mis en cache. */
export async function chargerAerodromes(): Promise<Aerodrome[]> {
  if (cacheAerodromes) return cacheAerodromes;
  const res = await fetch(`${BASE}data/aerodromes.json`);
  if (!res.ok) throw new Error(`référentiel des aérodromes indisponible (HTTP ${res.status})`);
  cacheAerodromes = (await res.json()) as Aerodrome[];
  return cacheAerodromes;
}
