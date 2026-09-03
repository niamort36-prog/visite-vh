import { useMemo, useState } from 'react';
import type { DemiJournee, Ligne, Preparation, VolLigne } from '../types';
import { etatAgglo, nomAffiche, useStore, volDepuisLigne } from '../state/store';
import { couleur } from '../lib/tensions';
import {
  domaine,
  dureeMinutes,
  libelleDuree,
  nomTypeVol,
  TYPES_VOL,
  VITESSE_TRANSIT,
} from '../lib/vols';
import { calculerJournee, etapesDemiJournee } from '../lib/trajets';
import { joursDeSemaine, libelleJour, libelleJourCourt, libelleSemaine } from '../lib/semaines';
import { km as fmtKm } from '../lib/geo';
import NotamJournee from './NotamJournee';
import { SevesoBadge, SevesoDetail } from './SevesoCellule';
import ListeTaches from './ListeTaches';
import { useTaches } from '../state/useTaches';

const DEMIS: { cle: DemiJournee; nom: string }[] = [
  { cle: 'matin', nom: 'Matin' },
  { cle: 'apresMidi', nom: 'Après-midi' },
];

interface Props {
  prepa: Preparation;
  onRetour: () => void;
  /** active la sélection sur la carte à destination d'un créneau */
  onSelectionCarte: (jour: string, demi: DemiJournee) => void;
  /** créneau actuellement alimenté par la carte, s'il y en a un */
  creneauActif: { jour: string; demi: DemiJournee } | null;
  onCadrerLigne: (ligneId: string) => void;
}

