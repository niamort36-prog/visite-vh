import type { Aerodrome, IndexReseau, JeuDepartement } from '../types';

const BASE = import.meta.env.BASE_URL;

const cacheDept = new Map<string, JeuDepartement>();
let cacheIndex: IndexReseau | null = null;

/**
 * Empreinte du jeu de données courant. Les fichiers de données sont mis en cache
 * pour l'usage hors connexion ; sans ce jeton, une régénération du réseau ne
 * parviendrait jamais aux postes déjà installés. L'index, lui, est rafraîchi par
 * le réseau quand il est disponible.
 */
let empreinte = '';

async function jeton(): Promise<string> {
  if (!empreinte) await chargerIndex();
  return encodeURIComponent(empreinte);
}

export async function chargerIndex(): Promise<IndexReseau> {
  if (cacheIndex) return cacheIndex;
  const res = await fetch(`${BASE}data/index.json`);
  if (!res.ok) throw new Error(`index des données indisponible (HTTP ${res.status})`);
  cacheIndex = (await res.json()) as IndexReseau;
  empreinte = cacheIndex.genereLe;
  return cacheIndex;
}

/** URL d'un fichier de données, estampillée de la version du jeu. */
export async function urlDonnees(chemin: string): Promise<string> {
  return `${BASE}data/${chemin}?v=${await jeton()}`;
}

export async function chargerDept(code: string): Promise<JeuDepartement> {
  const enCache = cacheDept.get(code);
  if (enCache) return enCache;
  const res = await fetch(await urlDonnees(`dept/${code}.json`));
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
    const hit = await c.match(await urlDonnees(`dept/${code}.json`));
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
  const res = await fetch(await urlDonnees('ouvrages-rte.json'));
  if (!res.ok) throw new Error(`catalogue RTE indisponible (HTTP ${res.status})`);
  cacheCatalogue = (await res.json()) as OuvrageRte[];
  return cacheCatalogue;
}

let cacheAerodromes: Aerodrome[] | null = null;

/** Référentiel des terrains français, chargé à la demande puis mis en cache. */
export async function chargerAerodromes(): Promise<Aerodrome[]> {
  if (cacheAerodromes) return cacheAerodromes;
  const res = await fetch(await urlDonnees('aerodromes.json'));
  if (!res.ok) throw new Error(`référentiel des aérodromes indisponible (HTTP ${res.status})`);
  cacheAerodromes = (await res.json()) as Aerodrome[];
  return cacheAerodromes;
}
