import { useEffect, useMemo, useState } from 'react';
import type { Aerodrome, Creneau } from '../types';
import { chargerAerodromes } from '../data/reseau';
import { useStore } from '../state/store';
import { terrainsConcernes, tracesDesVols, typeTerrain, URL_SOFIA } from '../lib/notam';
import { libelleJour } from '../lib/semaines';

const RAYONS = [10, 15, 25];

interface Props {
  jour: string;
  creneau: Creneau | undefined;
}

/**
 * Terrains à vérifier avant un vol, déduits des ouvrages planifiés dans la journée.
 *
 * Les NOTAM ne sont pas récupérés par l'application : aucun service officiel ne les
 * expose à une page web sans compte ni clé, et un NOTAM affiché depuis un cache
 * périmé serait dangereux. Le rôle de ce bloc est de dire *quels* terrains
 * consulter, et d'ouvrir le service officiel avec les codes prêts à coller.
 */
export default function NotamJournee({ jour, creneau }: Props) {
  const { lignes } = useStore();
  const [ouvert, setOuvert] = useState(false);
  const [aerodromes, setAerodromes] = useState<Aerodrome[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rayon, setRayon] = useState(15);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    if (!ouvert || aerodromes) return;
    chargerAerodromes()
      .then(setAerodromes)
      .catch((e) => setErreur(String(e.message)));
  }, [ouvert, aerodromes]);

  const ligneIds = useMemo(() => {
    const v = [...(creneau?.matin ?? []), ...(creneau?.apresMidi ?? [])];
    return [...new Set(v.map((x) => x.ligneId))];
  }, [creneau]);

  const traces = useMemo(() => tracesDesVols(ligneIds, lignes), [ligneIds, lignes]);

  const terrains = useMemo(() => {
    if (!aerodromes || !traces.length) return [];
    return terrainsConcernes(aerodromes, traces, rayon);
  }, [aerodromes, traces, rayon]);

  const codes = terrains.map((t) => t.aerodrome.c);
  const manquants = ligneIds.length - traces.length;

  if (!ligneIds.length) return null;

  return (
    <div className="notam">
      <button
        className={ouvert ? 'bouton-notam actif' : 'bouton-notam'}
        onClick={() => setOuvert((v) => !v)}
        title="Terrains à vérifier au NOTAM pour cette journée"
      >
        NOTAM
        {terrains.length > 0 && <span className="badge">{terrains.length}</span>}
      </button>

      {ouvert && (
        <div className="notam-panneau">
          <div className="notam-entete">
            <b>Terrains concernés — {libelleJour(jour)}</b>
            <label className="rayon">
              rayon
              <select value={rayon} onChange={(e) => setRayon(Number(e.target.value))}>
                {RAYONS.map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </select>
            </label>
          </div>

          {erreur && <p className="aide alerte">{erreur}</p>}
          {!aerodromes && !erreur && <p className="aide">Chargement du référentiel…</p>}

          {manquants > 0 && (
            <p className="aide alerte">
              {manquants} ouvrage{manquants > 1 ? 's' : ''} de cette journée
              {manquants > 1 ? ' ne sont pas' : " n'est pas"} dans le secteur chargé : leur
              environnement n'a pas pu être analysé.
            </p>
          )}

          {aerodromes && terrains.length === 0 && traces.length > 0 && (
            <p className="aide">
              Aucun terrain à code OACI dans un rayon de {rayon} km des ouvrages planifiés.
              Élargissez le rayon pour vérifier.
            </p>
          )}

          {terrains.length > 0 && (
            <>
              <ul className="terrains">
                {terrains.map((t) => (
                  <li key={t.aerodrome.c}>
                    <code>{t.aerodrome.c}</code>
                    <span className="terrain-nom">
                      {t.aerodrome.n}
                      <small>
                        {' '}
                        · {typeTerrain(t.aerodrome.t)}
                        {t.aerodrome.v ? ` · ${t.aerodrome.v}` : ''}
                      </small>
                    </span>
                    <span className="terrain-distance">
                      {t.distance < 1
                        ? `${Math.round(t.distance * 1000)} m`
                        : `${t.distance.toFixed(1).replace('.', ',')} km`}
                    </span>
                    <div className="terrain-lignes">{t.lignes.join(' · ')}</div>
                  </li>
                ))}
              </ul>

              <div className="ligne-boutons">
                <button
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(`${codes.join(' ')} — ${jour}`)
                      .then(() => {
                        setCopie(true);
                        setTimeout(() => setCopie(false), 2500);
                      })
                      .catch(() => undefined);
                  }}
                >
                  {copie ? 'Copié' : 'Copier les codes OACI'}
                </button>
                <a
                  className="bouton-lien"
                  href={URL_SOFIA}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ouvrir SOFIA-Briefing ↗
                </a>
              </div>

              <p className="aide">
                Les NOTAM se consultent sur le service officiel de la DGAC, à la date du{' '}
                {new Date(`${jour}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}.
                Aucun NOTAM n'est stocké dans l'application : un NOTAM périmé induirait en erreur.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