export default function PrepaDetail({
  prepa,
  onRetour,
  onSelectionCarte,
  creneauActif,
  onCadrerLigne,
}: Props) {
  const {
    lignes,
    suivi,
    majPreparation,
    supprimerPreparation,
    dupliquerPreparation,
    ajouterVol,
    majVol,
    supprimerVol,
    deplacerVol,
    helicopteres,
    ajouterHelicoptere,
    supprimerHelicoptere,
    aggloManuel,
    rattachement,
    zonesDePoser,
    taches: etatsTaches,
  } = useStore();

  /** Le dossier d'une préparation se lit par volets, pour ne pas tout empiler. */
  const [volet, setVolet] = useState<'planning' | 'echeances'>('planning');

  // échéances propres à cette préparation, partagées avec la fenêtre des échéances
  const toutesTaches = useTaches();
  const tachesPrepa = useMemo(
    () => toutesTaches.filter((t) => t.prepaId === prepa.id),
    [toutesTaches, prepa.id],
  );
  const tachesOuvertes = tachesPrepa.filter((t) => !etatsTaches[t.id]?.fait).length;

  const [gestionFlotte, setGestionFlotte] = useState(false);
  const [nouvelHelico, setNouvelHelico] = useState({ immatriculation: '', modele: '' });
  const [ajoutManuel, setAjoutManuel] = useState<{ jour: string; demi: DemiJournee } | null>(null);
  const [recherche, setRecherche] = useState('');
  /** identifiant du vol dont le détail Seveso est déplié */
  const [sevesoOuvert, setSevesoOuvert] = useState<string | null>(null);

  const joursSemaine = useMemo(
    () => joursDeSemaine(prepa.annee, prepa.semaine),
    [prepa.annee, prepa.semaine],
  );
  const joursRetenus = useMemo(
    () => joursSemaine.filter((j) => prepa.jours.includes(j)),
    [joursSemaine, prepa.jours],
  );

  /** Ouvrages déjà planifiés, pour éviter les doublons involontaires. */
  const dejaPlanifies = useMemo(() => {
    const s = new Set<string>();
    for (const c of Object.values(prepa.creneaux))
      for (const v of [...c.matin, ...c.apresMidi]) s.add(v.ligneId);
    return s;
  }, [prepa.creneaux]);

  /** Contexte de survol d'un ouvrage, quand son département est chargé. */
  const parId = useMemo(() => new Map(lignes.map((l) => [l.id, l])), [lignes]);

  const dz = zonesDePoser.find((z) => z.id === prepa.dzId);

  /** Enchaînement calculé de chaque journée : liaisons comprises. */
  const journees = useMemo(() => {
    const m = new Map<string, ReturnType<typeof calculerJournee>>();
    for (const j of joursRetenus)
      m.set(j, calculerJournee(prepa, prepa.creneaux[j], dz, parId, suivi));
    return m;
  }, [prepa, joursRetenus, dz, parId, suivi]);

  const duree = (v: VolLigne) => v.dureeMin ?? dureeMinutes(v.km, prepa.vitesse);

  const totalCreneau = (jour: string, demi: DemiJournee) => {
    const vols = prepa.creneaux[jour]?.[demi] ?? [];
    const etapes = etapesDemiJournee(journees.get(jour) ?? { etapes: [] } as never, demi);
    return {
      km: vols.reduce((a, v) => a + v.km, 0),
      min: vols.reduce((a, v) => a + duree(v), 0),
      transit: etapes.reduce((a, e) => a + e.transitMin, 0),
      n: vols.length,
    };
  };

  const totalPrepa = useMemo(() => {
    let km = 0;
    let min = 0;
    let transit = 0;
    let n = 0;
    for (const j of joursRetenus) {
      const jc = journees.get(j);
      if (!jc) continue;
      transit += jc.totalTransitMin;
      min += jc.totalVisiteMin;
      for (const e of jc.etapes) {
        km += e.vol.km;
        n++;
      }
    }
    return { km, min, transit, n };
  }, [joursRetenus, journees]);

  /** Ouvrages en agglomération alors que la préparation est en mono-turbine. */
  const alerteMono = useMemo(() => {
    if (prepa.typeVol !== 'VH_MONO') return 0;
    const ids = new Set<string>();
    for (const c of Object.values(prepa.creneaux))
      for (const v of [...c.matin, ...c.apresMidi]) {
        const ref = parId.get(v.ligneId);
        if (ref && etatAgglo(ref, aggloManuel).actif) ids.add(v.ligneId);
      }
    return ids.size;
  }, [prepa, parId, aggloManuel]);

  const basculerJour = (j: string) =>
    majPreparation(prepa.id, {
      jours: prepa.jours.includes(j)
        ? prepa.jours.filter((x) => x !== j)
        : [...prepa.jours, j].sort(),
    });

  const resultatsRecherche = useMemo(() => {
    const r = recherche.trim().toLowerCase();
    if (!r) return [];
    return lignes
      .filter((l) => nomAffiche(l, suivi(l.id), rattachement(l.id)).toLowerCase().includes(r))
      .slice(0, 30);
  }, [lignes, suivi, recherche, rattachement]);

  const ajouterLigne = (l: Ligne, jour: string, demi: DemiJournee) => {
    ajouterVol(prepa.id, jour, demi, volDepuisLigne(l, suivi(l.id), rattachement(l.id)));
  };

  return (
    <div className="panneau detail">
      <div className="prepa-entete">
        <button className="lien" onClick={onRetour}>
          ‹ Préparations
        </button>
        <div className="ligne-boutons">
          <button onClick={() => dupliquerPreparation(prepa.id)} title="Dupliquer">
            Dupliquer
          </button>
          <button
            onClick={() => {
              if (window.confirm(`Supprimer la préparation S${prepa.semaine} ?`)) {
                supprimerPreparation(prepa.id);
                onRetour();
              }
            }}
          >
            Supprimer
          </button>
        </div>
      </div>

      <h2 className="prepa-titre">
        S{String(prepa.semaine).padStart(2, '0')} · {nomTypeVol(prepa.typeVol)}
      </h2>
      <div className="sous-titre">{libelleSemaine(prepa.annee, prepa.semaine)}</div>

      <nav className="volets">
        <button
          className={volet === 'planning' ? 'actif' : ''}
          onClick={() => setVolet('planning')}
        >
          Planning
        </button>
        <button
          className={volet === 'echeances' ? 'actif' : ''}
          onClick={() => setVolet('echeances')}
        >
          Échéances
          {tachesOuvertes > 0 && <span className="badge">{tachesOuvertes}</span>}
        </button>
      </nav>

      {volet === 'echeances' ? (
        <>
          {tachesPrepa.length === 0 ? (
            <p className="aide">Aucune échéance pour cette semaine.</p>
          ) : (
            <ListeTaches taches={tachesPrepa} sansReference />
          )}
        </>
      ) : (
        <>
      <div className="bloc-titre">Équipage et appareil</div>
      <div className="grille2">
        <label>
          OAN
          <input
            className="champ"
            placeholder="Nom de l'OAN"
            value={prepa.oan ?? ''}
            onChange={(e) => majPreparation(prepa.id, { oan: e.target.value })}
          />
        </label>
        <label>
          Pilote
          <input
            className="champ"
            placeholder="Nom du pilote"
            value={prepa.pilote ?? ''}
            onChange={(e) => majPreparation(prepa.id, { pilote: e.target.value })}
          />
        </label>
        <label>
          Immatriculation
          <select
            value={prepa.immatriculation ?? ''}
            onChange={(e) => majPreparation(prepa.id, { immatriculation: e.target.value })}
          >
            <option value="">—</option>
            {helicopteres.map((h) => (
              <option key={h.id} value={h.immatriculation}>
                {h.immatriculation}
                {h.modele ? ` — ${h.modele}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vitesse de visite
          <input
            className="champ"
            type="number"
            min={10}
            max={250}
            value={prepa.vitesse}
            onChange={(e) =>
              majPreparation(prepa.id, { vitesse: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </label>
        <label>
          Zone de poser
          <select
            value={prepa.dzId ?? ''}
            onChange={(e) => majPreparation(prepa.id, { dzId: e.target.value || undefined })}
          >
            <option value="">—</option>
            {zonesDePoser.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nom}
                {z.gmr ? ` — ${z.gmr}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vitesse de transit
          <input
            className="champ"
            type="number"
            min={50}
            max={350}
            value={prepa.vitesseTransit ?? VITESSE_TRANSIT}
            onChange={(e) =>
              majPreparation(prepa.id, {
                vitesseTransit: Math.max(1, Number(e.target.value) || VITESSE_TRANSIT),
              })
            }
          />
        </label>
      </div>
      {!dz && zonesDePoser.length === 0 && (
        <p className="aide">
          Aucune zone de poser enregistrée. Créez-en une dans l&apos;onglet <b>Secteur</b> pour
          que les trajets de liaison soient calculés.
        </p>
      )}
      <button className="lien aligne-gauche" onClick={() => setGestionFlotte((v) => !v)}>
        {gestionFlotte ? 'Masquer la flotte' : 'Gérer les appareils'}
      </button>

      {gestionFlotte && (
        <div className="bloc">
          <ul className="flotte">
            {helicopteres.map((h) => (
              <li key={h.id}>
                <b>{h.immatriculation}</b>
                {h.modele && <span className="sous-titre"> {h.modele}</span>}
                <button
                  className="supprimer"
                  title="Retirer de la flotte"
                  onClick={() => supprimerHelicoptere(h.id)}
                >
                  ×
                </button>
              </li>
            ))}
            {helicopteres.length === 0 && <li className="aide">Aucun appareil enregistré.</li>}
          </ul>
          <div className="grille2 serree">
            <input
              className="champ"
              placeholder="Immatriculation (F-…)"
              value={nouvelHelico.immatriculation}
              onChange={(e) =>
                setNouvelHelico({ ...nouvelHelico, immatriculation: e.target.value })
              }
            />
            <input
              className="champ"
              placeholder="Modèle (facultatif)"
              value={nouvelHelico.modele}
              onChange={(e) => setNouvelHelico({ ...nouvelHelico, modele: e.target.value })}
            />
          </div>
          <button
            className="principal"
            disabled={!nouvelHelico.immatriculation.trim()}
            onClick={() => {
              ajouterHelicoptere({
                immatriculation: nouvelHelico.immatriculation,
                modele: nouvelHelico.modele.trim() || undefined,
              });
              setNouvelHelico({ immatriculation: '', modele: '' });
            }}
          >
            Ajouter l'appareil
          </button>
        </div>
      )}

      <div className="bloc-titre">Jours de la semaine</div>
      <div className="jours-semaine">
        {joursSemaine.map((j) => (
          <button
            key={j}
            className={prepa.jours.includes(j) ? 'jour actif' : 'jour'}
            onClick={() => basculerJour(j)}
          >
            {libelleJourCourt(j)}
          </button>
        ))}
      </div>

      {joursRetenus.length === 0 && (
        <p className="aide">Sélectionnez au moins un jour pour composer le planning.</p>
      )}

      {joursRetenus.map((jour) => (
        <div key={jour} className="journee">
          <div className="journee-titre">{libelleJour(jour)}</div>
          <NotamJournee jour={jour} creneau={prepa.creneaux[jour]} />

          {(() => {
            const jc = journees.get(jour);
            return jc && jc.retourKm != null && jc.etapes.length > 0 ? (
              <div className="retour-dz">
                Retour {dz?.nom} : {libelleDuree(jc.retourMin)} · {jc.retourKm.toFixed(0)} km ·
                journée estimée à <b>{libelleDuree(jc.totalMin)}</b>
              </div>
            ) : null;
          })()}
          {DEMIS.map((d) => {
            const vols = prepa.creneaux[jour]?.[d.cle] ?? [];
            const t = totalCreneau(jour, d.cle);
            const actif = creneauActif?.jour === jour && creneauActif.demi === d.cle;
            const enAjout = ajoutManuel?.jour === jour && ajoutManuel.demi === d.cle;

            return (
              <div key={d.cle} className={actif ? 'creneau actif' : 'creneau'}>
                <div className="creneau-entete">
                  <b>{d.nom}</b>
                  {t.n > 0 && (
                    <span className="creneau-total">
                      {t.n} ouvrage{t.n > 1 ? 's' : ''} · {fmtKm(t.km)} ·{' '}
                      {libelleDuree(t.min)} de visite
                      {t.transit > 0 && <> + {libelleDuree(t.transit)} de liaison</>}
                    </span>
                  )}
                  <div className="ligne-boutons">
                    <button
                      className={actif ? 'principal' : ''}
                      onClick={() => onSelectionCarte(jour, d.cle)}
                      title="Cliquer ensuite les lignes sur la carte"
                    >
                      {actif ? 'Sélection en cours…' : '+ depuis la carte'}
                    </button>
                    <button
                      onClick={() => {
                        setAjoutManuel(enAjout ? null : { jour, demi: d.cle });
                        setRecherche('');
                      }}
                    >
                      + par nom
                    </button>
                  </div>
                </div>

                {enAjout && (
                  <div className="bloc">
                    <input
                      className="champ"
                      autoFocus
                      placeholder="Rechercher un ouvrage du secteur…"
                      value={recherche}
                      onChange={(e) => setRecherche(e.target.value)}
                    />
                    <div className="liste-ouvrages">
                      {resultatsRecherche.map((l) => (
                        <button
                          key={l.id}
                          className="ouvrage"
                          onClick={() => {
                            ajouterLigne(l, jour, d.cle);
                            setRecherche('');
                            setAjoutManuel(null);
                          }}
                        >
                          <code>{l.tension} kV</code>
                          <span>
                            {nomAffiche(l, suivi(l.id), rattachement(l.id))}
                            {dejaPlanifies.has(l.id) && <span className="tag">déjà planifié</span>}
                          </span>
                        </button>
                      ))}
                      {recherche && resultatsRecherche.length === 0 && (
                        <span className="aide">Aucun ouvrage ne correspond.</span>
                      )}
                      {!recherche && (
                        <span className="aide">
                          Saisissez un nom d'ouvrage. Les lignes proposées sont celles du secteur
                          chargé.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {vols.length === 0 ? (
                  <p className="aide">Aucun ouvrage sur ce créneau.</p>
                ) : (
                  <div className="tableau-defilant sans-hauteur">
                    <table className="tableau planning">
                      <thead>
                        <tr>
                          <th>Ligne</th>
                          <th>Domaine</th>
                          <th>km</th>
                          <th title="Extrémité par laquelle commence la visite">Départ</th>
                          <th title="Trajet de liaison depuis le point précédent">Liaison</th>
                          <th>Durée</th>
                          <th title="Sites Seveso à moins de 2 km du tracé">Seveso</th>
                          <th>Commentaire</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {vols.map((v, i) => {
                          const ref = parId.get(v.ligneId);
                          const etape = etapesDemiJournee(
                            journees.get(jour) ?? ({ etapes: [] } as never),
                            d.cle,
                          ).find((e) => e.vol.id === v.id);
                          return (
                          <tr
                            key={v.id}
                            className={
                              ref && etatAgglo(ref, aggloManuel).actif ? 'agglo' : undefined
                            }
                          >
                            <td className="col-nom">
                              <span
                                className="pastille-tension"
                                style={{ background: couleur(v.tension) }}
                              />
                              <button className="lien" onClick={() => onCadrerLigne(v.ligneId)}>
                                {v.nom}
                              </button>
                            </td>
                            <td>
                              {domaine(v.tension)}
                              <small> · {v.tension} kV</small>
                            </td>
                            <td className="num">
                              <input
                                className="cellule num"
                                type="number"
                                step="0.1"
                                value={v.km}
                                onChange={(e) =>
                                  majVol(prepa.id, jour, d.cle, v.id, {
                                    km: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </td>
                            <td className="col-sens">
                              <select
                                className="cellule"
                                value={v.sens ?? 'AB'}
                                onChange={(e) =>
                                  majVol(prepa.id, jour, d.cle, v.id, {
                                    sens: e.target.value as 'AB' | 'BA',
                                  })
                                }
                                title="Extrémité par laquelle commence la visite"
                              >
                                <option value="AB">{ref?.extremites[0] || 'Début'}</option>
                                <option value="BA">{ref?.extremites[1] || 'Fin'}</option>
                              </select>
                            </td>
                            <td className="num liaison">
                              {etape?.transitKm == null ? (
                                <span className="aide" title="Zone de poser ou tracé inconnu">
                                  —
                                </span>
                              ) : (
                                <>
                                  {libelleDuree(etape.transitMin)}
                                  <small>
                                    {etape.transitKm.toFixed(0)} km
                                  </small>
                                </>
                              )}
                            </td>
                            <td className="num duree" title="Modifiable : saisir des minutes">
                              <input
                                className="cellule num"
                                type="number"
                                step="5"
                                value={duree(v)}
                                onChange={(e) =>
                                  majVol(prepa.id, jour, d.cle, v.id, {
                                    dureeMin: Number(e.target.value) || 0,
                                  })
                                }
                              />
                              {duree(v) >= 60 && <small>{libelleDuree(duree(v))}</small>}
                            </td>
                            <td className="col-seveso">
                              {ref ? (
                                <SevesoBadge
                                  sites={ref.seveso ?? []}
                                  ouvert={sevesoOuvert === v.id}
                                  onToggle={() =>
                                    setSevesoOuvert((x) => (x === v.id ? null : v.id))
                                  }
                                />
                              ) : (
                                <span className="aide" title="Département non chargé">
                                  ?
                                </span>
                              )}
                            </td>
                            <td>
                              <input
                                className="cellule"
                                placeholder="…"
                                value={v.commentaire ?? ''}
                                onChange={(e) =>
                                  majVol(prepa.id, jour, d.cle, v.id, {
                                    commentaire: e.target.value,
                                  })
                                }
                              />
                            </td>
                            <td className="actions-vol">
                              <button
                                disabled={i === 0}
                                title="Monter"
                                onClick={() => deplacerVol(prepa.id, jour, d.cle, v.id, -1)}
                              >
                                ▲
                              </button>
                              <button
                                disabled={i === vols.length - 1}
                                title="Descendre"
                                onClick={() => deplacerVol(prepa.id, jour, d.cle, v.id, 1)}
                              >
                                ▼
                              </button>
                              <button
                                title="Retirer"
                                onClick={() => supprimerVol(prepa.id, jour, d.cle, v.id)}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                        {vols.map((v) => {
                          const ref = parId.get(v.ligneId);
                          if (sevesoOuvert !== v.id || !ref?.seveso?.length) return null;
                          return (
                            <tr key={`${v.id}-seveso`} className="rangee-seveso">
                              <td colSpan={9}>
                                <SevesoDetail sites={ref.seveso} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {alerteMono > 0 && (
        <p className="alerte-mono">
          <b>{alerteMono}</b> ouvrage{alerteMono > 1 ? 's' : ''} de cette préparation
          traverse{alerteMono > 1 ? 'nt' : ''} une agglomération : le survol impose un
          appareil <b>bi-turbine</b>, or la préparation est en {nomTypeVol(prepa.typeVol)}.
        </p>
      )}

      {totalPrepa.n > 0 && (
        <div className="synthese">
          <div>
            <span>{totalPrepa.n}</span> ouvrage{totalPrepa.n > 1 ? 's' : ''}
          </div>
          <div>
            <span>{fmtKm(totalPrepa.km)}</span> à survoler
          </div>
          <div>
            <span>{libelleDuree(totalPrepa.min)}</span> de visite
          </div>
          {totalPrepa.transit > 0 && (
            <div>
              <span>{libelleDuree(totalPrepa.transit)}</span> de liaison
            </div>
          )}
          <div>
            <span>{libelleDuree(totalPrepa.min + totalPrepa.transit)}</span> au total
          </div>
        </div>
      )}

      <div className="bloc-titre">Note de préparation</div>
      <textarea
        className="champ"
        rows={2}
        placeholder="Contraintes, terrain de départ, avitaillement, contacts…"
        value={prepa.note ?? ''}
        onChange={(e) => majPreparation(prepa.id, { note: e.target.value })}
      />

      <div className="bloc-titre">Type de vol</div>
      <select
        value={prepa.typeVol}
        onChange={(e) =>
          majPreparation(prepa.id, { typeVol: e.target.value as Preparation['typeVol'] })
        }
      >
        {TYPES_VOL.map((t) => (
          <option key={t.cle} value={t.cle}>
            {t.nom}
          </option>
        ))}
      </select>
        </>
      )}
    </div>
  );
}
