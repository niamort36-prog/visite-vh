import type {
  Creneau,
  DemiJournee,
  Ligne,
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

export interface JourneeCalculee {
  etapes: Etape[];
  /** retour à la zone de poser en fin de journée */
  retourKm: number | null;
  retourMin: number;
  totalTransitMin: number;
  totalVisiteMin: number;
  totalMin: number;
}

/**
 * Enchaînement d'une journée : départ de la zone de poser, liaison vers chaque
 * ouvrage dans l'ordre du planning, puis retour à la zone de poser. Les liaisons
 * sont estimées à la vitesse de transit ; elles s'ajoutent au temps de visite.
 */
export function calculerJournee(
  prepa: Preparation,
  creneau: Creneau | undefined,
  dz: ZoneDePoser | undefined,
  lignesParId: Map<string, Ligne>,
  suivi: (id: string) => SuiviLigne,
): JourneeCalculee {
  const vitesseTransit = prepa.vitesseTransit || VITESSE_TRANSIT;
  const etapes: Etape[] = [];
  // la journée s'enchaîne : l'après-midi repart d'où le matin s'est arrêté
  const suite: { vol: VolLigne; demi: DemiJournee }[] = [
    ...(creneau?.matin ?? []).map((vol) => ({ vol, demi: 'matin' as DemiJournee })),
    ...(creneau?.apresMidi ?? []).map((vol) => ({ vol, demi: 'apresMidi' as DemiJournee })),
  ];

  let position: Point | null = dz ? { lat: dz.lat, lon: dz.lon } : null;
  for (const { vol, demi } of suite) {
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

  const retourKm = position && dz ? haversine(position, { lat: dz.lat, lon: dz.lon }) : null;
  const retourMin = retourKm == null ? 0 : dureeTransit(retourKm, vitesseTransit);

  const totalTransitMin = etapes.reduce((a, e) => a + e.transitMin, 0) + retourMin;
  const totalVisiteMin = etapes.reduce((a, e) => a + e.visiteMin, 0);

  return {
    etapes,
    retourKm,
    retourMin,
    totalTransitMin,
    totalVisiteMin,
    totalMin: totalTransitMin + totalVisiteMin,
  };
}

/** Étapes d'une demi-journée seulement, extraites du calcul de la journée. */
export function etapesDemiJournee(j: JourneeCalculee, demi: DemiJournee): Etape[] {
  return j.etapes.filter((e) => e.demi === demi);
}
