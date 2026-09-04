import type { Campagne, EntreeIndex, Ligne, Preparation } from '../types';
import type { Secteur } from '../state/store';
import { ajouterJours, joursDeSemaine, libelleSemaine } from './semaines';
import { nomTypeVol } from './vols';

export type CategorieTache =
  | 'gendarmerie'
  | 'agglo'
  | 'prescriptions'
  | 'preparation'
  | 'gdp'
  | 'zsm'
  | 'seveso'
  | 'azba'
  | 'lundi'
  | 'bilan';

/** Qui est concerné : tout le monde, ou seulement un centre, un GMR, une équipe. */
export type Portee =
  | { type: 'commune' }
  | { type: 'cm'; valeur: string }
  | { type: 'gmr'; valeur: string }
  | { type: 'eel'; valeur: string };

/** Rôle qui porte la démarche, selon la marche à suivre. */
export type Role = 'GET' | 'IL';

export interface Contact {
  libelle: string;
  valeur: string;
  type: 'mail' | 'lien' | 'personne';
  portee?: Portee;
}

export interface Tache {
  /** identifiant stable, pour retrouver l'état de la tâche d'une session à l'autre */
  id: string;
  categorie: CategorieTache;
  titre: string;
  /** précisions calculées : départements, sites, postes concernés… */
  detail?: string;
  /** points à effectuer, repris de la marche à suivre */
  points?: string[];
  contacts?: Contact[];
  portee: Portee;
  role: Role;
  /** date ISO à laquelle la tâche doit être faite */
  echeance: string;
  /** l'échéance est une date au plus tard : la démarche peut être anticipée */
  auPlusTard?: boolean;
  /** préparation dont découle la tâche */
  prepaId?: string;
  /** repère affiché : « S36 · VH bi-turbines » */
  reference?: string;
}

export const LIBELLE_CATEGORIE: Record<CategorieTache, string> = {
  gendarmerie: 'Gendarmeries',
  agglo: 'Survol agglo',
  prescriptions: 'Prescriptions',
  preparation: 'Préparation',
  gdp: 'Groupements de postes',
  zsm: 'Zone ZSM',
  seveso: 'Seveso',
  azba: 'AZBA / R368',
  lundi: 'Lundi matin',
  bilan: 'Après le vol',
};

/** Délais réglementaires ou d'usage, en jours avant le premier vol. */
const DELAI_PRESCRIPTIONS = 35;
const DELAI_SEMAINE = 7;

/** Adresse commune du STH pour les survols d'agglomération et les prescriptions. */
const STH_OPERATIONS: Contact = {
  libelle: 'RTE-CNER-STH-OPERATIONS-AERIENNES',
  valeur: 'rte-cner-sth-operations-aeriennes@rte-france.com',
  type: 'mail',
};

/** Boîtes génériques des groupements de postes, propres à l'équipe de Limoges. */
const GDP_LIMOGES: Contact[] = [
  {
    libelle: 'GDP Limousin — PEXI Les Casseaux',
    valeur: 'rte-cm-tou-gmr-mco-gdp-limousin-pexi-les-casseaux@rte-france.com',
    type: 'mail',
    portee: { type: 'eel', valeur: 'MCO Limoges' },
  },
  {
    libelle: 'GDP Centre — PEXI Rueyres',
    valeur: 'rte-cm-tou-gmr-mco-gdp-centre-pexi-rueyres@rte-france.com',
    type: 'mail',
    portee: { type: 'eel', valeur: 'MCO Limoges' },
  },
];

/** Premier jour de vol d'une préparation, ou à défaut le lundi de sa semaine. */
export function premierJour(p: Preparation): string {
  const retenus = [...p.jours].sort();
  return retenus[0] ?? joursDeSemaine(p.annee, p.semaine)[0];
}

/** Dernier jour de vol d'une préparation. */
export function dernierJour(p: Preparation): string {
  const retenus = [...p.jours].sort();
  return retenus[retenus.length - 1] ?? joursDeSemaine(p.annee, p.semaine)[4];
}

/** La portée d'une tâche correspond-elle au secteur de travail ? */
export function porteeApplicable(p: Portee, s: Secteur): boolean {
  switch (p.type) {
    case 'commune':
      return true;
    case 'cm':
      return !s.cm || s.cm === p.valeur;
    case 'gmr':
      return !s.gmr.length || s.gmr.includes(p.valeur);
    case 'eel':
      return !s.eel.length || s.eel.includes(p.valeur);
  }
}

export function libellePortee(p: Portee): string {
  switch (p.type) {
    case 'commune':
      return 'commun';
    case 'cm':
      return `CM ${p.valeur}`;
    case 'gmr':
      return `GMR ${p.valeur}`;
    case 'eel':
      return p.valeur;
  }
}

