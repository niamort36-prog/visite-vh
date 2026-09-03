import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { km, octets, tuilesPourBbox } from '../lib/geo';
import { COUCHE_AERO, FONDS_TELECHARGEABLES, urlTuile } from '../map/fonds';
import ReferentielPanel from './ReferentielPanel';

/**
 * Choix du secteur de travail — centre de maintenance et GMR — et mise à
 * disposition hors ligne. Le découpage administratif ne sert qu'en dernier
 * recours, tant qu'aucun référentiel RTE n'a été importé.
 */
export default function SecteurPanel() {
  const {
    index,
    depts,
    setDepts,
    secteur,
    setSecteur,
    zonesDisponibles,
    referentiel,
    chargement,
    lignes,
    rattachement,
  } = useStore();
  const [filtre, setFiltre] = useState('');
  const [tache, setTache] = useState<{ libelle: string; fait: number; total: number } | null>(null);

  const selection = useMemo(
    () => (index?.departements ?? []).filter((d) => depts.includes(d.code)),
    [index, depts],
  );

  /** GMR proposés : ceux du centre retenu, ou tous. */
  const gmrProposes = useMemo(() => {
    if (secteur.cm) return zonesDisponibles.gmrParCm[secteur.cm] ?? [];
    return [...new Set(Object.values(zonesDisponibles.gmrParCm).flat())].sort();
  }, [zonesDisponibles, secteur.cm]);

  /**
   * Équipes proposées : celles des GMR retenus. Quatre GMR seulement en comptent
   * plusieurs, on n'encombre donc l'écran que lorsqu'il y a un choix à faire.
   */
  const equipesProposees = useMemo(() => {
    const source = secteur.gmr.length ? secteur.gmr : gmrProposes;
    const out = new Set<string>();
    for (const g of source) for (const e of zonesDisponibles.eelParGmr[g] ?? []) out.add(e);
    return [...out].sort();
  }, [secteur.gmr, gmrProposes, zonesDisponibles]);

  /** Volume réellement affiché après filtrage par GMR. */
  const bilan = useMemo(() => {
    let kmTotal = 0;
    let pylones = 0;
    let rattachees = 0;
    for (const l of lignes) {
      kmTotal += l.km;
      pylones += l.nbPylones;
      if (rattachement(l.id)) rattachees++;
    }
    return { lignes: lignes.length, km: kmTotal, pylones, rattachees };
  }, [lignes, rattachement]);

  function compterTuiles(indice: number, zoomMax: number): number {
    const c = FONDS_TELECHARGEABLES[indice];
    const zMax = Math.min(zoomMax, c.fond.zoomNatifMax);
    return selection.reduce(
      (a, d) => a + tuilesPourBbox(d.bbox, c.zMin, zMax).length * (c.avecAero ? 2 : 1),
      0,
    );
  }

  async function preparerHorsLigne(indice: number, zoomMax: number) {
    const choix = FONDS_TELECHARGEABLES[indice];
    if (!selection.length || !choix) return;

    const urls: string[] = [];
    const zMax = Math.min(zoomMax, choix.fond.zoomNatifMax);
    for (const d of selection) {
      for (const t of tuilesPourBbox(d.bbox, choix.zMin, zMax)) {
        urls.push(urlTuile(choix.fond, t.z, t.x, t.y));
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
            /* tuile manquante : sans conséquence, la carte restera vide ici */
          }
        }),
      );
      setTache({ libelle: choix.nom, fait: Math.min(i + lot, urls.length), total: urls.length });
    }
    setTache(null);
  }

  if (!index) return <div className="vide">Chargement du catalogue…</div>;

  const listeDepts = index.departements
    .filter(
      (d) =>
        !filtre ||
        d.nom.toLowerCase().includes(filtre.toLowerCase()) ||
        d.code.startsWith(filtre),
    )
    .sort((a, b) => a.code.localeCompare(b.code, 'fr'));

  return (
    <div className="panneau">
      <ReferentielPanel />

      {referentiel ? (
        <>
          <div className="bloc-titre">Secteur de travail</div>
          <div className="grille2">
            <label>
              Centre de maintenance
              <select
                value={secteur.cm}
                onChange={(e) =>
                  setSecteur({ ...secteur, cm: e.target.value, gmr: [], eel: [] })
                }
              >
                <option value="">Tous les centres</option>
                {zonesDisponibles.cm.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              GMR
              <select
                value=""
                onChange={(e) => {
                  const g = e.target.value;
                  if (g && !secteur.gmr.includes(g))
                    setSecteur({ ...secteur, gmr: [...secteur.gmr, g].sort(), eel: [] });
                }}
              >
                <option value="">
                  {secteur.gmr.length ? 'Ajouter un GMR…' : 'Tout le centre'}
                </option>
                {gmrProposes
                  .filter((g) => !secteur.gmr.includes(g))
                  .map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {secteur.gmr.length > 0 && (
            <div className="filtres">
              {secteur.gmr.map((g) => (
                <button
                  key={g}
                  className="puce active"
                  title="Retirer ce GMR du secteur"
                  onClick={() =>
                    setSecteur({
                      ...secteur,
                      gmr: secteur.gmr.filter((x) => x !== g),
                      eel: [],
                    })
                  }
                >
                  {g} ×
                </button>
              ))}
              <button
                className="puce"
                onClick={() => setSecteur({ ...secteur, gmr: [], eel: [] })}
              >
                Tout effacer
              </button>
            </div>
          )}

          {equipesProposees.length > 1 && (
            <>
              <label>
                Équipe (EEL)
                <select
                  value=""
                  onChange={(e) => {
                    const x = e.target.value;
                    if (x && !secteur.eel.includes(x))
                      setSecteur({ ...secteur, eel: [...secteur.eel, x].sort() });
                  }}
                >
                  <option value="">
                    {secteur.eel.length ? 'Ajouter une équipe…' : 'Toutes les équipes'}
                  </option>
                  {equipesProposees
                    .filter((x) => !secteur.eel.includes(x))
                    .map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                </select>
              </label>
              {secteur.eel.length > 0 && (
                <div className="filtres">
                  {secteur.eel.map((x) => (
                    <button
                      key={x}
                      className="puce active puce-eel"
                      title="Retirer cette équipe du secteur"
                      onClick={() =>
                        setSecteur({ ...secteur, eel: secteur.eel.filter((y) => y !== x) })
                      }
                    >
                      {x} ×
                    </button>
                  ))}
                  <button className="puce" onClick={() => setSecteur({ ...secteur, eel: [] })}>
                    Toutes les équipes
                  </button>
                </div>
              )}
            </>
          )}

          <label className="bascule-agglo">
            <input
              type="checkbox"
              checked={secteur.inclureNonRattaches}
              onChange={(e) => setSecteur({ ...secteur, inclureNonRattaches: e.target.checked })}
            />
            <span>Afficher aussi les ouvrages que le référentiel ne rattache à aucun GMR</span>
          </label>

          {!secteur.cm && !secteur.gmr.length && !secteur.eel.length && (
            <p className="aide">
              Choisissez un centre de maintenance, puis un ou plusieurs GMR. Les données du
              réseau se chargent automatiquement sur l&apos;emprise correspondante.
            </p>
          )}

          {(secteur.cm || secteur.gmr.length > 0 || secteur.eel.length > 0) && (
            <div className="bloc">
              <div className="bloc-titre">Secteur chargé</div>
              <div className="stats">
                <div>
                  <b>{bilan.lignes}</b> ouvrages
                </div>
                <div>
                  <b>{bilan.pylones.toLocaleString('fr-FR')}</b> pylônes
                </div>
                <div>
                  <b>{km(bilan.km, 0)}</b> de réseau
                </div>
                <div>
                  <b>{bilan.rattachees}</b> rattachés au référentiel
                </div>
              </div>
              {chargement && <div className="aide">Chargement des données…</div>}
              {!chargement && bilan.lignes === 0 && (
                <p className="aide alerte">
                  Aucun ouvrage sur ce secteur. Vérifiez le GMR retenu, ou cochez
                  l&apos;affichage des ouvrages non rattachés.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bloc-titre">Secteur de travail</div>
          <p className="aide">
            Importez le référentiel RTE ci-dessus pour choisir votre secteur par centre de
            maintenance et par GMR. En attendant, sélectionnez les départements à charger.
          </p>
          <input
            className="champ"
            placeholder="Filtrer par nom ou numéro…"
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
          />
          <div className="liste-depts">
            {listeDepts.map((d) => (
              <label key={d.code} className={depts.includes(d.code) ? 'dept coche' : 'dept'}>
                <input
                  type="checkbox"
                  checked={depts.includes(d.code)}
                  onChange={() =>
                    setDepts(
                      depts.includes(d.code)
                        ? depts.filter((c) => c !== d.code)
                        : [...depts, d.code],
                    )
                  }
                />
                <span className="dept-code">{d.code}</span>
                <span className="dept-nom">{d.nom}</span>
                <span className="dept-meta">
                  {d.nbLignes} lignes · {km(d.km, 0)} · {octets(d.taille)}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {selection.length > 0 && (
        <div className="bloc">
          <div className="bloc-titre">Préparer le vol hors connexion</div>
          <p className="aide">
            Les données réseau sont mises en cache dès leur chargement. Choisissez ici les fonds
            de carte à emporter sur l&apos;emprise du secteur.
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
    </div>
  );
}
