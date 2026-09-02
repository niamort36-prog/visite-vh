import React, { useCallback, useMemo, useState } from 'react';
import MapView, { type CibleCarte } from './map/MapView';
import SecteurPanel from './ui/SecteurPanel';
import LignesTable from './ui/LignesTable';
import LignePanel from './ui/LignePanel';
import CampagneBarre from './ui/CampagneBarre';
import PrepasPanel from './ui/PrepasPanel';
import PrepaDetail from './ui/PrepaDetail';
import TachesFenetre from './ui/TachesFenetre';
import { genererTaches } from './lib/taches';
import { joursAvant } from './lib/semaines';
import { nomAffiche, useStore } from './state/store';
import type { DemiJournee, Ligne, Pylone } from './types';
import { volDepuisLigne } from './state/store';
import { aujourdhui } from './lib/geo';
import { libelleJour } from './lib/semaines';

type Onglet = 'secteur' | 'lignes' | 'ligne' | 'prepa';

/** Créneau alimenté par les clics sur la carte. */
interface Selection {
  prepaId: string;
  jour: string;
  demi: DemiJournee;
}

export default function App() {
  const {
    lignes,
    ligneActive,
    setLigneActive,
    erreur,
    majSuivi,
    suivi,
    ajouterObservation,
    preparations,
    ajouterVol,
    campagnes,
    campagneCourante,
    index,
    depts,
    taches: etatsTaches,
  } = useStore();
  const [onglet, setOnglet] = useState<Onglet>('secteur');
  const [cible, setCible] = useState<CibleCarte | null>(null);
  const [panneauOuvert, setPanneauOuvert] = useState(true);
  const [actionPylone, setActionPylone] = useState<{ ligne: Ligne; pylone: Pylone } | null>(null);
  const [prepaOuverte, setPrepaOuverte] = useState<string | null>(null);
  const [largeur, setLargeur] = useState(() => {
    const v = Number(localStorage.getItem('visite-vh:largeur'));
    return Number.isFinite(v) && v >= 320 ? v : 430;
  });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tachesOuvertes, setTachesOuvertes] = useState(false);

  const ligne = lignes.find((l) => l.id === ligneActive) ?? null;

  // échéances ouvertes, pour la pastille de l'en-tête
  const echeances = useMemo(() => {
    const campagne = campagnes.find((c) => c.id === campagneCourante);
    if (!campagne) return { ouvertes: 0, retard: 0 };
    const entrees = (index?.departements ?? []).filter((d) => depts.includes(d.code));
    const ouvertes = genererTaches(campagne, entrees, preparations, lignes).filter(
      (t) => !etatsTaches[t.id]?.fait,
    );
    return {
      ouvertes: ouvertes.length,
      retard: ouvertes.filter((t) => joursAvant(t.echeance) < 0).length,
    };
  }, [campagnes, campagneCourante, index, depts, preparations, lignes, etatsTaches]);

  // poignée de redimensionnement du panneau : utile pour lire le planning en entier
  const commencerRedim = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const deplacer = (ev: PointerEvent) => {
      const l = Math.min(Math.max(ev.clientX, 320), window.innerWidth - 280);
      setLargeur(l);
    };
    const relacher = () => {
      window.removeEventListener('pointermove', deplacer);
      window.removeEventListener('pointerup', relacher);
      setLargeur((l) => {
        localStorage.setItem('visite-vh:largeur', String(l));
        return l;
      });
    };
    window.addEventListener('pointermove', deplacer);
    window.addEventListener('pointerup', relacher);
  }, []);
  const prepa = preparations.find((p) => p.id === prepaOuverte) ?? null;

  // ouvrages déjà planifiés dans la préparation ouverte, surlignés sur la carte
  const lignesPrepa = useMemo(() => {
    const s = new Set<string>();
    if (!prepa) return s;
    for (const c of Object.values(prepa.creneaux))
      for (const v of [...c.matin, ...c.apresMidi]) s.add(v.ligneId);
    return s;
  }, [prepa]);

  // en mode sélection, un clic sur une ligne l'ajoute au créneau visé
  const selectionCarte = useCallback(
    (l: Ligne) => {
      if (!selection) return;
      ajouterVol(selection.prepaId, selection.jour, selection.demi, volDepuisLigne(l, suivi(l.id)));
    },
    [selection, ajouterVol, suivi],
  );

  // Ouvrir un ouvrage depuis le tableau le sélectionne, l'affiche en détail et le cadre.
  const ouvrirLigne = useCallback(
    (l: Ligne) => {
      setLigneActive(l.id);
      setOnglet('ligne');
      setCible({ ligneId: l.id });
    },
    [setLigneActive],
  );

  const onPyloneClic = useCallback((l: Ligne, p: Pylone) => {
    setActionPylone({ ligne: l, pylone: p });
  }, []);

  return (
    <div className={`appli${panneauOuvert ? '' : ' replie'}`}>
      <header className="entete">
        <div className="marque">
          <span className="logo" aria-hidden>
            ⌁
          </span>
          <div>
            <b>Visite VH</b>
            <small>Préparation et suivi des visites héliportées HTB</small>
          </div>
        </div>
        <CampagneBarre />
        <button
          className={echeances.retard ? 'bouton-echeances retard' : 'bouton-echeances'}
          onClick={() => setTachesOuvertes(true)}
          title="Échéances de la campagne"
        >
          Échéances
          {echeances.ouvertes > 0 && <span className="badge">{echeances.ouvertes}</span>}
        </button>
        <button
          className="bascule-panneau"
          onClick={() => setPanneauOuvert((v) => !v)}
          title={panneauOuvert ? 'Masquer le panneau' : 'Afficher le panneau'}
        >
          {panneauOuvert ? '⟨' : '⟩'}
        </button>
      </header>

      {erreur && <div className="bandeau-erreur">{erreur}</div>}

      <div className="corps">
        <aside className="panneau-lateral" style={{ width: panneauOuvert ? largeur : 0 }}>
          <nav className="onglets">
            <button className={onglet === 'secteur' ? 'actif' : ''} onClick={() => setOnglet('secteur')}>
              Secteur
            </button>
            <button className={onglet === 'lignes' ? 'actif' : ''} onClick={() => setOnglet('lignes')}>
              Lignes
            </button>
            <button
              className={onglet === 'ligne' ? 'actif' : ''}
              onClick={() => setOnglet('ligne')}
              disabled={!ligne}
            >
              Ouvrage
            </button>
            <button className={onglet === 'prepa' ? 'actif' : ''} onClick={() => setOnglet('prepa')}>
              Vols
            </button>
          </nav>

          <div className="panneau-contenu">
            {onglet === 'secteur' && <SecteurPanel />}
            {onglet === 'lignes' && (
              <LignesTable onOuvrir={ouvrirLigne} />
            )}
            {onglet === 'ligne' &&
              (ligne ? (
                <LignePanel
                  ligne={ligne}
                  onCadrerPylone={(i) => setCible({ ligneId: ligne.id, pyloneI: i })}
                />
              ) : (
                <div className="vide">Sélectionnez une ligne dans le tableau ou sur la carte.</div>
              ))}
            {onglet === 'prepa' &&
              (prepa ? (
                <PrepaDetail
                  prepa={prepa}
                  onRetour={() => {
                    setPrepaOuverte(null);
                    setSelection(null);
                  }}
                  creneauActif={
                    selection && selection.prepaId === prepa.id
                      ? { jour: selection.jour, demi: selection.demi }
                      : null
                  }
                  onSelectionCarte={(jour, demi) =>
                    setSelection((s) =>
                      s && s.prepaId === prepa.id && s.jour === jour && s.demi === demi
                        ? null
                        : { prepaId: prepa.id, jour, demi },
                    )
                  }
                  onCadrerLigne={(id) => setCible({ ligneId: id })}
                />
              ) : (
                <PrepasPanel
                  onOuvrir={(id) => {
                    setPrepaOuverte(id);
                    setSelection(null);
                  }}
                />
              ))}
          </div>
        </aside>

        {panneauOuvert && (
          <div
            className="poignee"
            onPointerDown={commencerRedim}
            title="Glisser pour élargir le panneau"
          />
        )}

        <main className="zone-carte">
          <MapView
            cible={cible}
            onPyloneClic={onPyloneClic}
            onLigneSelection={selection ? selectionCarte : undefined}
            lignesPrepa={lignesPrepa}
          />
          {selection && prepa && (
            <div className="bandeau-selection">
              <span>
                Ajout à <b>{libelleJour(selection.jour)}</b>,{' '}
                {selection.demi === 'matin' ? 'matin' : 'après-midi'} — cliquez les lignes sur la
                carte.
              </span>
              <button onClick={() => setSelection(null)}>Terminer</button>
            </div>
          )}
        </main>
      </div>

      {tachesOuvertes && <TachesFenetre onFermer={() => setTachesOuvertes(false)} />}

      {actionPylone && (
        <div className="feuille-action" role="dialog">
          <div className="feuille-entete">
            <div>
              <b>Pylône {actionPylone.pylone.num}</b>
              {!actionPylone.pylone.numReel && <span className="tag">rang calculé</span>}
              <div className="sous-titre">
                {nomAffiche(actionPylone.ligne, suivi(actionPylone.ligne.id))} · PK{' '}
                {actionPylone.pylone.d.toFixed(2).replace('.', ',')} km
              </div>
            </div>
            <button className="fermer" onClick={() => setActionPylone(null)}>
              ×
            </button>
          </div>
          <div className="ligne-boutons">
            <button
              onClick={() => {
                majSuivi(actionPylone.ligne.id, { debut: actionPylone.pylone.i });
                setActionPylone(null);
              }}
            >
              Frontière début
            </button>
            <button
              onClick={() => {
                majSuivi(actionPylone.ligne.id, { fin: actionPylone.pylone.i });
                setActionPylone(null);
              }}
            >
              Frontière fin
            </button>
            <button
              className="principal"
              onClick={() => {
                const s = suivi(actionPylone.ligne.id);
                majSuivi(actionPylone.ligne.id, {
                  avancement: actionPylone.pylone.i,
                  statut: s.statut === 'a_faire' ? 'en_cours' : s.statut,
                  dateDebut: s.dateDebut ?? aujourdhui(),
                });
                setActionPylone(null);
              }}
            >
              Fait jusqu'ici
            </button>
            <button
              onClick={() => {
                const texte = window.prompt(
                  `Observation au pylône ${actionPylone.pylone.num} :`,
                  '',
                );
                if (texte && texte.trim()) {
                  ajouterObservation({
                    ligneId: actionPylone.ligne.id,
                    pyloneI: actionPylone.pylone.i,
                    pyloneNum: actionPylone.pylone.num,
                    date: aujourdhui(),
                    gravite: 1,
                    texte: texte.trim(),
                  });
                }
                setActionPylone(null);
              }}
            >
              Observation
            </button>
            <button
              onClick={() => {
                ouvrirLigne(actionPylone.ligne);
                setActionPylone(null);
              }}
            >
              Ouvrir la ligne
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
