import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AvancementVisite,
  Campagne,
  ContactSeveso,
  Creneau,
  DemiJournee,
  EtatTache,
  Helicoptere,
  IndexReseau,
  Ligne,
  Observation,
  Poste,
  Preparation,
  NatureVisite,
  Sauvegarde,
  StatutLigne,
  SuiviLigne,
  TypeVol,
  PointCarburant,
  VolLigne,
  ZoneDePoser,
  ZoneSurvolee,
} from '../types';
import { natureDuTypeVol, vitesseParDefaut } from '../lib/vols';
import { chargerDept, chargerIndex } from '../data/reseau';
import type { ReferentielRte } from '../data/rte';
import {
  apparier,
  appliquerNumeros,
  bilan,
  couvre,
  type BilanAppariement,
  type RattachementLigne,
  type SectionRte,
} from '../data/appariement';

const CLE = 'visite-vh:v1';
/**
 * Le référentiel RTE est conservé à part : il pèse quelques centaines de kilo-octets
 * et n'a pas à être relu à chaque écriture du suivi.
 */
const CLE_RTE = 'visite-vh:rte';

function lireReferentielLocal(): ReferentielRte | null {
  try {
    const brut = localStorage.getItem(CLE_RTE);
    return brut ? (JSON.parse(brut) as ReferentielRte) : null;
  } catch {
    return null;
  }
}

interface Persiste {
  campagnes: Campagne[];
  campagneCourante: string;
  /** départements réellement chargés — détail interne, déduit du secteur */
  depts: string[];
  /** secteur de travail, exprimé en centres de maintenance et GMR */
  secteur: Secteur;
  /** marque la bascule vers le secteur restreint au référentiel */
  secteurRestreint?: boolean;
  suivis: Record<string, SuiviLigne[]>;
  /** notes de ligne, communes à toutes les campagnes */
  notes: Record<string, string>;
  /** observations, communes à toutes les campagnes : elles se reportent d'une année sur l'autre */
  observations: Observation[];
  /** préparations de vol, par campagne */
  preparations: Record<string, Preparation[]>;
  /** flotte connue, commune à toutes les campagnes */
  helicopteres: Helicoptere[];
  /** zones de poser, une ou plusieurs par GMR */
  zonesDePoser: ZoneDePoser[];
  /** points de ravitaillement en carburant aviation */
  pointsCarburant: PointCarburant[];
  /** coordonnées des sites Seveso, saisies par l'exploitant, par identifiant AIOT */
  contactsSeveso: Record<string, ContactSeveso>;
  /**
   * Corrections de la détection d'agglomération, par ouvrage : true pour en
   * ajouter une que les données ont manquée, false pour en retirer une de trop.
   * Hors campagne : la traversée est une caractéristique de la ligne.
   */
  aggloManuel: Record<string, boolean>;
  /** état des échéances, par campagne puis par identifiant de tâche */
  taches: Record<string, Record<string, EtatTache>>;
}

/**
 * Secteur de travail. Le réseau est stocké par département, mais l'exploitant
 * raisonne en centre de maintenance et en GMR : le découpage administratif ne
 * sert plus qu'à savoir quels fichiers charger.
 */
export interface Secteur {
  /** centre de maintenance retenu, vide pour « tous » */
  cm: string;
  /** GMR retenus ; vide signifie « tout le centre » */
  gmr: string[];
  /** équipes (EEL) retenues ; vide signifie « tout le GMR » */
  eel: string[];
  /** afficher aussi les ouvrages que le référentiel ne rattache à aucun GMR */
  inclureNonRattaches: boolean;
}

/*
 * Une fois le référentiel importé, il fait autorité : les ouvrages qu'il ne
 * rattache pas au secteur retenu — réseaux voisins captés par l'emprise
 * départementale — sortent de la liste et de la carte. La case du panneau
 * Secteur permet de les faire revenir.
 */
const SECTEUR_VIDE: Secteur = { cm: '', gmr: [], eel: [], inclureNonRattaches: false };

/**
 * Filtres d'affichage. Ils valent pour la liste comme pour la carte : masquer un
 * domaine de tension doit le faire disparaître des deux. Ils ne sont pas
 * enregistrés — retrouver la carte amputée au démarrage, sans savoir pourquoi,
 * serait plus gênant qu'utile.
 */
export interface FiltresAffichage {
  /** tensions retenues ; vide signifie toutes */
  tensions: number[];
  /** statuts de visite héliportée retenus ; vide signifie tous */
  statuts: StatutLigne[];
  /** GMR retenus à l'intérieur du secteur ; vide signifie tous */
  gmr: string[];
  /** n'afficher que les ouvrages traversant une agglomération */
  aggloSeules: boolean;
  /** n'afficher que les ouvrages proches d'un site Seveso */
  sevesoSeules: boolean;
  /** n'afficher que les ouvrages restant à identifier */
  aIdentifierSeules: boolean;
  /** afficher les postes sur la carte */
  postes: boolean;
  /** afficher aussi les postes des autres exploitants (traction, production, industrie) */
  postesAutres: boolean;
}

export const FILTRES_VIDES: FiltresAffichage = {
  tensions: [],
  statuts: [],
  gmr: [],
  aggloSeules: false,
  sevesoSeules: false,
  aIdentifierSeules: false,
  postes: true,
  postesAutres: false,
};

/** Un filtre est-il actif, hors affichage des postes ? */
export function filtresActifs(f: FiltresAffichage): boolean {
  return (
    f.tensions.length > 0 ||
    f.statuts.length > 0 ||
    f.gmr.length > 0 ||
    f.aggloSeules ||
    f.sevesoSeules ||
    f.aIdentifierSeules
  );
}

function campagneParDefaut(): Campagne {
  const annee = new Date().getFullYear();
  return {
    id: `c${Date.now()}`,
    nom: `Campagne ${annee}`,
    annee,
    creeLe: new Date().toISOString(),
    depts: [],
  };
}

/** Avancement vierge. */
function visiteVide(): AvancementVisite {
  return { statut: 'a_faire', zones: [] };
}

