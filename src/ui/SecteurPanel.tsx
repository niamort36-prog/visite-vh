import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { km, octets, tuilesPourBbox } from '../lib/geo';
import { estHorsLigne } from '../data/reseau';

/**
 * Choix du secteur : quels départements charger, et mise à disposition hors ligne
 * (données réseau + fond de carte) avant de partir en vol.
 */
export default function SecteurPanel() {
  const { index, depts, setDepts, chargement } = useStore();
  const [filtre, setFiltre] = useState('');
  const [dispo, setDispo] = useState<Record<string, boolean>>({});
  const [tache, setTache] = useState<{ libelle: string; fait: number; total: number } | null>(null);

  const liste = useMemo(() => {
    if (!index) return [];
    const f = filtre.trim().toLowerCase();
    return index.departements
      .filter((d) => !f || d.nom.toLowerCase().includes(f) || d.code.startsWith(f))
      .sort((a, b) => a.code.localeCompare(b.code, 'fr'));
  }, [index, filtre]);

  useEffect(() => {
    if (!index) return;
    let vivant = true;
    Promise.all(
      index.departements.map(async (d) => [d.code, await estHorsLigne(d.code)] as const),
    ).then((r) => vivant && setDispo(Object.fromEntries(r)));
    return () => {
      vivant = false;
    };
  }, [index, depts]);

  const basculer = (code: string) =>
    setDepts(depts.includes(code) ? depts.filter((c) => c !== code) : [...depts, code]);

  const selection = useMemo(
    () => (index?.departements ?? []).filter((d) => depts.includes(d.code)),
    [index, depts],
  );

  /** Pré-charge les tuiles IGN de l'emprise sélectionnée pour l'usage en vol. */
  async function preparerHorsLigne(zoomMax: number) {
    if (!selection.length) return;
    const urls: string[] = [];
    for (const d of selection) {
      for (const t of tuilesPourBbox(d.bbox, 8, zoomMax)) {
        urls.push(
          'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
            '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
            `&FORMAT=image/png&TILEMATRIX=${t.z}&TILEROW=${t.y}&TILECOL=${t.x}`,
        );
      }
    }
    const cache = await caches.open('tuiles-ign');
    setTache({ libelle: 'Fond de carte', fait: 0, total: urls.length });
    let fait = 0;
    const lot = 8;
    for (let i = 0; i < urls.length; i += lot) {
      await Promise.all(
        urls.slice(i, i + lot).map(async (u) => {
          try {
            if (!(await cache.match(u))) await cache.add(u);
          } catch {
            /* tuile manquante : sans conséquence, la carte restera simplement vide ici */
          }
        }),
      );
      fait = Math.min(i + lot, urls.length);
      setTache({ libelle: 'Fond de carte', fait, total: urls.length });
    }
    setTache(null);
  }

  const totalTuiles = useMemo(() => {
    return selection.reduce((a, d) => a + tuilesPourBbox(d.bbox, 8, 14).length, 0);
  }, [selection]);

  if (!index) return <div className="vide">Chargement du catalogue…</div>;

  return (
    <div className="panneau">
      <p className="aide">
        Sélectionnez les départements de votre secteur. Les données restent disponibles hors
        connexion une fois chargées.
      </p>

      <input
        className="champ"
        placeholder="Filtrer par nom ou numéro…"
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
      />

      <div className="liste-depts">
        {liste.map((d) => (
          <label key={d.code} className={depts.includes(d.code) ? 'dept coche' : 'dept'}>
            <input
              type="checkbox"
              checked={depts.includes(d.code)}
              onChange={() => basculer(d.code)}
            />
            <span className="dept-code">{d.code}</span>
            <span className="dept-nom">{d.nom}</span>
            <span className="dept-meta">
              {d.nbLignes} lignes · {km(d.km, 0)} · {octets(d.taille)}
              {dispo[d.code] && <span className="pastille" title="Disponible hors ligne" />}
            </span>
          </label>
        ))}
        {liste.length === 0 && <div className="vide">Aucun département ne correspond.</div>}
      </div>

      {selection.length > 0 && (
        <div className="bloc">
          <div className="bloc-titre">Secteur sélectionné</div>
          <div className="stats">
            <div>
              <b>{selection.reduce((a, d) => a + d.nbLignes, 0)}</b> lignes
            </div>
            <div>
              <b>{selection.reduce((a, d) => a + d.nbPylones, 0).toLocaleString('fr-FR')}</b> pylônes
            </div>
            <div>
              <b>{km(selection.reduce((a, d) => a + d.km, 0), 0)}</b> de réseau
            </div>
            <div>
              <b>{selection.reduce((a, d) => a + d.nbPostes, 0)}</b> postes
            </div>
          </div>

          <div className="bloc-titre">Préparer le vol hors connexion</div>
          <p className="aide">
            Les données réseau sont déjà mises en cache à leur chargement. Ce bouton télécharge en
            plus le fond de carte du secteur (~{totalTuiles.toLocaleString('fr-FR')} tuiles jusqu'au
            zoom 14).
          </p>
          <div className="ligne-boutons">
            <button onClick={() => preparerHorsLigne(13)} disabled={!!tache}>
              Fond de carte — zoom 13
            </button>
            <button onClick={() => preparerHorsLigne(14)} disabled={!!tache}>
              zoom 14 (plus détaillé)
            </button>
          </div>
          {tache && (
            <div className="progression">
              <div className="barre">
                <span style={{ width: `${(tache.fait / tache.total) * 100}%` }} />
              </div>
              <small>
                {tache.libelle} : {tache.fait.toLocaleString('fr-FR')} /{' '}
                {tache.total.toLocaleString('fr-FR')} tuiles
              </small>
            </div>
          )}
        </div>
      )}

      {chargement && <div className="vide">Chargement des données…</div>}
    </div>
  );
}
