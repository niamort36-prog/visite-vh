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
  Campagne,
  IndexReseau,
  Ligne,
  Observation,
  Poste,
  Sauvegarde,
  SuiviLigne,
} from '../types';
import { chargerDept, chargerIndex } from '../data/reseau';

const CLE = 'visite-vh:v1';

interface Persiste {
  campagnes: Campagne[];
  campagneCourante: string;
  depts: string[];
  suivis: Record<string, SuiviLigne[]>;
  observations: Record<string, Observation[]>;
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

function lire(): Persiste {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) {
      const p = JSON.parse(brut) as Persiste;
      if (p.campagnes?.length) return p;
    }
  } catch {
    /* stockage indisponible ou corrompu : on repart d'un état vierge */
  }
  const c = campagneParDefaut();
  return {
    campagnes: [c],
    campagneCourante: c.id,
    depts: [],
    suivis: { [c.id]: [] },
    observations: { [c.id]: [] },
  };
}

interface Ctx {
  index: IndexReseau | null;
  chargement: boolean;
  erreur: string | null;

  depts: string[];
  setDepts: (d: string[]) => void;

  lignes: Ligne[];
  postes: Poste[];

  campagnes: Campagne[];
  campagneCourante: string;
  setCampagneCourante: (id: string) => void;
  creerCampagne: (nom: string, annee: number) => void;
  supprimerCampagne: (id: string) => void;

  suivi: (ligneId: string) => SuiviLigne;
  majSuivi: (ligneId: string, patch: Partial<SuiviLigne>) => void;
  observations: Observation[];
  ajouterObservation: (o: Omit<Observation, 'id'>) => void;
  supprimerObservation: (id: string) => void;

  ligneActive: string | null;
  setLigneActive: (id: string | null) => void;

  exporter: () => void;
  importer: (fichier: File) => Promise<void>;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<Persiste>(lire);
  const [index, setIndex] = useState<IndexReseau | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ligneActive, setLigneActive] = useState<string | null>(null);
  const compteur = useRef(0);

  // persistance
  useEffect(() => {
    try {
      localStorage.setItem(CLE, JSON.stringify(etat));
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
      setLignes([]);
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
        setLignes([...parId.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
        setPostes([...parIdPoste.values()]);
        setErreur(null);
      })
      .catch((e) => !annule && setErreur(String(e.message)))
      .finally(() => !annule && setChargement(false));
    return () => {
      annule = true;
    };
  }, [etat.depts]);

  const setDepts = useCallback((d: string[]) => {
    setEtat((s) => ({ ...s, depts: d }));
  }, []);

  const suivisCampagne = etat.suivis[etat.campagneCourante] ?? [];
  const obsCampagne = etat.observations[etat.campagneCourante] ?? [];

  const parLigne = useMemo(() => {
    const m = new Map<string, SuiviLigne>();
    for (const s of suivisCampagne) m.set(s.ligneId, s);
    return m;
  }, [suivisCampagne]);

  const suivi = useCallback(
    (ligneId: string): SuiviLigne =>
      parLigne.get(ligneId) ?? { ligneId, statut: 'a_faire' },
    [parLigne],
  );

  const majSuivi = useCallback((ligneId: string, patch: Partial<SuiviLigne>) => {
    setEtat((s) => {
      const cid = s.campagneCourante;
      const liste = s.suivis[cid] ?? [];
      const idx = liste.findIndex((x) => x.ligneId === ligneId);
      const base: SuiviLigne = idx >= 0 ? liste[idx] : { ligneId, statut: 'a_faire' };
      const maj: SuiviLigne = { ...base, ...patch, dateMaj: new Date().toISOString() };
      const nouvelle = idx >= 0 ? liste.map((x, i) => (i === idx ? maj : x)) : [...liste, maj];
      return { ...s, suivis: { ...s.suivis, [cid]: nouvelle } };
    });
  }, []);

  const ajouterObservation = useCallback((o: Omit<Observation, 'id'>) => {
    setEtat((s) => {
      const cid = s.campagneCourante;
      const liste = s.observations[cid] ?? [];
      const obs: Observation = { ...o, id: `o${Date.now()}${Math.random().toString(36).slice(2, 6)}` };
      return { ...s, observations: { ...s.observations, [cid]: [...liste, obs] } };
    });
  }, []);

  const supprimerObservation = useCallback((id: string) => {
    setEtat((s) => {
      const cid = s.campagneCourante;
      const liste = s.observations[cid] ?? [];
      return { ...s, observations: { ...s.observations, [cid]: liste.filter((o) => o.id !== id) } };
    });
  }, []);

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
        observations: { ...s.observations, [c.id]: [] },
      };
    });
  }, []);

  const supprimerCampagne = useCallback((id: string) => {
    setEtat((s) => {
      if (s.campagnes.length <= 1) return s;
      const campagnes = s.campagnes.filter((c) => c.id !== id);
      const { [id]: _a, ...suivis } = s.suivis;
      const { [id]: _b, ...observations } = s.observations;
      return {
        ...s,
        campagnes,
        campagneCourante: s.campagneCourante === id ? campagnes[0].id : s.campagneCourante,
        suivis,
        observations,
      };
    });
  }, []);

  const exporter = useCallback(() => {
    const sauvegarde: Sauvegarde = {
      format: 'visite-vh',
      version: 1,
      exporteLe: new Date().toISOString(),
      campagnes: etat.campagnes,
      suivis: etat.suivis,
      observations: etat.observations,
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
        suivis: { ...cur.suivis, ...s.suivis },
        observations: { ...cur.observations, ...s.observations },
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
    lignes,
    postes,
    campagnes: etat.campagnes,
    campagneCourante: etat.campagneCourante,
    setCampagneCourante,
    creerCampagne,
    supprimerCampagne,
    suivi,
    majSuivi,
    observations: obsCampagne,
    ajouterObservation,
    supprimerObservation,
    ligneActive,
    setLigneActive,
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

export function calculerAvancement(ligne: Ligne, s: SuiviLigne): Avancement {
  const n = ligne.pylones.length;
  const debut = Math.min(Math.max(s.debut ?? 1, 1), n);
  const fin = Math.min(Math.max(s.fin ?? n, debut), n);
  const dDebut = ligne.pylones[debut - 1]?.d ?? 0;
  const dFin = ligne.pylones[fin - 1]?.d ?? ligne.km;
  const kmPerimetre = Math.max(dFin - dDebut, 0);

  let kmFaits = 0;
  if (s.statut === 'fait') kmFaits = kmPerimetre;
  else if (s.avancement != null) {
    const a = Math.min(Math.max(s.avancement, debut), fin);
    kmFaits = Math.max((ligne.pylones[a - 1]?.d ?? dDebut) - dDebut, 0);
  }

  return {
    debut,
    fin,
    kmPerimetre,
    kmFaits,
    kmRestants: Math.max(kmPerimetre - kmFaits, 0),
    pourcent: kmPerimetre > 0 ? (kmFaits / kmPerimetre) * 100 : 0,
  };
}

/** Libellé à afficher : celui saisi par l'exploitant prime sur le nom reconstitué. */
export function nomAffiche(l: Ligne, s: SuiviLigne): string {
  return s.nomPerso?.trim() || l.nom;
}

/** Code d'ouvrage RTE retenu : rattachement manuel prioritaire sur l'appariement automatique. */
export function codeAffiche(l: Ligne, s: SuiviLigne): string | undefined {
  return s.codeRtePerso || l.codeRte;
}
