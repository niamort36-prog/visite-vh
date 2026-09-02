/** Code couleur des tensions, aligné sur les conventions de représentation RTE. */
export const COULEUR_TENSION: Record<number, string> = {
  400: '#e2261c',
  225: '#12924f',
  150: '#8b5cf6',
  90: '#1d6fd0',
  63: '#e8a317',
};

export const EPAISSEUR_TENSION: Record<number, number> = {
  400: 3.4,
  225: 2.8,
  150: 2.4,
  90: 2.2,
  63: 1.9,
};

export function couleur(tension: number): string {
  return COULEUR_TENSION[tension] ?? '#6b7280';
}

export function epaisseur(tension: number): number {
  return EPAISSEUR_TENSION[tension] ?? 2;
}

export const TENSIONS = [400, 225, 150, 90, 63];

export const COULEUR_STATUT: Record<string, string> = {
  a_faire: '#94a3b8',
  en_cours: '#f59e0b',
  fait: '#16a34a',
  hors_perimetre: '#cbd5e1',
};

export const LIBELLE_STATUT: Record<string, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  fait: 'Terminée',
  hors_perimetre: 'Hors périmètre',
};
