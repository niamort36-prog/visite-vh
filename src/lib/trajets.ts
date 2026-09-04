import type {
  Creneau,
  DemiJournee,
  Ligne,
  PointCarburant,
  Preparation,
  SuiviLigne,
  VolLigne,
  ZoneDePoser,
} from '../types';
import { calculerAvancement } from '../state/store';
import { haversine } from './geo';
import { dureeMinutes, dureeTransit, VITESSE_TRANSIT } from './vols';

export interface Point {
  lat: number;
  lon: number;
}

/**
 * Extrémités effectives d'une visite : les pylônes frontières du périmètre, pris
 * dans le sens choisi. Sans géométrie chargée, on ne peut rien dire.
 */
export function extremitesVol(
  ligne: Ligne | undefined,
  s: SuiviLigne | undefined,
  sens: 'AB' | 'BA' = 'AB',
): { depart: Point; arrivee: Point } | null {
  if (!ligne || !s) return null;
  const a = calculerAvancement(ligne, s);
  const p1 = ligne.pylones.find((p) => p.i === a.debut);
  const p2 = ligne.pylones.find((p) => p.i === a.fin);
  if (!p1 || !p2) return null;
  const depart = { lat: p1.lat, lon: p1.lon };
  const arrivee = { lat: p2.lat, lon: p2.lon };
  return sens === 'BA' ? { depart: arrivee, arrivee: depart } : { depart, arrivee };
}

export interface Etape {
  vol: VolLigne;
  demi: DemiJournee;
  /** trajet de liaison depuis le point précédent, en km ; null si tracé inconnu */
  transitKm: number | null;
  transitMin: number;
  visiteMin: number;
}

/**
 * Fin d'une demi-journée : ravitaillement au point Jet A-1 le plus proche du
 * dernier ouvrage visité, puis retour à la zone de poser de l'équipe.
 */
export interface Cloture {
  demi: DemiJournee;
  /** point de ravitaillement retenu, s'il en existe un */
  carburant: PointCarburant | null;
  /** dernier ouvrage → ravitaillement */
  ravitaillementKm: number | null;
  ravitaillementMin: number;
  /** ravitaillement, ou dernier ouvrage à défaut → zone de poser */
  retourKm: number | null;
  retourMin: number;
}

export interface JourneeCalculee {
  etapes: Etape[];
  /** clôture de chaque demi-journée effectivement planifiée */
  clotures: Cloture[];
  totalTransitMin: number;
  totalVisiteMin: number;
  totalMin: number;
}

/** Point de ravitaillement en Jet A-1 le plus proche d'une position. */
export function carburantLePlusProche(
  depuis: Point,
  points: PointCarburant[],
): { point: PointCarburant; km: number } | null {
  let meilleur: { point: PointCarburant; km: number } | null = null;
  for (const c of points) {
    if (!c.jetA1) continue;
    const km = haversine(depuis, c);
    if (!meilleur || km < meilleur.km) meilleur = { point: c, km };
  }
  return meilleur;
}

/**
 * Enchaînement d'une journée : chaque demi-journée part de la zone de poser,
 * enchaîne les ouvrages dans l'ordre du planning, puis se termine par un
 * ravitaillement au point Jet A-1 le plus proche du dernier ouvrage et un retour
 * à la zone de poser. L'appareil étant reposé à la DZ, l'après-midi repart de là
 * et non du dernier ouvrage du matin. Les liaisons sont estimées à la vitesse de
 * transit et s'ajoutent au temps de visite.
 */
export function calculerJournee(
  prepa: Preparation,
  creneau: Creneau | undefined,
  dz: ZoneDePoser | undefined,
  lignesParId: Map<string, Ligne>,
  suivi: (id: string) => SuiviLigne,
  pointsCarburant: PointCarburant[] = [],
): JourneeCalculee {
  const vitesseTransit = prepa.vitesseTransit || VITESSE_TRANSIT;
  const base: Point | null = dz ? { lat: dz.lat, lon: dz.lon } : null;
  const etapes: Etape[] = [];
  const clotures: Cloture[] = [];

  const demis: { demi: DemiJournee; vols: VolLigne[] }[] = [
    { demi: 'matin', vols: creneau?.matin ?? [] },
    { demi: 'apresMidi', vols: creneau?.apresMidi ?? [] },
  ];

  for (const { demi, vols } of demis) {
    let position = base;
    for (const vol of vols) {
      const ligne = lignesParId.get(vol.ligneId);
      const bornes = extremitesVol(ligne, ligne ? suivi(vol.ligneId) : undefined, vol.sens);
      const transitKm = position && bornes ? haversine(position, bornes.depart) : null;
      etapes.push({
        vol,
        demi,
        transitKm,
        transitMin: transitKm == null ? 0 : dureeTransit(transitKm, vitesseTransit),
        visiteMin: vol.dureeMin ?? dureeMinutes(vol.km, prepa.vitesse),
      });
      if (bornes) position = bornes.arrivee;
    }
    if (!vols.length) continue;

    // ravitaillement au plus près du dernier ouvrage, puis retour à la DZ
    const plein = position ? carburantLePlusProche(position, pointsCarburant) : null;
    const depuis: Point | null = plein ? plein.point : position;
    const retourKm = depuis && base ? haversine(depuis, base) : null;
    clotures.push({
      demi,
      carburant: plein?.point ?? null,
      ravitaillementKm: plein?.km ?? null,
      ravitaillementMin: plein ? dureeTransit(plein.km, vitesseTransit) : 0,
      retourKm,
      retourMin: retourKm == null ? 0 : dureeTransit(retourKm, vitesseTransit),
    });
  }

  const totalTransitMin =
    etapes.reduce((a, e) => a + e.transitMin, 0) +
    clotures.reduce((a, c) => a + c.ravitaillementMin + c.retourMin, 0);
  const totalVisiteMin = etapes.reduce((a, e) => a + e.visiteMin, 0);

  return {
    etapes,
    clotures,
    totalTransitMin,
    totalVisiteMin,
    totalMin: totalTransitMin + totalVisiteMin,
  };
}

/** Clôture d'une demi-journée, si elle a été planifiée. */
export function clotureDemiJournee(
  j: JourneeCalculee,
  demi: DemiJournee,
): Cloture | undefined {
  return j.clotures.find((c) => c.demi === demi);
}

/** Étapes d'une demi-journée seulement, extraites du calcul de la journée. */
export function etapesDemiJournee(j: JourneeCalculee, demi: DemiJournee): Etape[] {
  return j.etapes.filter((e) => e.demi === demi);
}
