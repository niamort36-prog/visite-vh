import { useMemo, useState } from 'react';
import type { DemiJournee, Ligne, Preparation, VolLigne } from '../types';
import { nomAffiche, useStore, volDepuisLigne } from '../state/store';
import { couleur } from '../lib/tensions';
import { domaine, dureeMinutes, libelleDuree, nomTypeVol, TYPES_VOL } from '../lib/vols';
import { joursDeSemaine, libelleJour, libelleJourCourt, libelleSemaine } from '../lib/semaines';
import { km as fmtKm } from '../lib/geo';
import NotamJournee from './NotamJournee';

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
  } = useStore();

  const [gestionFlotte, setGestionFlotte] = useState(false);
  const [nouvelHelico, setNouvelHelico] = useState({ immatriculation: '', modele: '' });
  const [ajoutManuel, setAjoutManuel] = useState<{ jour: string; demi: DemiJournee } | null>(null);
  const [recherche, setRecherche] = useState('');

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

  const duree = (v: VolLigne) => v.dureeMin ?? dureeMinutes(v.km, prepa.vitesse);

  const totalCreneau = (jour: string, demi: DemiJournee) => {
    const vols = prepa.creneaux[jour]?.[demi] ?? [];
    return {
      km: vols.reduce((a, v) => a + v.km, 0),
      min: vols.reduce((a, v) => a + duree(v), 0),
      n: vols.length,
    };
  };

  const totalPrepa = useMemo(() => {
    let km = 0;
    let min = 0;
    let n = 0;
    for (const j of joursRetenus)
      for (const d of DEMIS) {
        const t = totalCreneau(j, d.cle);
        km += t.km;
        min += t.min;
        n += t.n;
      }
    return { km, min, n };
  }, [prepa, joursRetenus]);

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
      .filter((l) => nomAffiche(l, suivi(l.id)).toLowerCase().includes(r))
      .slice(0, 30);
  }, [lignes, suivi, recherche]);

  const ajouterLigne = (l: Ligne, jour: string, demi: DemiJournee) => {
    ajouterVol(prepa.id, jour, demi, volDepuisLigne(l, suivi(l.id)));
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
          Vitesse moyenne
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
      </div>
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
                      {t.n} ouvrage{t.n > 1 ? 's' : ''} · {fmtKm(t.km)} · {libelleDuree(t.min)}
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
                            {nomAffiche(l, suivi(l.id))}
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
                          <th>Durée</th>
                          <th>Commentaire</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {vols.map((v, i) => (
                          <tr key={v.id}>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {totalPrepa.n > 0 && (
        <div className="synthese">
          <div>
            <span>{totalPrepa.n}</span> ouvrage{totalPrepa.n > 1 ? 's' : ''}
          </div>
          <div>
            <span>{fmtKm(totalPrepa.km)}</span> à survoler
          </div>
          <div>
            <span>{libelleDuree(totalPrepa.min)}</span> de vol estimé
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
    </div>
  );
}
