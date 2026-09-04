import { useMemo } from 'react';
import type { DemiJournee, FichePreparation, Preparation } from '../types';
import { etatAgglo, nomAffiche, useStore } from '../state/store';
import { calculerJournee, clotureDemiJournee } from '../lib/trajets';
import { km as fmtKm } from '../lib/geo';
import { libelleJour, libelleSemaine } from '../lib/semaines';
import { natureDuTypeVol, nomTypeVol } from '../lib/vols';

const DEMIS: { cle: DemiJournee; nom: string }[] = [
  { cle: 'matin', nom: 'Matin' },
  { cle: 'apresMidi', nom: 'Après Midi' },
];

/** Case à cocher de formulaire, imprimable. */
function Case({ coche }: { coche: boolean }) {
  return <span className="case">{coche ? 'x' : ''}</span>;
}

/**
 * Fiche de préparation au format d'usage : une page de garde reprenant les
 * informations principales, puis une page par demi-journée avec le programme
 * des lignes. Conçue pour être imprimée telle quelle.
 */
export default function FichePrepa({
  prepa,
  onFermer,
}: {
  prepa: Preparation;
  onFermer?: () => void;
}) {
  const {
    lignes,
    suivi,
    rattachement,
    majPreparation,
    majVol,
    aggloManuel,
    zonesDePoser,
    pointsCarburant,
  } = useStore();

  const parId = useMemo(() => new Map(lignes.map((l) => [l.id, l])), [lignes]);
  const jours = useMemo(() => [...prepa.jours].sort(), [prepa.jours]);
  const fiche: FichePreparation = prepa.fiche ?? {};
  const nature = natureDuTypeVol(prepa.typeVol);
  const dz = zonesDePoser.find((z) => z.id === prepa.dzId);

  const majFiche = (patch: Partial<FichePreparation>) =>
    majPreparation(prepa.id, { fiche: { ...fiche, ...patch } });

  /** Demi-journées effectivement programmées, pour cocher Matin / Après Midi. */
  const demisUtilisees = useMemo(() => {
    const s = new Set<DemiJournee>();
    for (const j of jours) {
      if (prepa.creneaux[j]?.matin.length) s.add('matin');
      if (prepa.creneaux[j]?.apresMidi.length) s.add('apresMidi');
    }
    return s;
  }, [jours, prepa.creneaux]);

  /** Ouvrages traversant une agglomération : ils motivent la demande STH. */
  const agglos = useMemo(() => {
    const noms: string[] = [];
    for (const j of jours)
      for (const d of DEMIS)
        for (const v of prepa.creneaux[j]?.[d.cle] ?? []) {
          const l = parId.get(v.ligneId);
          if (l && etatAgglo(l, aggloManuel).actif && !noms.includes(v.nom)) noms.push(v.nom);
        }
    return noms;
  }, [jours, prepa.creneaux, parId, aggloManuel]);

  const numero = `${prepa.semaine}/${prepa.annee}`;

  return (
    <div className="fiche">
      <div className="fiche-outils">
        {onFermer && <button onClick={onFermer}>‹ Fermer</button>}
        <button className="principal" onClick={() => window.print()}>
          Imprimer
        </button>
        <span className="aide">
          Les points particuliers et les renseignements de cette fiche sont modifiables ici et
          enregistrés avec la préparation.
        </span>
      </div>

      {/* ---------------------------------------------------- page de garde */}
      <section className="page">
        <h1>PRÉPARATION DE TRAVAIL DE LA VISITE HÉLIPORTÉE N° {numero}</h1>
        <div className="fiche-semaine">{libelleSemaine(prepa.annee, prepa.semaine)}</div>

        <h2>Nature de la mission à réaliser :</h2>
        <table className="cadre nature">
          <tbody>
            <tr>
              <td>Visite Héliportée</td>
              <td className="c">
                <Case coche={nature === 'VH'} />
              </td>
              <td>Matin</td>
              <td className="c">
                <Case coche={demisUtilisees.has('matin')} />
              </td>
            </tr>
            <tr>
              <td>Visite Thermographique</td>
              <td className="c">
                <Case coche={nature === 'VTIR'} />
              </td>
              <td>Après Midi</td>
              <td className="c">
                <Case coche={demisUtilisees.has('apresMidi')} />
              </td>
            </tr>
            <tr>
              <td>Autre Visite</td>
              <td className="c">
                <Case coche={nature === 'LIDAR'} />
              </td>
              <td colSpan={2}>
                À préciser : <b>{nomTypeVol(prepa.typeVol)}</b>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mention">
          Le détail des points particuliers des lignes visitées est mentionné sur les pages
          suivantes.
        </p>

        <h2>Information des Chargés d&apos;Exploitation par le GMR :</h2>
        <table className="cadre">
          <tbody>
            <tr>
              <th>Groupements de postes</th>
              <td>
                <input
                  value={fiche.groupementPostes ?? ''}
                  onChange={(e) => majFiche({ groupementPostes: e.target.value })}
                />
              </td>
            </tr>
            <tr>
              <th>N° de téléphone</th>
              <td>
                <input
                  value={fiche.telPostes ?? ''}
                  onChange={(e) => majFiche({ telPostes: e.target.value })}
                />
              </td>
            </tr>
            <tr>
              <th>Date d&apos;information</th>
              <td>
                <input
                  value={fiche.dateInfoPostes ?? ''}
                  onChange={(e) => majFiche({ dateInfoPostes: e.target.value })}
                />
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Information des groupements de gendarmerie par le GMR :</h2>
        <table className="cadre">
          <tbody>
            <tr>
              <th>Groupements de gendarmerie</th>
              <td>
                <input
                  value={fiche.gendarmeries ?? ''}
                  onChange={(e) => majFiche({ gendarmeries: e.target.value })}
                />
              </td>
            </tr>
            <tr>
              <th>N° de téléphone</th>
              <td>
                <input
                  value={fiche.telGendarmerie ?? ''}
                  onChange={(e) => majFiche({ telGendarmerie: e.target.value })}
                />
              </td>
            </tr>
            <tr>
              <th>Date d&apos;information</th>
              <td>
                <input
                  value={fiche.dateInfoGendarmerie ?? ''}
                  onChange={(e) => majFiche({ dateInfoGendarmerie: e.target.value })}
                />
              </td>
            </tr>
          </tbody>
        </table>

        <h2>Demande spécifique d&apos;autorisation de survol par le STH :</h2>
        <table className="cadre">
          <thead>
            <tr>
              <th>Nature du survol</th>
              <th>Organisme ayant délivré l&apos;autorisation</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  value={fiche.sthNature ?? (agglos.length ? 'Agglomération' : '')}
                  onChange={(e) => majFiche({ sthNature: e.target.value })}
                />
              </td>
              <td>
                <input
                  value={fiche.sthOrganisme ?? ''}
                  onChange={(e) => majFiche({ sthOrganisme: e.target.value })}
                />
              </td>
              <td>
                <input
                  value={fiche.sthDate ?? ''}
                  onChange={(e) => majFiche({ sthDate: e.target.value })}
                />
              </td>
            </tr>
          </tbody>
        </table>
        {agglos.length > 0 && (
          <p className="mention">
            Ouvrages traversant une agglomération : {agglos.join(', ')}.
          </p>
        )}

        <h2>Observations diverses :</h2>
        <textarea
          className="cadre observations"
          rows={4}
          value={
            fiche.observations ??
            [
              prepa.immatriculation
                ? `Utilisation de l'hélicoptère ${prepa.immatriculation}`
                : '',
              dz ? `Zone de poser : ${dz.nom}` : '',
            ]
              .filter(Boolean)
              .join('\n')
          }
          onChange={(e) => majFiche({ observations: e.target.value })}
        />

        <h2>Dates et Visas :</h2>
        <table className="cadre visas">
          <thead>
            <tr>
              <th>Rédacteur GET</th>
              <th>Valideur GET</th>
              <th>OAN</th>
              <th>Pilote</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  value={fiche.redacteur ?? ''}
                  onChange={(e) => majFiche({ redacteur: e.target.value })}
                />
              </td>
              <td>
                <input
                  value={fiche.valideur ?? ''}
                  onChange={(e) => majFiche({ valideur: e.target.value })}
                />
              </td>
              <td>
                <input
                  value={prepa.oan ?? ''}
                  onChange={(e) => majPreparation(prepa.id, { oan: e.target.value })}
                />
              </td>
              <td>
                <input
                  value={prepa.pilote ?? ''}
                  onChange={(e) => majPreparation(prepa.id, { pilote: e.target.value })}
                />
              </td>
            </tr>
            <tr className="visa-date">
              <td colSpan={4}>
                Date : {prepa.validee ? new Date(prepa.validee.le).toLocaleDateString('fr-FR') : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ------------------------------------------ une page par demi-journée */}
      {jours.map((jour) =>
        DEMIS.map((d) => {
          const vols = prepa.creneaux[jour]?.[d.cle] ?? [];
          if (!vols.length) return null;
          const total = vols.reduce((a, v) => a + v.km, 0);
          const cloture = clotureDemiJournee(
            calculerJournee(prepa, prepa.creneaux[jour], dz, parId, suivi, pointsCarburant),
            d.cle,
          );
          return (
            <section className="page" key={`${jour}-${d.cle}`}>
              <div className="fiche-entete-jour">
                <h1>VISITE HÉLIPORTÉE N° {numero}</h1>
                <div className="demis">
                  <span>
                    Matin <Case coche={d.cle === 'matin'} />
                  </span>
                  <span>
                    Après Midi <Case coche={d.cle === 'apresMidi'} />
                  </span>
                </div>
              </div>
              <div className="fiche-jour">{libelleJour(jour)}</div>

              <h2>Programme des lignes à visiter :</h2>
              <table className="cadre programme">
                <thead>
                  <tr>
                    <th>Nom des ouvrages à visiter</th>
                    <th className="c">KV</th>
                    <th className="c">Km</th>
                    <th>Points particuliers à signaler</th>
                    <th className="c">IFL</th>
                  </tr>
                </thead>
                <tbody>
                  {vols.map((v) => {
                    const l = parId.get(v.ligneId);
                    return (
                      <tr key={v.id}>
                        <td>{l ? nomAffiche(l, suivi(l.id), rattachement(l.id)) : v.nom}</td>
                        <td className="c">{v.tension}</td>
                        <td className="c">{v.km.toFixed(1).replace('.', ',')}</td>
                        <td>
                          <input
                            value={v.commentaire ?? ''}
                            placeholder="…"
                            onChange={(e) =>
                              majVol(prepa.id, jour, d.cle, v.id, {
                                commentaire: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="c">
                          <input
                            type="checkbox"
                            checked={Boolean(v.ifl)}
                            onChange={(e) =>
                              majVol(prepa.id, jour, d.cle, v.id, { ifl: e.target.checked })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="total">
                    <td />
                    <td />
                    <td className="c">{total.toFixed(1).replace('.', ',')}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>

              {cloture && (
                <p className="mention retour">
                  Fin de vacation :{' '}
                  {cloture.carburant ? (
                    <>
                      ravitaillement{' '}
                      <b>
                        {cloture.carburant.oaci ? `${cloture.carburant.oaci} — ` : ''}
                        {cloture.carburant.nom}
                      </b>
                      {cloture.ravitaillementKm != null &&
                        ` (${cloture.ravitaillementKm.toFixed(0)} km)`}
                      , puis retour
                    </>
                  ) : (
                    <>retour</>
                  )}{' '}
                  {dz?.nom ?? 'zone de poser'}
                  {cloture.retourKm != null && ` (${cloture.retourKm.toFixed(0)} km)`}.
                </p>
              )}

              <p className="mention">
                Les points particuliers seront repérés sur plan du réseau du GMR avant chaque
                début de mission.
              </p>
              <p className="mention">
                Pour chaque changement de programme, un point d&apos;arrêt sera réalisé avant le
                début de la mission.
              </p>
            </section>
          );
        }),
      )}

      {jours.length === 0 && (
        <p className="aide">
          Aucun jour n&apos;est retenu dans cette préparation : le programme est vide.
        </p>
      )}

      <div className="fiche-pied">
        Total de la semaine :{' '}
        <b>
          {fmtKm(
            jours.reduce(
              (a, j) =>
                a +
                DEMIS.reduce(
                  (b, d) =>
                    b + (prepa.creneaux[j]?.[d.cle] ?? []).reduce((c, v) => c + v.km, 0),
                  0,
                ),
              0,
            ),
          )}
        </b>
      </div>
    </div>
  );
}