/**
 * Échéances d'une campagne, d'après la marche à suivre des visites héliportées.
 * Chaque démarche porte sa portée — commune, propre à un centre ou à une équipe —
 * de sorte qu'on ne voit que ce qui concerne son secteur.
 *
 * La semaine de vol elle-même ne donne pas d'échéance : ce qu'il s'y passe relève
 * de la conduite du vol, pas de la préparation.
 */
export function genererTaches(
  campagne: Campagne,
  depts: EntreeIndex[],
  preparations: Preparation[],
  lignes: Ligne[],
  secteur: Secteur,
): Tache[] {
  const taches: Tache[] = [];
  const parId = new Map(lignes.map((l) => [l.id, l]));
  const commune: Portee = { type: 'commune' };

  const ajouter = (t: Tache) => {
    if (porteeApplicable(t.portee, secteur)) taches.push(t);
  };

  const debut = campagne.debut ?? campagne.creeLe.slice(0, 10);

  // --- début d'année : autorisation de survol d'agglomération ----------
  ajouter({
    id: 'agglo:annee',
    categorie: 'agglo',
    titre: "Demandes de survol d'agglomération pour l'année",
    detail:
      "À adresser au STH. Indiquer l'adresse de la DZ, les départements survolés avec le nom " +
      'complet de chaque commune, et joindre une cartographie avec les lignes surlignées.',
    contacts: [STH_OPERATIONS],
    portee: commune,
    role: 'GET',
    echeance: `${campagne.annee}-01-01`,
    auPlusTard: true,
  });

  // --- dès réception du planning : courriers aux gendarmeries ----------
  for (const d of depts) {
    ajouter({
      id: `gendarmerie:${d.code}`,
      categorie: 'gendarmerie',
      titre: `Courrier à la gendarmerie — ${d.code} ${d.nom}`,
      detail:
        'Indiquer les semaines de vol ainsi que les immatriculations des hélicoptères. ' +
        `${d.nbLignes} lignes, ${Math.round(d.km)} km de réseau dans le département.`,
      portee: commune,
      role: 'GET',
      echeance: debut,
    });
  }

  // --- échéances liées à chaque préparation ----------------------------
  for (const p of preparations) {
    const jour1 = premierJour(p);
    const lundi = joursDeSemaine(p.annee, p.semaine)[0];
    const reference = `S${String(p.semaine).padStart(2, '0')} · ${nomTypeVol(p.typeVol)}`;
    const periode = libelleSemaine(p.annee, p.semaine);

    // ouvrages planifiés, dédoublonnés
    const ids = new Set<string>();
    for (const c of Object.values(p.creneaux))
      for (const v of [...c.matin, ...c.apresMidi]) ids.add(v.ligneId);
    const ouvrages = [...ids].map((id) => parId.get(id)).filter(Boolean) as Ligne[];

    if (p.typeVol === 'VH_BI') {
      ajouter({
        id: `prescriptions:${p.id}`,
        categorie: 'prescriptions',
        titre: 'Demander les prescriptions particulières pour les agglomérations survolées',
        detail: `Vol en bi-turbine ${periode}. Même adresse que la demande de survol d'agglomération.`,
        contacts: [STH_OPERATIONS],
        portee: commune,
        role: 'GET',
        echeance: ajouterJours(jour1, -DELAI_PRESCRIPTIONS),
        auPlusTard: true,
        prepaId: p.id,
        reference,
      });
    }

    // --- une semaine avant --------------------------------------------
    const uneSemaine = ajouterJours(jour1, -DELAI_SEMAINE);

    ajouter({
      id: `preparation:${p.id}`,
      categorie: 'preparation',
      titre: 'Faire la préparation de travail',
      points: [
        'Vérifier le fonctionnement de CARTEM.',
        "Reboucler avec la tête d'équipe sur les chantiers DI en cours (coactivité STH, haubans…) et les modifications réseau.",
      ],
      portee: commune,
      role: 'GET',
      echeance: uneSemaine,
      prepaId: p.id,
      reference,
    });

    const postes = new Set<string>();
    for (const l of ouvrages) for (const e of l.extremites) if (e) postes.add(e);
    ajouter({
      id: `gdp:${p.id}`,
      categorie: 'gdp',
      titre: 'Envoyer le planning aux groupements de postes concernés',
      detail: postes.size
        ? `Postes concernés : ${[...postes].sort().join(', ')}.`
        : "Aucun poste d'extrémité identifié sur les ouvrages planifiés.",
      points: [
        'Faire suivre la préparation au pilote.',
        "Demander aux GDP de ne pas délivrer d'autorisation de vol de drone sur les liaisons concernées.",
      ],
      contacts: GDP_LIMOGES.filter((c) => !c.portee || porteeApplicable(c.portee, secteur)),
      portee: commune,
      role: 'GET',
      echeance: uneSemaine,
      prepaId: p.id,
      reference,
    });

    ajouter({
      id: `zsm:${p.id}`,
      categorie: 'zsm',
      titre: 'Demander la zone ZSM',
      detail: 'Démarche propre au centre de maintenance de Toulouse.',
      contacts: [{ libelle: 'Sandra Frenesdo', valeur: 'Zone ZSM', type: 'personne' }],
      portee: { type: 'cm', valeur: 'Toulouse' },
      role: 'GET',
      echeance: uneSemaine,
      prepaId: p.id,
      reference,
    });

    // sites Seveso survolés : la demande n'a lieu d'être que s'il y en a
    const sites = new Map<string, string>();
    for (const l of ouvrages) for (const s of l.seveso ?? []) sites.set(s.id, s.n);
    if (sites.size) {
      ajouter({
        id: `seveso:${p.id}`,
        categorie: 'seveso',
        titre: 'Envoyer les demandes de survol des zones Seveso',
        detail: `${sites.size} site${sites.size > 1 ? 's' : ''} : ${[...sites.values()].join(', ')}.`,
        portee: commune,
        role: 'GET',
        echeance: uneSemaine,
        prepaId: p.id,
        reference,
      });
    }

    ajouter({
      id: `azba:${p.id}`,
      categorie: 'azba',
      titre: 'Consulter les activations AZBA et R368 (zone centre)',
      detail: `Première vérification pour les vols ${periode} ; à confirmer le lundi matin.`,
      contacts: [
        {
          libelle: 'Zones militaires actives (SIA)',
          valeur: 'https://www.sia.aviation-civile.gouv.fr/schedules',
          type: 'lien',
        },
      ],
      portee: commune,
      role: 'GET',
      echeance: uneSemaine,
      prepaId: p.id,
      reference,
    });

    ajouter({
      id: `il-semaine:${p.id}`,
      categorie: 'preparation',
      titre: 'Préparer le matériel et vérifier la disponibilité des lignes',
      points: [
        'Vérifier que les retours de visites IL sont faits.',
        'Vérifier que les lignes prévues sont disponibles.',
        "Charger les piles des casques et de l'appareil photo.",
      ],
      portee: commune,
      role: 'IL',
      echeance: uneSemaine,
      prepaId: p.id,
      reference,
    });

    // --- lundi matin avant le vol -------------------------------------
    ajouter({
      id: `lundi:${p.id}`,
      categorie: 'lundi',
      titre: 'Vérifications du lundi matin',
      points: [
        'Vérifier les demandes particulières pour les VH (coordination technique, MDP adjoint).',
        'Voir les zones militaires actives.',
        "Reboucler avec le pilote pour l'heure d'arrivée et le NOTAM de la semaine.",
        "Sortir l'extincteur.",
      ],
      contacts: [
        {
          libelle: 'Zones militaires actives (SIA)',
          valeur: 'https://www.sia.aviation-civile.gouv.fr/schedules',
          type: 'lien',
        },
      ],
      portee: commune,
      role: 'GET',
      echeance: lundi,
      prepaId: p.id,
      reference,
    });

    ajouter({
      id: `il-lundi:${p.id}`,
      categorie: 'lundi',
      titre: "Préparer la voiture et le matériel de l'équipage",
      points: ["Préparer la voiture pour l'équipage.", "Sortir l'extincteur.", 'Charger la visite.'],
      portee: commune,
      role: 'IL',
      echeance: lundi,
      prepaId: p.id,
      reference,
    });

    // --- après la semaine de vol --------------------------------------
    const apres = ajouterJours(dernierJour(p), 1);

    ajouter({
      id: `bilan:${p.id}`,
      categorie: 'bilan',
      titre: 'Trier les alertes végétation et mettre à jour le suivi',
      points: [
        'Trier les alertes végétation et les transmettre à la cellule végétation.',
        "Mettre à jour le tableau d'avancement.",
      ],
      portee: commune,
      role: 'GET',
      echeance: apres,
      prepaId: p.id,
      reference,
    });

    ajouter({
      id: `il-bilan:${p.id}`,
      categorie: 'bilan',
      titre: 'Exploiter la visite',
      points: [
        'Décharger et trier les photos.',
        "Créer les avis IL et adresser par mail un rapport de synthèse à la tête d'équipe (coordination, adjoint, MDP).",
        "Ranger l'extincteur.",
        'Décharger la visite du mobiligne.',
      ],
      portee: commune,
      role: 'IL',
      echeance: apres,
      prepaId: p.id,
      reference,
    });
  }

  return taches.sort(
    (a, b) => a.echeance.localeCompare(b.echeance) || a.titre.localeCompare(b.titre, 'fr'),
  );
}
