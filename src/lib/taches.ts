import type { Campagne, EntreeIndex, Ligne, Preparation } from '../types';
import { ajouterJours, joursDeSemaine, libelleSemaine } from './semaines';
import { nomTypeVol } from './vols';

export type CategorieTache = 'gendarmerie' | 'sth' | 'seveso' | 'azba' | 'groupement';

export interface Tache {
  /** identifiant stable, pour retrouver l'état de la tâche d'une session à l'autre */
  id: string;
  categorie: CategorieTache;
  titre: string;
  /** précisions calculées : départements, sites, postes concernés… */
  detail?: string;
  /** date ISO à laquelle la tâche doit être faite */
  echeance: string;
  /** préparation dont découle la tâche */
  prepaId?: string;
  /** repère affiché : « S36 · VH bi-turbines » */
  reference?: string;
}

export const LIBELLE_CATEGORIE: Record<CategorieTache, string> = {
  gendarmerie: 'Gendarmeries',
  sth: 'STH',
  seveso: 'Seveso',
  azba: 'AZBA / R368',
  groupement: 'Groupements de postes',
};

/** Délais réglementaires ou d'usage, en jours avant le premier vol. */
const DELAI_STH = 35;
const DELAI_SEMAINE = 7;

/** Premier jour de vol d'une préparation, ou à défaut le lundi de sa semaine. */
export function premierJour(p: Preparation): string {
  const retenus = [...p.jours].sort();
  return retenus[0] ?? joursDeSemaine(p.annee, p.semaine)[0];
}

/**
 * Construit la liste des échéances d'une campagne à partir de son secteur et de
 * ses préparations. Les tâches sont recalculées à chaque affichage : seul leur
 * état (faite ou non) est conservé.
 */
export function genererTaches(
  campagne: Campagne,
  depts: EntreeIndex[],
  preparations: Preparation[],
  lignes: Ligne[],
): Tache[] {
  const taches: Tache[] = [];
  const parId = new Map(lignes.map((l) => [l.id, l]));

  // --- début de campagne : courriers aux gendarmeries ------------------
  const debut = campagne.debut ?? campagne.creeLe.slice(0, 10);
  for (const d of depts) {
    taches.push({
      id: `gendarmerie:${d.code}`,
      categorie: 'gendarmerie',
      titre: `Courrier à la gendarmerie — ${d.code} ${d.nom}`,
      detail: `${d.nbLignes} lignes, ${Math.round(d.km)} km de réseau dans le département.`,
      echeance: debut,
    });
  }

  // --- échéances liées à chaque préparation ----------------------------
  for (const p of preparations) {
    const jour1 = premierJour(p);
    const reference = `S${String(p.semaine).padStart(2, '0')} · ${nomTypeVol(p.typeVol)}`;
    const periode = libelleSemaine(p.annee, p.semaine);

    // ouvrages planifiés, dédoublonnés
    const ids = new Set<string>();
    for (const c of Object.values(p.creneaux))
      for (const v of [...c.matin, ...c.apresMidi]) ids.add(v.ligneId);
    const ouvrages = [...ids].map((id) => parId.get(id)).filter(Boolean) as Ligne[];

    if (p.typeVol === 'VH_BI') {
      taches.push({
        id: `sth:${p.id}`,
        categorie: 'sth',
        titre: 'Envoyer les demandes au STH',
        detail: `Vol en bi-turbine ${periode} — à transmettre cinq semaines avant.`,
        echeance: ajouterJours(jour1, -DELAI_STH),
        prepaId: p.id,
        reference,
      });
    }

    // sites Seveso survolés : la demande n'a lieu d'être que s'il y en a
    const sites = new Map<string, string>();
    for (const l of ouvrages) for (const s of l.seveso ?? []) sites.set(s.id, s.n);
    if (sites.size) {
      taches.push({
        id: `seveso:${p.id}`,
        categorie: 'seveso',
        titre: 'Envoyer les demandes de survol des zones Seveso',
        detail: `${sites.size} site${sites.size > 1 ? 's' : ''} : ${[...sites.values()].join(', ')}.`,
        echeance: ajouterJours(jour1, -DELAI_SEMAINE),
        prepaId: p.id,
        reference,
      });
    }

    taches.push({
      id: `azba:${p.id}`,
      categorie: 'azba',
      titre: 'Consulter les activations AZBA et R368 (zone centre)',
      detail: `À vérifier pour les vols ${periode}.`,
      echeance: ajouterJours(jour1, -DELAI_SEMAINE),
      prepaId: p.id,
      reference,
    });

    // postes d'extrémité des ouvrages planifiés, pour situer les groupements
    const postes = new Set<string>();
    for (const l of ouvrages) for (const e of l.extremites) if (e) postes.add(e);
    taches.push({
      id: `groupement:${p.id}`,
      categorie: 'groupement',
      titre: 'Envoyer la préparation de vol aux groupements de postes',
      detail: postes.size
        ? `Postes concernés : ${[...postes].sort().join(', ')}.`
        : "Aucun poste d'extrémité identifié sur les ouvrages planifiés.",
      echeance: ajouterJours(jour1, -DELAI_SEMAINE),
      prepaId: p.id,
      reference,
    });
  }

  return taches.sort((a, b) => a.echeance.localeCompare(b.echeance) || a.titre.localeCompare(b.titre, 'fr'));
}
