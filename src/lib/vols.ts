import type { TypeVol } from '../types';

/**
 * Types de vol et vitesse moyenne de progression retenue par défaut.
 * La vitesse reste modifiable dans chaque préparation : celle des visites
 * héliportées (50 km/h) est la seule valeur de référence à ce jour.
 */
export const TYPES_VOL: { cle: TypeVol; nom: string; vitesse: number }[] = [
  { cle: 'VH_MONO', nom: 'VH mono-turbine', vitesse: 50 },
  { cle: 'VH_BI', nom: 'VH bi-turbines', vitesse: 50 },
  { cle: 'VTIR', nom: 'VTIR', vitesse: 50 },
  { cle: 'LIDAR', nom: 'Vol dédié LiDAR', vitesse: 50 },
];

export function nomTypeVol(t: TypeVol): string {
  return TYPES_VOL.find((x) => x.cle === t)?.nom ?? t;
}

export function vitesseParDefaut(t: TypeVol): number {
  return TYPES_VOL.find((x) => x.cle === t)?.vitesse ?? 50;
}

/** Domaine de tension au sens RTE : HTB1 (63-90), HTB2 (150-225), HTB3 (400). */
export function domaine(kv: number): string {
  if (kv >= 400) return 'HTB3';
  if (kv >= 150) return 'HTB2';
  return 'HTB1';
}

/** Durée de visite en minutes, arrondie aux 5 minutes. */
export function dureeMinutes(km: number, vitesse: number): number {
  if (!vitesse) return 0;
  return Math.round(((km / vitesse) * 60) / 5) * 5;
}

/** « 1 h 45 » ou « 40 min » */
export function libelleDuree(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}
