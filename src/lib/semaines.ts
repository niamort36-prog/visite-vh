/** Calendrier ISO 8601 : la semaine 1 est celle qui contient le 4 janvier. */

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function jourIso(d: Date): number {
  return (d.getUTCDay() + 6) % 7; // 0 = lundi … 6 = dimanche
}

/** Lundi de la semaine ISO demandée, en UTC. */
export function lundiDeSemaine(annee: number, semaine: number): Date {
  const jan4 = new Date(Date.UTC(annee, 0, 4));
  const lundiS1 = new Date(jan4);
  lundiS1.setUTCDate(jan4.getUTCDate() - jourIso(jan4));
  const d = new Date(lundiS1);
  d.setUTCDate(lundiS1.getUTCDate() + (semaine - 1) * 7);
  return d;
}

/** Numéro de semaine ISO d'une date, avec l'année ISO correspondante. */
export function semaineDe(date: Date): { annee: number; semaine: number } {
  // On se place sur le jeudi de la semaine : c'est lui qui porte l'année ISO.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 3 - jourIso(d));
  const annee = d.getUTCFullYear();
  const premierJanvier = new Date(Date.UTC(annee, 0, 1));
  const semaine = Math.ceil(((d.getTime() - premierJanvier.getTime()) / 86400000 + 1) / 7);
  return { annee, semaine };
}

/** 52 ou 53 selon l'année. */
export function nbSemaines(annee: number): number {
  return semaineDe(new Date(annee, 11, 28)).semaine;
}

/** Les sept dates (yyyy-mm-dd) de la semaine ISO. */
export function joursDeSemaine(annee: number, semaine: number): string[] {
  const lundi = lundiDeSemaine(annee, semaine);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lundi);
    d.setUTCDate(lundi.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** « Mardi 9 juin » */
export function libelleJour(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${JOURS[jourIso(d)]} ${d.getUTCDate()} ${d.toLocaleDateString('fr-FR', {
    month: 'long',
    timeZone: 'UTC',
  })}`;
}

/** « Lun. 9 » — pour les cases à cocher de la semaine. */
export function libelleJourCourt(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${JOURS[jourIso(d)].slice(0, 3)}. ${d.getUTCDate()}`;
}

/** « du 8 au 14 juin 2026 » */
export function libelleSemaine(annee: number, semaine: number): string {
  const j = joursDeSemaine(annee, semaine);
  const a = new Date(`${j[0]}T00:00:00Z`);
  const b = new Date(`${j[6]}T00:00:00Z`);
  const opts = { timeZone: 'UTC' } as const;
  const moisA = a.toLocaleDateString('fr-FR', { month: 'short', ...opts });
  const moisB = b.toLocaleDateString('fr-FR', { month: 'short', ...opts });
  return moisA === moisB
    ? `du ${a.getUTCDate()} au ${b.getUTCDate()} ${moisB} ${b.getUTCFullYear()}`
    : `du ${a.getUTCDate()} ${moisA} au ${b.getUTCDate()} ${moisB} ${b.getUTCFullYear()}`;
}

/** Décale une date ISO (yyyy-mm-dd) de `n` jours. */
export function ajouterJours(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours entre aujourd'hui et une date ISO (négatif si passée). */
export function joursAvant(iso: string): number {
  const a = new Date(`${iso}T00:00:00Z`).getTime();
  const n = new Date();
  const b = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((a - b) / 86400000);
}

/** « dans 12 jours », « aujourd'hui », « il y a 3 jours » */
export function delaiLisible(iso: string): string {
  const j = joursAvant(iso);
  if (j === 0) return "aujourd'hui";
  if (j === 1) return 'demain';
  if (j === -1) return 'hier';
  return j > 0 ? `dans ${j} jours` : `il y a ${-j} jours`;
}