function nouvelId(prefixe: string): string {
  return `${prefixe}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function suiviVide(ligneId: string): SuiviLigne {
  return {
    ligneId,
    visites: { VH: visiteVide(), VTIR: visiteVide(), LIDAR: visiteVide() },
  };
}

/**
 * Les suivis enregistrés avant la séparation par nature portaient un unique
 * avancement : il correspondait aux visites héliportées, on le reverse dans VH.
 */
/** Un avancement d'avant les zones : le dernier pylône survolé devient une zone. */
function migrerVisite(v: unknown, debut: number): AvancementVisite {
  const a = (v ?? {}) as Record<string, unknown>;
  if (Array.isArray(a.zones)) return a as unknown as AvancementVisite;
  const jusqua = a.avancement as number | undefined;
  const zones: ZoneSurvolee[] =
    jusqua != null && jusqua > debut
      ? [
          {
            id: nouvelId('z'),
            debut,
            fin: jusqua,
            date: (a.dateFin as string) || (a.dateDebut as string) || undefined,
          },
        ]
      : [];
  return {
    statut: (a.statut as StatutLigne) ?? 'a_faire',
    zones,
    dateDebut: a.dateDebut as string | undefined,
    dateFin: a.dateFin as string | undefined,
    dateMaj: a.dateMaj as string | undefined,
  };
}

function migrerSuivi(brut: unknown): SuiviLigne {
  const b = brut as Record<string, unknown>;
  const debut = (b.debut as number) ?? 1;
  if (b.visites) {
    const v = b.visites as Record<string, unknown>;
    return {
      ...(b as unknown as SuiviLigne),
      visites: {
        VH: migrerVisite(v.VH, debut),
        VTIR: migrerVisite(v.VTIR, debut),
        LIDAR: migrerVisite(v.LIDAR, debut),
      },
    };
  }
  const { statut, avancement, dateDebut, dateFin, dateMaj, note, ...reste } = b;
  return {
    ...(reste as unknown as Omit<SuiviLigne, 'visites'>),
    visites: {
      VH: migrerVisite({ statut, avancement, dateDebut, dateFin, dateMaj }, debut),
      VTIR: visiteVide(),
      LIDAR: visiteVide(),
    },
  };
}

/** Les notes portées par les suivis rejoignent le magasin commun aux campagnes. */
function extraireNotes(suivis: Record<string, SuiviLigne[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const liste of Object.values(suivis ?? {}))
    for (const s of liste ?? []) {
      const n = (s as unknown as { note?: string }).note;
      if (n && !out[s.ligneId]) out[s.ligneId] = n;
    }
  return out;
}

/** Les observations étaient rangées par campagne : on les réunit. */
function migrerObservations(brut: unknown): Observation[] {
  if (Array.isArray(brut)) return brut as Observation[];
  const parId = new Map<string, Observation>();
  for (const liste of Object.values((brut ?? {}) as Record<string, Observation[]>))
    for (const o of liste ?? []) parId.set(o.id, o);
  return [...parId.values()];
}

function migrerSuivis(
  suivis: Record<string, SuiviLigne[]>,
): Record<string, SuiviLigne[]> {
  const out: Record<string, SuiviLigne[]> = {};
  for (const [cid, liste] of Object.entries(suivis ?? {}))
    out[cid] = (liste ?? []).map((x) => migrerSuivi(x));
  return out;
}

function lire(): Persiste {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) {
      const p = JSON.parse(brut) as Persiste;
      // champs ajoutés après coup : on complète les états enregistrés plus tôt
      if (p.campagnes?.length)
        return {
          ...p,
          // un secteur enregistré avant l'ajout des équipes n'a pas le champ eel ;
          // et le référentiel restreint désormais le secteur par défaut, ce qui
          // se réapplique une fois aux états enregistrés auparavant
          secteur: p.secteurRestreint
            ? { ...SECTEUR_VIDE, ...(p.secteur ?? {}) }
            : { ...SECTEUR_VIDE, ...(p.secteur ?? {}), inclureNonRattaches: false },
          secteurRestreint: true,
          notes: p.notes ?? extraireNotes(p.suivis),
          observations: migrerObservations(p.observations),
          suivis: migrerSuivis(p.suivis),
          preparations: p.preparations ?? {},
          helicopteres: p.helicopteres ?? [],
          zonesDePoser: p.zonesDePoser ?? [],
          pointsCarburant: p.pointsCarburant ?? [],
          contactsSeveso: p.contactsSeveso ?? {},
          aggloManuel: p.aggloManuel ?? {},
          taches: p.taches ?? {},
        };
    }
  } catch {
    /* stockage indisponible ou corrompu : on repart d'un état vierge */
  }
  const c = campagneParDefaut();
  return {
    campagnes: [c],
    campagneCourante: c.id,
    depts: [],
    secteur: SECTEUR_VIDE,
    secteurRestreint: true,
    suivis: { [c.id]: [] },
    notes: {},
    observations: [],
    preparations: { [c.id]: [] },
    helicopteres: [],
    zonesDePoser: [],
    pointsCarburant: [],
    contactsSeveso: {},
    aggloManuel: {},
    taches: { [c.id]: {} },
  };
}

interface Ctx {
  index: IndexReseau | null;
  chargement: boolean;
  erreur: string | null;

  depts: string[];
  setDepts: (d: string[]) => void;
  secteur: Secteur;
  setSecteur: (s: Secteur) => void;
  /** centres de maintenance et GMR proposés par le référentiel */
  zonesDisponibles: {
    cm: string[];
    gmrParCm: Record<string, string[]>;
    /** équipes d'entretien de lignes, par GMR */
    eelParGmr: Record<string, string[]>;
  };

  /** ouvrages du secteur, avant filtres d'affichage */
  lignes: Ligne[];
  /** ouvrages effectivement montrés dans la liste et sur la carte */
  lignesAffichees: Ligne[];
  postes: Poste[];
  filtres: FiltresAffichage;
  setFiltres: (f: FiltresAffichage) => void;

  /** référentiel RTE importé localement par l'exploitant, jamais publié */
  referentiel: ReferentielRte | null;
  setReferentiel: (r: ReferentielRte | null) => void;
  /** rattachement des tracés chargés aux ouvrages du référentiel */
  rattachements: Map<string, RattachementLigne>;
  rattachement: (ligneId: string) => RattachementLigne | undefined;
  /** pylônes frontières déduits du référentiel pour le secteur retenu */
  bornesSecteur: (ligneId: string) => { debut: number; fin: number } | undefined;
  /** suivi tel qu'enregistré, sans les frontières déduites */
  suiviBrut: (ligneId: string) => SuiviLigne;
  bilanRte: BilanAppariement | null;

  campagnes: Campagne[];
  campagneCourante: string;
  setCampagneCourante: (id: string) => void;
  creerCampagne: (nom: string, annee: number) => void;
  supprimerCampagne: (id: string) => void;
  majCampagne: (id: string, patch: Partial<Campagne>) => void;

  suivi: (ligneId: string) => SuiviLigne;
  majSuivi: (ligneId: string, patch: Partial<SuiviLigne>) => void;
  /** met à jour l'avancement d'une ligne pour une nature de visite */
  majVisite: (ligneId: string, nature: NatureVisite, patch: Partial<AvancementVisite>) => void;
  /** nature de visite que les actions de saisie alimentent */
  natureCourante: NatureVisite;
  setNatureCourante: (n: NatureVisite) => void;
  /** observations de tous les millésimes : elles se reportent d'une campagne à l'autre */
  observations: Observation[];
  ajouterObservation: (o: Omit<Observation, 'id'>) => void;
  supprimerObservation: (id: string) => void;
  /** note libre par ouvrage, elle aussi conservée d'une année sur l'autre */
  note: (ligneId: string) => string;
  setNote: (ligneId: string, texte: string) => void;
  /** ajoute une zone survolée à une ligne, pour une nature de visite */
  ajouterZone: (
    ligneId: string,
    nature: NatureVisite,
    zone: Omit<ZoneSurvolee, 'id'>,
  ) => void;
  majZone: (
    ligneId: string,
    nature: NatureVisite,
    zoneId: string,
    patch: Partial<ZoneSurvolee>,
  ) => void;
  supprimerZone: (ligneId: string, nature: NatureVisite, zoneId: string) => void;

  ligneActive: string | null;
  setLigneActive: (id: string | null) => void;

  preparations: Preparation[];
  creerPreparation: (annee: number, semaine: number, typeVol: TypeVol) => string;
  majPreparation: (id: string, patch: Partial<Preparation>) => void;
  supprimerPreparation: (id: string) => void;
  dupliquerPreparation: (id: string) => void;
  ajouterVol: (
    prepaId: string,
    jour: string,
    demi: DemiJournee,
    vol: Omit<VolLigne, 'id'>,
  ) => void;
  majVol: (
    prepaId: string,
    jour: string,
    demi: DemiJournee,
    volId: string,
    patch: Partial<VolLigne>,
  ) => void;
  supprimerVol: (prepaId: string, jour: string, demi: DemiJournee, volId: string) => void;
  deplacerVol: (
    prepaId: string,
    jour: string,
    demi: DemiJournee,
    volId: string,
    sens: -1 | 1,
  ) => void;

  helicopteres: Helicoptere[];
  ajouterHelicoptere: (h: Omit<Helicoptere, 'id'>) => void;
  supprimerHelicoptere: (id: string) => void;

  zonesDePoser: ZoneDePoser[];
  ajouterZoneDePoser: (z: Omit<ZoneDePoser, 'id'>) => void;
  majZoneDePoser: (id: string, patch: Partial<ZoneDePoser>) => void;
  supprimerZoneDePoser: (id: string) => void;

  pointsCarburant: PointCarburant[];
  ajouterPointCarburant: (c: Omit<PointCarburant, 'id'>) => void;
  majPointCarburant: (id: string, patch: Partial<PointCarburant>) => void;
  supprimerPointCarburant: (id: string) => void;

  contactsSeveso: Record<string, ContactSeveso>;
  majContactSeveso: (id: string, patch: ContactSeveso) => void;

  aggloManuel: Record<string, boolean>;
  /** `null` rétablit la détection automatique. */
  setAggloManuel: (ligneId: string, valeur: boolean | null) => void;

  /** état des échéances de la campagne courante */
  taches: Record<string, EtatTache>;
  majTache: (tacheId: string, patch: Partial<EtatTache>) => void;

  exporter: () => void;
  importer: (fichier: File) => Promise<void>;
}

/** Fusionne deux flottes sans doublon d'immatriculation. */
function fusionnerHelicos(a: Helicoptere[], b: Helicoptere[]): Helicoptere[] {
  const parImmat = new Map(a.map((h) => [h.immatriculation, h]));
  for (const h of b) if (!parImmat.has(h.immatriculation)) parImmat.set(h.immatriculation, h);
  return [...parImmat.values()].sort((x, y) =>
    x.immatriculation.localeCompare(y.immatriculation),
  );
}

/** Créneau existant, ou créneau vide. */
function creneauDe(p: Preparation, jour: string): Creneau {
  return p.creneaux[jour] ?? { matin: [], apresMidi: [] };
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<Persiste>(lire);
  const [index, setIndex] = useState<IndexReseau | null>(null);
  const [lignesChargees, setLignesChargees] = useState<Ligne[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ligneActive, setLigneActive] = useState<string | null>(null);
  const [natureCourante, setNatureCourante] = useState<NatureVisite>('VH');
  const [filtres, setFiltres] = useState<FiltresAffichage>(FILTRES_VIDES);
  const [referentiel, setReferentielEtat] = useState<ReferentielRte | null>(lireReferentielLocal);
  const [rattachements, setRattachements] = useState<Map<string, RattachementLigne>>(new Map());
  const compteur = useRef(0);

  /**
   * La fiche imprimable s'ouvre dans une seconde fenêtre, sur le même stockage.
   * Sans cette écoute, la dernière fenêtre à écrire écraserait le travail de
   * l'autre : chacune se recale sur ce que l'autre vient d'enregistrer.
   */
  const ecritureLocale = useRef(false);
  useEffect(() => {
    const surStockage = (e: StorageEvent) => {
      if (e.key !== CLE || !e.newValue || ecritureLocale.current) return;
      try {
        setEtat(JSON.parse(e.newValue) as Persiste);
      } catch {
        /* valeur illisible : on garde l'état courant */
      }
    };
    window.addEventListener('storage', surStockage);
    return () => window.removeEventListener('storage', surStockage);
  }, []);

  // persistance
  useEffect(() => {
    try {
      ecritureLocale.current = true;
      localStorage.setItem(CLE, JSON.stringify(etat));
      ecritureLocale.current = false;
    } catch {
      setErreur("Le suivi n'a pas pu être enregistré (stockage plein ?). Exportez vos données.");
    }
  }, [etat]);

  // index du réseau
  useEffect(() => {
    chargerIndex()
      .then(setIndex)
      .catch((e) => setErreur(String(e.message)));
  }, []);

  // jeux départementaux
  useEffect(() => {
    let annule = false;
    const jeton = ++compteur.current;
    if (etat.depts.length === 0) {
      setLignesChargees([]);
      setPostes([]);
      return;
    }
    setChargement(true);
    Promise.all(etat.depts.map(chargerDept))
      .then((jeux) => {
        if (annule || jeton !== compteur.current) return;
        const parId = new Map<string, Ligne>();
        const parIdPoste = new Map<string, Poste>();
        for (const j of jeux) {
          for (const l of j.lignes) parId.set(l.id, l);
          for (const p of j.postes) parIdPoste.set(p.id, p);
        }
        const brutes = [...parId.values()];
        // rattachement au référentiel RTE : noms d'ouvrage officiels, GMR et
        // numéros de pylône vérifiés viennent se substituer aux valeurs calculées
        const liens = referentiel ? apparier(brutes, referentiel) : new Map();
        setRattachements(liens);
        const finales = liens.size
          ? brutes.map((l) => appliquerNumeros(l, liens.get(l.id)))
          : brutes;
        setLignesChargees(finales.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
        setPostes([...parIdPoste.values()]);
        setErreur(null);
      })
      .catch((e) => !annule && setErreur(String(e.message)))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [etat.depts, referentiel]);

  /**
   * Ouvrages du secteur retenu. Sans référentiel, tout ce qui est chargé est
   * montré ; avec, on s'en tient aux GMR choisis, en gardant la possibilité
   * d'afficher les ouvrages qu'il ne rattache pas — ils restent nombreux.
   */
  const lignes = useMemo(() => {
    const { cm, gmr, eel, inclureNonRattaches } = etat.secteur;
    if (!referentiel || (!cm && !gmr.length && !eel.length)) return lignesChargees;
    return lignesChargees.filter((l) => {
      const r = rattachements.get(l.id);
      if (!r) return inclureNonRattaches;
      // un ouvrage partagé avec l'équipe voisine relève du secteur par sa
      // section, même si le reste du tracé appartient à l'autre GMR
      if (eel.length) return couvre(r, 'eel', eel);
      if (gmr.length) return couvre(r, 'gmr', gmr);
      return !cm || couvre(r, 'cm', [cm]);
    });
  }, [lignesChargees, rattachements, etat.secteur, referentiel]);

  /**
   * Postes du secteur. Les jeux départementaux couvrent bien plus que le GMR
   * retenu ; on ne garde donc que les postes posés sur un ouvrage du secteur,
   * ce qui revient à ses extrémités et aux postes qu'il traverse.
   */
  const postesSecteur = useMemo(() => {
    if (lignes.length === lignesChargees.length) return postes;
    // grille au demi-degré sur les tracés retenus, puis test de proximité
    const PAS = 0.02; // ≈ 2 km, l'ordre de grandeur d'un poste et de ses abords
    const grille = new Set<string>();
    for (const l of lignes)
      for (const [lat, lon] of l.geom)
        grille.add(`${Math.floor(lat / PAS)}:${Math.floor(lon / PAS)}`);
    return postes.filter((p) => {
      const gy = Math.floor(p.lat / PAS);
      const gx = Math.floor(p.lon / PAS);
      // les huit cases voisines, un poste n'étant jamais exactement sur le tracé
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if (grille.has(`${gy + dy}:${gx + dx}`)) return true;
      return false;
    });
  }, [postes, lignes, lignesChargees]);

  const suivisCampagne = etat.suivis[etat.campagneCourante] ?? [];

  const parLigne = useMemo(() => {
    const m = new Map<string, SuiviLigne>();
    for (const s of suivisCampagne) m.set(s.ligneId, s);
    return m;
  }, [suivisCampagne]);

  /**
   * Ouvrages réellement affichés : le secteur, puis les filtres. La liste et la
   * carte lisent la même chose, faute de quoi elles se contrediraient.
   */
  const lignesAffichees = useMemo(() => {
    if (!filtresActifs(filtres)) return lignes;
    return lignes.filter((l) => {
      if (filtres.tensions.length && !filtres.tensions.includes(l.tension)) return false;
      if (filtres.aggloSeules && !etatAgglo(l, etat.aggloManuel).actif) return false;
      if (filtres.sevesoSeules && !l.seveso?.length) return false;
      if (filtres.aIdentifierSeules && !l.aIdentifier) return false;
      if (filtres.gmr.length) {
        const r = rattachements.get(l.id);
        if (!r || !couvre(r, 'gmr', filtres.gmr)) return false;
      }
      if (filtres.statuts.length) {
        const st = (parLigne.get(l.id) ?? suiviVide(l.id)).visites.VH.statut;
        if (!filtres.statuts.includes(st)) return false;
      }
      return true;
    });
  }, [lignes, filtres, etat.aggloManuel, rattachements, parLigne]);

  const setReferentiel = useCallback((r: ReferentielRte | null) => {
    try {
      if (r) localStorage.setItem(CLE_RTE, JSON.stringify(r));
      else localStorage.removeItem(CLE_RTE);
      setReferentielEtat(r);
    } catch {
      setErreur(
        "Le référentiel RTE n'a pas pu être enregistré : espace de stockage insuffisant.",
      );
    }
  }, []);

  const rattachement = useCallback(
    (ligneId: string) => rattachements.get(ligneId),
    [rattachements],
  );

  const bilanRte = useMemo(
    () => (rattachements.size ? bilan(rattachements) : null),
    [rattachements],
  );

  /** Centres et GMR connus du référentiel. */
  const zonesDisponibles = useMemo(() => {
    const gmrParCm: Record<string, Set<string>> = {};
    const eelParGmr: Record<string, Set<string>> = {};
    // le rattachement est porté par le pylône : une liaison partagée figure
    // dans les deux équipes, et les deux doivent être proposées
    for (const z of referentiel?.zones ?? Object.values(referentiel?.liaisons ?? {})) {
      if (!z.gmr) continue;
      (gmrParCm[z.cm || '—'] ??= new Set()).add(z.gmr);
      if (z.eel) (eelParGmr[z.gmr] ??= new Set()).add(z.eel);
    }
    const trier = (o: Record<string, Set<string>>) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort()]));
    return {
      cm: Object.keys(gmrParCm).sort(),
      gmrParCm: trier(gmrParCm),
      eelParGmr: trier(eelParGmr),
    };
  }, [referentiel]);

  const setSecteur = useCallback((s: Secteur) => setEtat((e) => ({ ...e, secteur: s })), []);

  /**
   * Départements à charger pour couvrir le secteur : ceux dont l'emprise contient
   * au moins un pylône de référence des GMR retenus. Le découpage administratif
   * reste ainsi invisible pour l'exploitant.
   */
  useEffect(() => {
    if (!referentiel || !index) return;
    const { cm, gmr, eel } = etat.secteur;
    if (!cm && !gmr.length && !eel.length) return;

    const retenus = new Set(
      Object.values(referentiel.liaisons)
        .filter((l) => {
          if (eel.length) return eel.includes(l.eel);
          if (gmr.length) return gmr.includes(l.gmr);
          return !cm || l.cm === cm;
        })
        .map((l) => l.code),
    );
    const codes = new Set<string>();
    for (const a of referentiel.ancres) {
      if (!retenus.has(a.c)) continue;
      for (const d of index.departements) {
        const [s0, w, n, e] = d.bbox;
        if (a.lat >= s0 && a.lat <= n && a.lon >= w && a.lon <= e) codes.add(d.code);
      }
    }
    const liste = [...codes].sort();
    setEtat((e) =>
      liste.join(',') === e.depts.join(',') ? e : { ...e, depts: liste },
    );
  }, [etat.secteur, referentiel, index]);

  const setDepts = useCallback((d: string[]) => {
    setEtat((s) => ({ ...s, depts: d }));
  }, []);


  /**
   * Pylônes frontières déduits du référentiel : le périmètre à visiter s'arrête
   * aux pylônes que le fichier rattache au secteur. Ce que le référentiel ne
   * décrit pas — début de tracé non couvert, section de l'équipe voisine — ne
   * relève pas de l'équipe et sort du périmètre.
   */
  const bornesSecteur = useCallback(
    (ligneId: string): { debut: number; fin: number } | undefined => {
      const r = rattachements.get(ligneId);
      if (!r) return undefined;
      const notres = r.sections.filter((sec) => sectionDansSecteur(sec, etat.secteur));
      if (!notres.length) return undefined;
      const debut = Math.min(...notres.map((sec) => sec.du));
      const fin = Math.max(...notres.map((sec) => sec.au));
      /*
       * Un seul pylône rattaché ne fait pas un périmètre : la ligne se
       * retrouverait à zéro kilomètre et entièrement hors périmètre. Mieux vaut
       * alors ne rien déduire et laisser le tracé entier, quitte à ce que
       * l'exploitant pose lui-même ses frontières.
       */
      if (fin - debut < 1) return undefined;
      return { debut, fin };
    },
    [rattachements, etat.secteur],
  );

  /**
   * Suivi d'un ouvrage. Les pylônes frontières saisis par l'exploitant priment ;
   * à défaut, ceux que déduit le référentiel s'appliquent, sans être enregistrés
   * — changer de secteur doit les recalculer, pas les figer.
   */
  /** Suivi tel qu'enregistré, sans les frontières déduites du référentiel. */
  const suiviBrut = useCallback(
    (ligneId: string): SuiviLigne => parLigne.get(ligneId) ?? suiviVide(ligneId),
    [parLigne],
  );

  const suivi = useCallback(
    (ligneId: string): SuiviLigne => {
      const base = parLigne.get(ligneId) ?? suiviVide(ligneId);
      if (base.debut !== undefined && base.fin !== undefined) return base;
      const b = bornesSecteur(ligneId);
      if (!b) return base;
      return { ...base, debut: base.debut ?? b.debut, fin: base.fin ?? b.fin };
    },
    [parLigne, bornesSecteur],
  );

  const majSuivi = useCallback((ligneId: string, patch: Partial<SuiviLigne>) => {
    setEtat((s) => {
      const cid = s.campagneCourante;
      const liste = s.suivis[cid] ?? [];
      const idx = liste.findIndex((x) => x.ligneId === ligneId);
      const base: SuiviLigne = idx >= 0 ? liste[idx] : suiviVide(ligneId);
      const maj: SuiviLigne = { ...base, ...patch };
      const nouvelle = idx >= 0 ? liste.map((x, i) => (i === idx ? maj : x)) : [...liste, maj];
      return { ...s, suivis: { ...s.suivis, [cid]: nouvelle } };
    });
  }, []);

  const majVisite = useCallback(
    (ligneId: string, nature: NatureVisite, patch: Partial<AvancementVisite>) => {
      setEtat((s) => {
        const cid = s.campagneCourante;
        const liste = s.suivis[cid] ?? [];
        const idx = liste.findIndex((x) => x.ligneId === ligneId);
        const base: SuiviLigne = idx >= 0 ? liste[idx] : suiviVide(ligneId);
        const maj: SuiviLigne = {
          ...base,
          visites: {
            ...base.visites,
            [nature]: {
              ...base.visites[nature],
              ...patch,
              dateMaj: new Date().toISOString(),
            },
          },
        };
        const nouvelle = idx >= 0 ? liste.map((x, i) => (i === idx ? maj : x)) : [...liste, maj];
        return { ...s, suivis: { ...s.suivis, [cid]: nouvelle } };
      });
    },
    [],
  );

  const ajouterObservation = useCallback((o: Omit<Observation, 'id'>) => {
    setEtat((s) => ({
      ...s,
      observations: [...s.observations, { ...o, id: nouvelId('o') }],
    }));
  }, []);

  const supprimerObservation = useCallback((id: string) => {
    setEtat((s) => ({ ...s, observations: s.observations.filter((o) => o.id !== id) }));
  }, []);

  const note = useCallback((ligneId: string) => etat.notes[ligneId] ?? '', [etat.notes]);

  const setNote = useCallback((ligneId: string, texte: string) => {
    setEtat((s) => {
      const notes = { ...s.notes };
      if (texte.trim()) notes[ligneId] = texte;
      else delete notes[ligneId];
      return { ...s, notes };
    });
  }, []);

  /** Applique une transformation aux zones d'une nature de visite. */
  const transformerZones = useCallback(
    (ligneId: string, nature: NatureVisite, f: (z: ZoneSurvolee[]) => ZoneSurvolee[]) => {
      setEtat((s) => {
        const cid = s.campagneCourante;
        const liste = s.suivis[cid] ?? [];
        const idx = liste.findIndex((x) => x.ligneId === ligneId);
        const base: SuiviLigne = idx >= 0 ? liste[idx] : suiviVide(ligneId);
        const visite = base.visites[nature];
        const zones = f(visite.zones).sort((a, b) => a.debut - b.debut);
        const maj: SuiviLigne = {
          ...base,
          visites: {
            ...base.visites,
            [nature]: {
              ...visite,
              zones,
              // une ligne sans zone retombe à faire, une ligne qui en a est en cours
              statut:
                visite.statut === 'hors_perimetre' || visite.statut === 'fait'
                  ? visite.statut
                  : zones.length
                    ? 'en_cours'
                    : 'a_faire',
              dateMaj: new Date().toISOString(),
            },
          },
        };
        const nouvelle = idx >= 0 ? liste.map((x, i) => (i === idx ? maj : x)) : [...liste, maj];
        return { ...s, suivis: { ...s.suivis, [cid]: nouvelle } };
      });
    },
    [],
  );

  const ajouterZone = useCallback(
    (ligneId: string, nature: NatureVisite, zone: Omit<ZoneSurvolee, 'id'>) =>
      transformerZones(ligneId, nature, (z) => [
        ...z,
        {
          ...zone,
          id: nouvelId('z'),
          debut: Math.min(zone.debut, zone.fin),
          fin: Math.max(zone.debut, zone.fin),
        },
      ]),
    [transformerZones],
  );

  const majZone = useCallback(
    (ligneId: string, nature: NatureVisite, zoneId: string, patch: Partial<ZoneSurvolee>) =>
      transformerZones(ligneId, nature, (z) =>
        z.map((x) => {
          if (x.id !== zoneId) return x;
          const maj = { ...x, ...patch };
          return { ...maj, debut: Math.min(maj.debut, maj.fin), fin: Math.max(maj.debut, maj.fin) };
        }),
      ),
    [transformerZones],
  );

  const supprimerZone = useCallback(
    (ligneId: string, nature: NatureVisite, zoneId: string) =>
      transformerZones(ligneId, nature, (z) => z.filter((x) => x.id !== zoneId)),
    [transformerZones],
  );

  const setCampagneCourante = useCallback((id: string) => {
    setEtat((s) => ({ ...s, campagneCourante: id }));
  }, []);

  const creerCampagne = useCallback((nom: string, annee: number) => {
    setEtat((s) => {
      const c: Campagne = {
        id: `c${Date.now()}`,
        nom,
        annee,
        creeLe: new Date().toISOString(),
        depts: s.depts,
      };
      return {
        ...s,
        campagnes: [...s.campagnes, c],
        campagneCourante: c.id,
        suivis: { ...s.suivis, [c.id]: [] },
        preparations: { ...s.preparations, [c.id]: [] },
        taches: { ...s.taches, [c.id]: {} },
      };
    });
  }, []);

  const majCampagne = useCallback((id: string, patch: Partial<Campagne>) => {
    setEtat((s) => ({
      ...s,
      campagnes: s.campagnes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const supprimerCampagne = useCallback((id: string) => {
    setEtat((s) => {
      if (s.campagnes.length <= 1) return s;
      const campagnes = s.campagnes.filter((c) => c.id !== id);
      const { [id]: _a, ...suivis } = s.suivis;
      const { [id]: _c, ...preparations } = s.preparations;
      const { [id]: _d, ...taches } = s.taches;
      return {
        ...s,
        campagnes,
        campagneCourante: s.campagneCourante === id ? campagnes[0].id : s.campagneCourante,
        suivis,
        preparations,
        taches,
      };
    });
  }, []);

  /* -- préparations de vol ------------------------------------------ */

  const preparations = etat.preparations[etat.campagneCourante] ?? [];

  const creerPreparation = useCallback(
    (annee: number, semaine: number, typeVol: TypeVol): string => {
      const id = nouvelId('p');
      setEtat((s) => {
        const cid = s.campagneCourante;
        const prepa: Preparation = {
          id,
          campagneId: cid,
          annee,
          semaine,
          typeVol,
          vitesse: vitesseParDefaut(typeVol),
          jours: [],
          creneaux: {},
          creeLe: new Date().toISOString(),
        };
        return {
          ...s,
          preparations: { ...s.preparations, [cid]: [...(s.preparations[cid] ?? []), prepa] },
        };
      });
      return id;
    },
    [],
  );

  /** Applique une transformation à une préparation de la campagne courante. */
  const transformerPrepa = useCallback((id: string, f: (p: Preparation) => Preparation) => {
    setEtat((s) => {
      const cid = s.campagneCourante;
      const liste = s.preparations[cid] ?? [];
      return {
        ...s,
        preparations: { ...s.preparations, [cid]: liste.map((p) => (p.id === id ? f(p) : p)) },
      };
    });
  }, []);

  const majPreparation = useCallback(
    (id: string, patch: Partial<Preparation>) => transformerPrepa(id, (p) => ({ ...p, ...patch })),
    [transformerPrepa],
  );

  const supprimerPreparation = useCallback((id: string) => {
    setEtat((s) => {
      const cid = s.campagneCourante;
      return {
        ...s,
        preparations: {
          ...s.preparations,
          [cid]: (s.preparations[cid] ?? []).filter((p) => p.id !== id),
        },
      };
    });
  }, []);

  const dupliquerPreparation = useCallback((id: string) => {
    setEtat((s) => {
      const cid = s.campagneCourante;
      const liste = s.preparations[cid] ?? [];
      const src = liste.find((p) => p.id === id);
      if (!src) return s;
      const copie: Preparation = {
        ...JSON.parse(JSON.stringify(src)),
        id: nouvelId('p'),
        creeLe: new Date().toISOString(),
      };
      return { ...s, preparations: { ...s.preparations, [cid]: [...liste, copie] } };
    });
  }, []);

  const ajouterVol = useCallback(
    (prepaId: string, jour: string, demi: DemiJournee, vol: Omit<VolLigne, 'id'>) =>
      transformerPrepa(prepaId, (p) => {
        const c = creneauDe(p, jour);
        // un même ouvrage deux fois dans la même demi-journée : c'est un clic en trop
        if (c[demi].some((v) => v.ligneId === vol.ligneId)) return p;
        const nouveau: VolLigne = {
          ...vol,
          id: nouvelId('v'),
        };
        return {
          ...p,
          jours: p.jours.includes(jour) ? p.jours : [...p.jours, jour].sort(),
          creneaux: { ...p.creneaux, [jour]: { ...c, [demi]: [...c[demi], nouveau] } },
        };
      }),
    [transformerPrepa],
  );

  const majVol = useCallback(
    (prepaId: string, jour: string, demi: DemiJournee, volId: string, patch: Partial<VolLigne>) =>
      transformerPrepa(prepaId, (p) => {
        const c = creneauDe(p, jour);
        return {
          ...p,
          creneaux: {
            ...p.creneaux,
            [jour]: { ...c, [demi]: c[demi].map((v) => (v.id === volId ? { ...v, ...patch } : v)) },
          },
        };
      }),
    [transformerPrepa],
  );

  const supprimerVol = useCallback(
    (prepaId: string, jour: string, demi: DemiJournee, volId: string) =>
      transformerPrepa(prepaId, (p) => {
        const c = creneauDe(p, jour);
        return {
          ...p,
          creneaux: {
            ...p.creneaux,
            [jour]: { ...c, [demi]: c[demi].filter((v) => v.id !== volId) },
          },
        };
      }),
    [transformerPrepa],
  );

  const deplacerVol = useCallback(
    (prepaId: string, jour: string, demi: DemiJournee, volId: string, sens: -1 | 1) =>
      transformerPrepa(prepaId, (p) => {
        const c = creneauDe(p, jour);
        const liste = [...c[demi]];
        const i = liste.findIndex((v) => v.id === volId);
        const j = i + sens;
        if (i < 0 || j < 0 || j >= liste.length) return p;
        [liste[i], liste[j]] = [liste[j], liste[i]];
        return { ...p, creneaux: { ...p.creneaux, [jour]: { ...c, [demi]: liste } } };
      }),
    [transformerPrepa],
  );

  const ajouterHelicoptere = useCallback((h: Omit<Helicoptere, 'id'>) => {
    setEtat((s) => {
      const immat = h.immatriculation.trim().toUpperCase();
      if (!immat || s.helicopteres.some((x) => x.immatriculation === immat)) return s;
      return {
        ...s,
        helicopteres: [
          ...s.helicopteres,
          { ...h, immatriculation: immat, id: `h${Date.now()}` },
        ].sort((a, b) => a.immatriculation.localeCompare(b.immatriculation)),
      };
    });
  }, []);

  const supprimerHelicoptere = useCallback((id: string) => {
    setEtat((s) => ({ ...s, helicopteres: s.helicopteres.filter((h) => h.id !== id) }));
  }, []);

  const ajouterZoneDePoser = useCallback((z: Omit<ZoneDePoser, 'id'>) => {
    setEtat((s) => ({
      ...s,
      zonesDePoser: [...s.zonesDePoser, { ...z, id: nouvelId('dz') }].sort((a, b) =>
        (a.gmr + a.nom).localeCompare(b.gmr + b.nom, 'fr'),
      ),
    }));
  }, []);

  const majZoneDePoser = useCallback((id: string, patch: Partial<ZoneDePoser>) => {
    setEtat((s) => ({
      ...s,
      zonesDePoser: s.zonesDePoser.map((z) => (z.id === id ? { ...z, ...patch } : z)),
    }));
  }, []);

  const supprimerZoneDePoser = useCallback((id: string) => {
    setEtat((s) => ({ ...s, zonesDePoser: s.zonesDePoser.filter((z) => z.id !== id) }));
  }, []);

  const ajouterPointCarburant = useCallback((c: Omit<PointCarburant, 'id'>) => {
    setEtat((s) => {
      // un même terrain ne se saisit pas deux fois
      if (c.oaci && s.pointsCarburant.some((x) => x.oaci === c.oaci)) return s;
      return {
        ...s,
        pointsCarburant: [...s.pointsCarburant, { ...c, id: nouvelId('carb') }].sort((a, b) =>
          a.nom.localeCompare(b.nom, 'fr'),
        ),
      };
    });
  }, []);

  const majPointCarburant = useCallback((id: string, patch: Partial<PointCarburant>) => {
    setEtat((s) => ({
      ...s,
      pointsCarburant: s.pointsCarburant.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const supprimerPointCarburant = useCallback((id: string) => {
    setEtat((s) => ({ ...s, pointsCarburant: s.pointsCarburant.filter((c) => c.id !== id) }));
  }, []);

  const majTache = useCallback((tacheId: string, patch: Partial<EtatTache>) => {
    setEtat((s) => {
      const cid = s.campagneCourante;
      const courant = s.taches[cid] ?? {};
      const avant = courant[tacheId] ?? { fait: false };
      return {
        ...s,
        taches: { ...s.taches, [cid]: { ...courant, [tacheId]: { ...avant, ...patch } } },
      };
    });
  }, []);

  const setAggloManuel = useCallback((ligneId: string, valeur: boolean | null) => {
    setEtat((s) => {
      const suite = { ...s.aggloManuel };
      if (valeur === null) delete suite[ligneId];
      else suite[ligneId] = valeur;
      return { ...s, aggloManuel: suite };
    });
  }, []);

  const majContactSeveso = useCallback((id: string, patch: ContactSeveso) => {
    setEtat((s) => ({
      ...s,
      contactsSeveso: { ...s.contactsSeveso, [id]: { ...s.contactsSeveso[id], ...patch } },
    }));
  }, []);

  const exporter = useCallback(() => {
    const sauvegarde: Sauvegarde = {
      format: 'visite-vh',
      version: 1,
      exporteLe: new Date().toISOString(),
      campagnes: etat.campagnes,
      suivis: etat.suivis,
      notes: etat.notes,
      observations: etat.observations,
      preparations: etat.preparations,
      helicopteres: etat.helicopteres,
      zonesDePoser: etat.zonesDePoser,
      pointsCarburant: etat.pointsCarburant,
      contactsSeveso: etat.contactsSeveso,
      aggloManuel: etat.aggloManuel,
      taches: etat.taches,
    };
    const blob = new Blob([JSON.stringify(sauvegarde, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visite-vh-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [etat]);

  const importer = useCallback(async (fichier: File) => {
    const texte = await fichier.text();
    const s = JSON.parse(texte) as Sauvegarde;
    if (s.format !== 'visite-vh') throw new Error('Ce fichier ne provient pas de Visite VH.');
    setEtat((cur) => {
      // fusion : les campagnes importées s'ajoutent, celles de même identifiant sont remplacées
      const parId = new Map(cur.campagnes.map((c) => [c.id, c]));
      for (const c of s.campagnes) parId.set(c.id, c);
      return {
        ...cur,
        campagnes: [...parId.values()],
        suivis: { ...cur.suivis, ...migrerSuivis(s.suivis) },
        notes: { ...cur.notes, ...(s.notes ?? {}) },
        observations: (() => {
          const parId = new Map(cur.observations.map((o) => [o.id, o]));
          for (const o of migrerObservations(s.observations)) parId.set(o.id, o);
          return [...parId.values()];
        })(),
        preparations: { ...cur.preparations, ...(s.preparations ?? {}) },
        helicopteres: fusionnerHelicos(cur.helicopteres, s.helicopteres ?? []),
        zonesDePoser: (() => {
          const parId = new Map(cur.zonesDePoser.map((z) => [z.id, z]));
          for (const z of s.zonesDePoser ?? []) parId.set(z.id, z);
          return [...parId.values()];
        })(),
        pointsCarburant: (() => {
          const parId = new Map(cur.pointsCarburant.map((c) => [c.id, c]));
          for (const c of s.pointsCarburant ?? []) parId.set(c.id, c);
          return [...parId.values()];
        })(),
        contactsSeveso: { ...cur.contactsSeveso, ...(s.contactsSeveso ?? {}) },
        aggloManuel: { ...cur.aggloManuel, ...(s.aggloManuel ?? {}) },
        taches: { ...cur.taches, ...(s.taches ?? {}) },
        campagneCourante: s.campagnes[0]?.id ?? cur.campagneCourante,
      };
    });
  }, []);

  const valeur: Ctx = {
    index,
    chargement,
    erreur,
    depts: etat.depts,
    setDepts,
    secteur: etat.secteur,
    setSecteur,
    zonesDisponibles,
    lignes,
    lignesAffichees,
    postes: postesSecteur,
    bornesSecteur,
    suiviBrut,
    filtres,
    setFiltres,
    referentiel,
    setReferentiel,
    rattachements,
    rattachement,
    bilanRte,
    campagnes: etat.campagnes,
    campagneCourante: etat.campagneCourante,
    setCampagneCourante,
    creerCampagne,
    supprimerCampagne,
    majCampagne,
    suivi,
    majSuivi,
    majVisite,
    natureCourante,
    setNatureCourante,
    observations: etat.observations,
    note,
    setNote,
    ajouterZone,
    majZone,
    supprimerZone,
    ajouterObservation,
    supprimerObservation,
    ligneActive,
    setLigneActive,
    preparations,
    creerPreparation,
    majPreparation,
    supprimerPreparation,
    dupliquerPreparation,
    ajouterVol,
    majVol,
    supprimerVol,
    deplacerVol,
    helicopteres: etat.helicopteres,
    ajouterHelicoptere,
    supprimerHelicoptere,
    zonesDePoser: etat.zonesDePoser,
    ajouterZoneDePoser,
    majZoneDePoser,
    supprimerZoneDePoser,
    pointsCarburant: etat.pointsCarburant,
    ajouterPointCarburant,
    majPointCarburant,
    supprimerPointCarburant,
    contactsSeveso: etat.contactsSeveso,
    majContactSeveso,
    aggloManuel: etat.aggloManuel,
    setAggloManuel,
    taches: etat.taches[etat.campagneCourante] ?? {},
    majTache,
    exporter,
    importer,
  };

  return <StoreContext.Provider value={valeur}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error('useStore doit être utilisé dans un StoreProvider');
  return c;
}

/* ------------------------------------------------------------------ */
/* Calculs d'avancement                                                */
/* ------------------------------------------------------------------ */

export interface Avancement {
  /** rang du premier et du dernier pylône du périmètre */
  debut: number;
  fin: number;
  /** kilomètres du périmètre à visiter */
  kmPerimetre: number;
  kmFaits: number;
  kmRestants: number;
  pourcent: number;
}

/** Intervalle de rangs de pylônes. */
export interface Portion {
  debut: number;
  fin: number;
}

/** Zones survolées, bornées au périmètre et fusionnées quand elles se recouvrent. */
export function portionsFaites(
  ligne: Ligne,
  s: SuiviLigne,
  nature: NatureVisite = 'VH',
): Portion[] {
  const n = ligne.pylones.length;
  const debut = Math.min(Math.max(s.debut ?? 1, 1), n);
  const fin = Math.min(Math.max(s.fin ?? n, debut), n);
  const v = s.visites[nature];
  if (v.statut === 'hors_perimetre') return [];
  if (v.statut === 'fait') return debut < fin ? [{ debut, fin }] : [];

  const bornees = v.zones
    .map((z) => ({
      debut: Math.max(Math.min(z.debut, z.fin), debut),
      fin: Math.min(Math.max(z.debut, z.fin), fin),
    }))
    .filter((z) => z.fin > z.debut)
    .sort((a, b) => a.debut - b.debut);

  const out: Portion[] = [];
  for (const z of bornees) {
    const dernier = out[out.length - 1];
    if (dernier && z.debut <= dernier.fin) dernier.fin = Math.max(dernier.fin, z.fin);
    else out.push({ ...z });
  }
  return out;
}

/** Ce qui reste à survoler : le complément des zones faites dans le périmètre. */
export function lacunes(ligne: Ligne, s: SuiviLigne, nature: NatureVisite = 'VH'): Portion[] {
  const n = ligne.pylones.length;
  const debut = Math.min(Math.max(s.debut ?? 1, 1), n);
  const fin = Math.min(Math.max(s.fin ?? n, debut), n);
  if (s.visites[nature].statut === 'hors_perimetre' || fin <= debut) return [];

  const out: Portion[] = [];
  let curseur = debut;
  for (const p of portionsFaites(ligne, s, nature)) {
    if (p.debut > curseur) out.push({ debut: curseur, fin: p.debut });
    curseur = Math.max(curseur, p.fin);
  }
  if (curseur < fin) out.push({ debut: curseur, fin });
  return out;
}

/** Longueur d'une portion, en kilomètres. */
export function kmPortion(ligne: Ligne, p: Portion): number {
  const a = ligne.pylones[p.debut - 1]?.d ?? 0;
  const b = ligne.pylones[p.fin - 1]?.d ?? a;
  return Math.max(b - a, 0);
}

export function calculerAvancement(
  ligne: Ligne,
  s: SuiviLigne,
  nature: NatureVisite = 'VH',
): Avancement {
  const n = ligne.pylones.length;
  const debut = Math.min(Math.max(s.debut ?? 1, 1), n);
  const fin = Math.min(Math.max(s.fin ?? n, debut), n);
  const dDebut = ligne.pylones[debut - 1]?.d ?? 0;
  const dFin = ligne.pylones[fin - 1]?.d ?? ligne.km;
  const kmPerimetre = Math.max(dFin - dDebut, 0);

  const kmFaits = portionsFaites(ligne, s, nature).reduce(
    (a, p) => a + kmPortion(ligne, p),
    0,
  );

  return {
    debut,
    fin,
    kmPerimetre,
    kmFaits,
    kmRestants: Math.max(kmPerimetre - kmFaits, 0),
    pourcent: kmPerimetre > 0 ? (kmFaits / kmPerimetre) * 100 : 0,
  };
}

/**
 * Prépare l'entrée de planning correspondant à un ouvrage : on retient le
 * périmètre à visiter quand les pylônes frontières sont renseignés, sinon la
 * longueur totale de la ligne.
 */
export function volDepuisLigne(
  l: Ligne,
  s: SuiviLigne,
  r?: RattachementLigne,
): Omit<VolLigne, 'id'> {
  const a = calculerAvancement(l, s);
  const km = a.kmPerimetre > 0 ? a.kmPerimetre : l.km;
  return {
    ligneId: l.id,
    nom: nomAffiche(l, s, r),
    tension: l.tension,
    km: Math.round(km * 10) / 10,
  };
}

/**
 * Libellé à afficher, par ordre de priorité : celui saisi par l'exploitant, puis
 * celui du référentiel RTE importé, puis le nom reconstitué à partir des postes.
 */
export function nomAffiche(l: Ligne, s: SuiviLigne, r?: RattachementLigne): string {
  return s.nomPerso?.trim() || r?.nom || l.nom;
}

/**
 * Longueur d'une section, prise sur la distance cumulée des pylônes qu'elle
 * couvre. C'est ce que l'équipe a réellement à visiter d'un ouvrage partagé.
 */
export function kmSection(l: Ligne, s: SectionRte): number {
  let debut: number | null = null;
  let fin: number | null = null;
  for (const p of l.pylones) {
    if (p.i < s.du || p.i > s.au) continue;
    if (debut === null) debut = p.d;
    fin = p.d;
  }
  return debut === null || fin === null ? 0 : Math.max(0, fin - debut);
}

/** La section relève-t-elle du secteur retenu ? Sans secteur, tout en relève. */
export function sectionDansSecteur(s: SectionRte, secteur: Secteur): boolean {
  if (secteur.eel.length) return secteur.eel.includes(s.eel);
  if (secteur.gmr.length) return secteur.gmr.includes(s.gmr);
  if (secteur.cm) return s.cm === secteur.cm;
  return true;
}

/** Code d'ouvrage RTE retenu : saisie manuelle, puis référentiel, puis appariement par nom. */
export function codeAffiche(
  l: Ligne,
  s: SuiviLigne,
  r?: RattachementLigne,
): string | undefined {
  return s.codeRtePerso || r?.code || l.codeRte;
}

export interface EtatAgglo {
  /** l'ouvrage est-il considéré comme traversant une agglomération ? */
  actif: boolean;
  /** la valeur vient-elle d'une correction manuelle ? */
  manuel: boolean;
  /** ce que disent les données */
  auto: boolean;
}

/** Traversée d'agglomération retenue : la correction de l'exploitant prime. */
export function etatAgglo(l: Ligne, manuels: Record<string, boolean>): EtatAgglo {
  const auto = Boolean(l.agglo);
  const forcee = manuels[l.id];
  if (forcee === undefined) return { actif: auto, manuel: false, auto };
  return { actif: forcee, manuel: true, auto };
}
