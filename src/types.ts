/** Modèle de données partagé entre le pipeline (scripts/) et l'application. */

export type Tension = 63 | 90 | 150 | 225 | 400;

/** Un support (pylône) le long d'une ligne. */
export interface Pylone {
  /** rang du pylône sur la ligne, à partir de l'extrémité A (1-based) */
  i: number;
  /** numéro officiel quand il est connu, sinon le rang formaté */
  num: string;
  /** true si le numéro vient d'une source de terrain (OSM `ref`) et non du rang calculé */
  numReel: boolean;
  lat: number;
  lon: number;
  /** distance cumulée depuis l'extrémité A, en km */
  d: number;
}

export interface Ligne {
  id: string;
  /** libellé lisible : « AVOINE - DISTRÉ » */
  nom: string;
  /** code d'ouvrage RTE quand l'appariement a réussi (ex. AVOIN L41 DISTR) */
  codeRte?: string;
  /** libellé officiel ODRE quand il est connu */
  nomRte?: string;
  /** codes d'ouvrage possibles lorsque l'appariement reste ambigu (plusieurs circuits) */
  candidatsRte?: string[];
  /** aucune extrémité nommée dans OSM : l'ouvrage reste à rattacher par l'exploitant */
  aIdentifier?: boolean;
  /** sites Seveso à moins de 2 km du tracé, du plus proche au plus éloigné */
  seveso?: SiteSeveso[];
  /** traversée d'agglomération : kilomètres concernés et nombre de zones */
  agglo?: { km: number; n: number };
  tension: Tension;
  operateur: string;
  nbCircuits?: number;
  /** longueur totale en km */
  km: number;
  nbPylones: number;
  /** codes départements traversés */
  depts: string[];
  /** noms des postes d'extrémité, quand ils sont identifiés */
  extremites: [string, string];
  /** tracé (lat, lon) pour l'affichage */
  geom: [number, number][];
  pylones: Pylone[];
}

export interface Poste {
  id: string;
  nom: string;
  code?: string;
  tension: number;
  operateur: string;
  fonction?: string;
  lat: number;
  lon: number;
}

export interface JeuDepartement {
  code: string;
  nom: string;
  lignes: Ligne[];
  postes: Poste[];
}

export interface EntreeIndex {
  code: string;
  nom: string;
  region?: string;
  nbLignes: number;
  nbPylones: number;
  nbPostes: number;
  km: number;
  /** taille du fichier en octets, pour annoncer le poids du téléchargement hors-ligne */
  taille: number;
  /** emprise [sud, ouest, nord, est] */
  bbox: [number, number, number, number];
}

export interface IndexReseau {
  genereLe: string;
  version: number;
  departements: EntreeIndex[];
}

/* ------------------------------------------------------------------ */
/* Suivi des visites — données saisies par l'utilisateur                */
/* ------------------------------------------------------------------ */

export type StatutLigne = 'a_faire' | 'en_cours' | 'fait' | 'hors_perimetre';

/**
 * Nature d'une visite. Les vols en mono et en bi-turbine relèvent tous deux de la
 * visite héliportée : c'est le même travail, avec le même avancement.
 */
export type NatureVisite = 'VH' | 'VTIR' | 'LIDAR';

export interface Observation {
  id: string;
  ligneId: string;
  /** rang du pylône concerné */
  pyloneI: number;
  pyloneNum: string;
  date: string;
  gravite: 1 | 2 | 3;
  texte: string;
}

/**
 * Avancement d'une ligne pour une nature de visite donnée. Une même ligne peut
 * être survolée en VH, en VTIR et en LiDAR à des dates différentes, chacune avec
 * sa propre progression.
 */
export interface AvancementVisite {
  statut: StatutLigne;
  /** rang du dernier pylône effectivement survolé */
  avancement?: number;
  dateDebut?: string;
  dateFin?: string;
  /** date de la dernière mise à jour de l'avancement */
  dateMaj?: string;
}

