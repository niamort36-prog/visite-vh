import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { km, octets, tuilesPourBbox } from '../lib/geo';
import { estHorsLigne } from '../data/reseau';
import { COUCHE_AERO, FONDS_TELECHARGEABLES, urlTuile } from '../map/fonds';
import ReferentielPanel from './ReferentielPanel';

/**
 * Choix du secteur : quels départements charger, et mise à disposition hors ligne
 * (données réseau + fonds de carte) avant de partir en vol.
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

  /** Nombre de tuiles à télécharger pour un fond et un zoom maximum donnés. */
  function compterTuiles(indice: number, zoomMax: number): number {
    const c = FONDS_TELECHARGEABLES[indice];
    const zMax = Math.min(zoomMax, c.fond.zoomNatifMax);
    return selection.reduce(
      (a, d) => a + tuilesPourBbox(d.bbox, c.zMin, zMax).length * (c.avecAero ? 2 : 1),
      0,
    );
  }

  /** Pré-charge les tuiles d'un fond sur l'emprise sélectionnée, pour l'usage en vol. */
  async function preparerHorsLigne(indice: number, zoomMax: number) {
    const choix = FONDS_TELECHARGEABLES[indice];
    if (!selection.length || !choix) return;

    const urls: string[] = [];
    const zMax = Math.min(zoomMax, choix.fond.zoomNatifMax);
    for (const d of selection) {
      for (const t of tuilesPourBbox(d.bbox, choix.zMin, zMax)) {
        urls.push(urlTuile(choix.fond, t.z, t.x, t.y));
        // la carte VFR n'a de sens qu'accompagnée de sa surcharge aéronautique
        if (choix.avecAero) urls.push(urlTuile(COUCHE_AERO, t.z, t.x, t.y));
      }
    }
    if (
      urls.length > 40000 &&
      !window.confirm(
        `Ce secteur représente ${urls.length.toLocaleString('fr-FR')} tuiles, ` +
          'soit un téléchargement long et volumineux. Continuer ?',
      )
    )
      return;

    const cache = await caches.open(choix.avecAero ? 'tuiles-vfr' : 'tuiles-ign');
    setTache({ libelle: choix.nom, fait: 0, total: urls.length });
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
      setTache({ libelle: choix.nom, fait: Math.min(i + lot, urls.length), total: urls.length });
    }
    setTache(null);
  }

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

      <ReferentielPanel />

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
            Les données réseau sont mises en cache dès leur chargement. Choisissez ici les fonds de
            carte à emporter : ils resteront affichables sans réseau sur l'emprise du secteur.
          </p>
          <div className="fonds-telechargement">
            {FONDS_TELECHARGEABLES.map((c, i) => (
              <div key={c.fond.cle} className="fond-ligne">
                <span className="fond-nom">{c.nom}</span>
                <div className="ligne-boutons">
                  {(c.fond.zoomNatifMax >= 14 ? [13, 14] : [11, 12]).map((z) => (
                    <button key={z} onClick={() => preparerHorsLigne(i, z)} disabled={!!tache}>
                      zoom {z}
                      <small> · {compterTuiles(i, z).toLocaleString('fr-FR')} tuiles</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
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
