import { useEffect, useMemo, useState } from 'react';
import type { Aerodrome } from '../types';
import { useStore } from '../state/store';
import { chargerAerodromes } from '../data/reseau';
import { typeTerrain } from '../lib/notam';

/**
 * Points de ravitaillement en carburant aviation.
 *
 * Aucune source ouverte ne publie la disponibilité du Jet A-1 terrain par
 * terrain : elle figure dans l'AIP, à la rubrique « Carburants » de chaque
 * aérodrome, et évolue. Ces points sont donc renseignés par l'exploitant, avec
 * un raccourci pour partir d'un terrain du référentiel plutôt que de saisir des
 * coordonnées à la main.
 */
export default function CarburantPanel() {
  const { pointsCarburant, ajouterPointCarburant, majPointCarburant, supprimerPointCarburant } =
    useStore();
  const [ouvert, setOuvert] = useState(false);
  const [aerodromes, setAerodromes] = useState<Aerodrome[] | null>(null);
  const [recherche, setRecherche] = useState('');

  useEffect(() => {
    if (!ouvert || aerodromes) return;
    chargerAerodromes()
      .then(setAerodromes)
      .catch(() => setAerodromes([]));
  }, [ouvert, aerodromes]);

  const resultats = useMemo(() => {
    if (!aerodromes) return [];
    const r = recherche.trim().toLowerCase();
    if (!r) return [];
    const deja = new Set(pointsCarburant.map((c) => c.oaci).filter(Boolean));
    return aerodromes
      .filter(
        (a) =>
          a.c &&
          !deja.has(a.c) &&
          (a.n.toLowerCase().includes(r) ||
            a.c.toLowerCase().includes(r) ||
            a.v.toLowerCase().includes(r)),
      )
      .slice(0, 25);
  }, [aerodromes, recherche, pointsCarburant]);

  return (
    <div className="bloc">
      <div className="bloc-titre">
        Ravitaillement carburant
        {pointsCarburant.length > 0 && (
          <span className="compteur">{pointsCarburant.length}</span>
        )}
      </div>

      {pointsCarburant.length === 0 && (
        <p className="aide">
          Aucun point enregistré. Ajoutez les terrains où vous vous ravitaillez : ils
          apparaîtront sur la carte.
        </p>
      )}

      <ul className="carburants">
        {pointsCarburant.map((c) => (
          <li key={c.id}>
            <div className="carburant-entete">
              {c.oaci && <code>{c.oaci}</code>}
              <input
                className="cellule"
                value={c.nom}
                onChange={(e) => majPointCarburant(c.id, { nom: e.target.value })}
              />
              <button
                className="supprimer"
                title="Supprimer ce point"
                onClick={() => supprimerPointCarburant(c.id)}
              >
                ×
              </button>
            </div>
            <div className="carburant-options">
              <label className="coche">
                <input
                  type="checkbox"
                  checked={c.jetA1}
                  onChange={(e) => majPointCarburant(c.id, { jetA1: e.target.checked })}
                />
                Jet A-1
              </label>
              <label className="coche">
                <input
                  type="checkbox"
                  checked={Boolean(c.avgas)}
                  onChange={(e) => majPointCarburant(c.id, { avgas: e.target.checked })}
                />
                100LL
              </label>
              <label className="coche">
                <input
                  type="checkbox"
                  checked={Boolean(c.automate)}
                  onChange={(e) => majPointCarburant(c.id, { automate: e.target.checked })}
                />
                Automate
              </label>
            </div>
            <div className="grille2 serree">
              <input
                className="champ"
                placeholder="Horaires"
                value={c.horaires ?? ''}
                onChange={(e) => majPointCarburant(c.id, { horaires: e.target.value })}
              />
              <input
                className="champ"
                placeholder="Téléphone"
                value={c.telephone ?? ''}
                onChange={(e) => majPointCarburant(c.id, { telephone: e.target.value })}
              />
            </div>
          </li>
        ))}
      </ul>

      {ouvert ? (
        <div className="bloc">
          <input
            className="champ"
            autoFocus
            placeholder="Chercher un terrain (nom, code OACI, commune)…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {!aerodromes && <p className="aide">Chargement du référentiel des terrains…</p>}
          <div className="liste-ouvrages">
            {resultats.map((a) => (
              <button
                key={a.c}
                className="ouvrage"
                onClick={() => {
                  ajouterPointCarburant({
                    nom: a.n,
                    oaci: a.c,
                    lat: a.y,
                    lon: a.x,
                    jetA1: true,
                  });
                  setRecherche('');
                  setOuvert(false);
                }}
              >
                <code>{a.c}</code>
                <span>
                  {a.n}
                  <small>
                    {' '}
                    · {typeTerrain(a.t)}
                    {a.v ? ` · ${a.v}` : ''}
                  </small>
                </span>
              </button>
            ))}
            {recherche && aerodromes && resultats.length === 0 && (
              <span className="aide">Aucun terrain ne correspond.</span>
            )}
            {!recherche && aerodromes && (
              <span className="aide">
                Saisissez un nom de terrain, un code OACI ou une commune.
              </span>
            )}
          </div>
          <button onClick={() => setOuvert(false)}>Fermer</button>
        </div>
      ) : (
        <button onClick={() => setOuvert(true)}>+ Ajouter un point de ravitaillement</button>
      )}

      <p className="aide">
        La disponibilité du carburant n&apos;est publiée par aucune source ouverte
        exploitable : elle figure dans l&apos;AIP, rubrique « Carburants » de chaque
        aérodrome, et évolue. À vérifier avant de compter dessus.
      </p>
    </div>
  );
}