export interface SuiviLigne {
  ligneId: string;
  /** pylône frontière de début (rang) — commun à toutes les natures de visite */
  debut?: number;
  /** pylône frontière de fin (rang) */
  fin?: number;
  note?: string;
  /** libellé saisi par l'exploitant, prioritaire sur le nom reconstitué */
  nomPerso?: string;
  /** ouvrage RTE rattaché à la main depuis le catalogue officiel */
  codeRtePerso?: string;
  nomRtePerso?: string;
  /** progression par nature de visite */
  visites: Record<NatureVisite, AvancementVisite>;
}

export interface Campagne {
  id: string;
  nom: string;
  annee: number;
  creeLe: string;
  /** date de début de campagne, qui sert d'échéance aux démarches initiales */
  debut?: string;
  /** départements chargés dans cette campagne */
  depts: string[];
}

export interface Sauvegarde {
  format: 'visite-vh';
  version: number;
  exporteLe: string;
  campagnes: Campagne[];
  suivis: Record<string, SuiviLigne[]>;
  observations: Record<string, Observation[]>;
  preparations?: Record<string, Preparation[]>;
  helicopteres?: Helicoptere[];
  contactsSeveso?: Record<string, ContactSeveso>;
  aggloManuel?: Record<string, boolean>;
  taches?: Record<string, Record<string, EtatTache>>;
}

/* ------------------------------------------------------------------ */
/* Préparations de vol                                                  */
/* ------------------------------------------------------------------ */

export type TypeVol = 'VH_MONO' | 'VH_BI' | 'VTIR' | 'LIDAR';

/** Appareil enregistré une fois, puis proposé dans les préparations. */
export interface Helicoptere {
  id: string;
  immatriculation: string;
  modele?: string;
  exploitant?: string;
  /** mono ou bi-turbine, pour filtrer les appareils selon le type de vol */
  turbines?: 1 | 2;
}

/** Une ligne du planning : un ouvrage à survoler dans une demi-journée. */
export interface VolLigne {
  id: string;
  ligneId: string;
  /** libellé, tension et kilométrage figés à l'ajout, pour rester lisibles
   *  même si le département n'est pas chargé au moment de la relecture */
  nom: string;
  tension: number;
  km: number;
  /** durée saisie à la main ; sinon elle découle des km et de la vitesse */
  dureeMin?: number;
  commentaire?: string;
}

export type DemiJournee = 'matin' | 'apresMidi';

export interface Creneau {
  matin: VolLigne[];
  apresMidi: VolLigne[];
}

export interface Preparation {
  id: string;
  campagneId: string;
  annee: number;
  /** numéro de semaine ISO */
  semaine: number;
  typeVol: TypeVol;
  /** vitesse moyenne de progression retenue, en km/h */
  vitesse: number;
  oan?: string;
  pilote?: string;
  immatriculation?: string;
  /** dates ISO retenues dans la semaine */
  jours: string[];
  /** planning par date, puis par demi-journée */
  creneaux: Record<string, Creneau>;
  note?: string;
  creeLe: string;
}

/** Terrain d'aviation, issu du référentiel OurAirports. */
export interface Aerodrome {
  /** code OACI, vide pour les terrains qui n'en ont pas */
  c: string;
  /** nom */
  n: string;
  /** commune */
  v: string;
  /** type OurAirports (large_airport, heliport…) */
  t: string;
  /** latitude */
  y: number;
  /** longitude */
  x: number;
}

/** Établissement Seveso proche d'un ouvrage (source Géorisques). */
export interface SiteSeveso {
  /** identifiant national (AIOT) */
  id: string;
  /** raison sociale */
  n: string;
  /** seuil haut ou bas */
  t: 'haut' | 'bas';
  /** adresse */
  a: string;
  /** commune */
  c: string;
  /** activité */
  act: string;
  /** état administratif */
  s: string;
  y: number;
  x: number;
  /** distance au tracé, en km */
  d: number;
}

/** Coordonnées d'un site Seveso, saisies par l'exploitant : absentes de l'open data. */
export interface ContactSeveso {
  telephone?: string;
  courriel?: string;
  note?: string;
}

/** État d'une échéance : les tâches elles-mêmes sont recalculées, pas stockées. */
export interface EtatTache {
  fait: boolean;
  /** date de réalisation */
  le?: string;
  note?: string;
}
