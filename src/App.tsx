import { useCallback, useRef, useState } from 'react';
import MapView, { type CibleCarte } from './map/MapView';
import SecteurPanel from './ui/SecteurPanel';
import LignesTable from './ui/LignesTable';
import LignePanel from './ui/LignePanel';
import CampagneBarre from './ui/CampagneBarre';
import { nomAffiche, useStore } from './state/store';
import type { Ligne, Pylone } from './types';
import { aujourdhui } from './lib/geo';

type Onglet = 'secteur' | 'lignes' | 'ligne';

export default function App() {
  const { lignes, ligneActive, setLigneActive, erreur, majSuivi, suivi, ajouterObservation } =
    useStore();
  const [onglet, setOnglet] = useState<Onglet>('secteur');
  const [cible, setCible] = useState<CibleCarte | null>(null);
  const [panneauOuvert, setPanneauOuvert] = useState(true);
  const [actionPylone, setActionPylone] = useState<{ ligne: Ligne; pylone: Pylone } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const ligne = lignes.find((l) => l.id === ligneActive) ?? null;

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
          className="bascule-panneau"
          onClick={() => setPanneauOuvert((v) => !v)}
          title={panneauOuvert ? 'Masquer le panneau' : 'Afficher le panneau'}
        >
          {panneauOuvert ? '⟨' : '⟩'}
        </button>
      </header>

      {erreur && <div className="bandeau-erreur">{erreur}</div>}

      <div className="corps">
        <aside className="panneau-lateral">
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
              {ligne ? 'Ouvrage' : 'Ouvrage'}
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
          </div>
        </aside>

        <main className="zone-carte">
          <MapView cible={cible} onPyloneClic={onPyloneClic} />
        </main>
      </div>

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

      <input
        ref={importRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={() => undefined}
      />
    </div>
  );
}
