import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { genererTaches, LIBELLE_CATEGORIE, type Tache } from '../lib/taches';
import { delaiLisible, joursAvant } from '../lib/semaines';
import { aujourdhui, dateCourte } from '../lib/geo';

type Filtre = 'ouvertes' | 'toutes';

/** Urgence d'une échéance non faite. */
function urgence(t: Tache): 'retard' | 'proche' | 'venir' {
  const j = joursAvant(t.echeance);
  if (j < 0) return 'retard';
  if (j <= 14) return 'proche';
  return 'venir';
}

/**
 * Récapitulatif des démarches à effectuer : courriers de début de campagne, et
 * pour chaque préparation les échéances qui découlent de sa date de vol.
 *
 * Les tâches sont recalculées à chaque ouverture à partir du secteur et des
 * préparations ; seul leur état est conservé.
 */
export default function TachesFenetre({ onFermer }: { onFermer: () => void }) {
  const {
    campagnes,
    campagneCourante,
    index,
    depts,
    preparations,
    lignes,
    taches: etats,
    majTache,
    majCampagne,
  } = useStore();
  const [filtre, setFiltre] = useState<Filtre>('ouvertes');

  const campagne = campagnes.find((c) => c.id === campagneCourante);

  const entrees = useMemo(
    () => (index?.departements ?? []).filter((d) => depts.includes(d.code)),
    [index, depts],
  );

  const toutes = useMemo(
    () => (campagne ? genererTaches(campagne, entrees, preparations, lignes) : []),
    [campagne, entrees, preparations, lignes],
  );

  const visibles = useMemo(
    () => (filtre === 'toutes' ? toutes : toutes.filter((t) => !etats[t.id]?.fait)),
    [toutes, filtre, etats],
  );

  const compte = useMemo(() => {
    const ouvertes = toutes.filter((t) => !etats[t.id]?.fait);
    return {
      total: toutes.length,
      ouvertes: ouvertes.length,
      retard: ouvertes.filter((t) => urgence(t) === 'retard').length,
      proche: ouvertes.filter((t) => urgence(t) === 'proche').length,
    };
  }, [toutes, etats]);

  if (!campagne) return null;

  const debut = campagne.debut ?? campagne.creeLe.slice(0, 10);

  return (
    <div className="voile" onClick={onFermer}>
      <div className="fenetre" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="fenetre-entete">
          <div>
            <h2>Échéances — {campagne.nom}</h2>
            <div className="sous-titre">
              {compte.ouvertes} à faire sur {compte.total}
              {compte.retard > 0 && <span className="compte-retard"> · {compte.retard} en retard</span>}
              {compte.proche > 0 && <span className="compte-proche"> · {compte.proche} sous 15 jours</span>}
            </div>
          </div>
          <button className="fermer" onClick={onFermer} title="Fermer">
            ×
          </button>
        </div>

        <div className="fenetre-barre">
          <label className="rayon">
            Début de campagne
            <input
              type="date"
              value={debut}
              onChange={(e) => majCampagne(campagne.id, { debut: e.target.value })}
            />
          </label>
          <div className="ligne-boutons">
            <button
              className={filtre === 'ouvertes' ? 'puce active' : 'puce'}
              onClick={() => setFiltre('ouvertes')}
            >
              À faire
            </button>
            <button
              className={filtre === 'toutes' ? 'puce active' : 'puce'}
              onClick={() => setFiltre('toutes')}
            >
              Tout
            </button>
          </div>
        </div>

        <div className="fenetre-contenu">
          {visibles.length === 0 && (
            <p className="aide">
              {toutes.length === 0
                ? "Aucune échéance : chargez un secteur et créez une préparation de vol."
                : 'Tout est fait.'}
            </p>
          )}

          <ul className="taches">
            {visibles.map((t) => {
              const etat = etats[t.id] ?? { fait: false };
              const u = urgence(t);
              return (
                <li key={t.id} className={etat.fait ? 'tache faite' : `tache ${u}`}>
                  <input
                    type="checkbox"
                    checked={etat.fait}
                    onChange={() =>
                      majTache(t.id, {
                        fait: !etat.fait,
                        le: !etat.fait ? aujourdhui() : undefined,
                      })
                    }
                  />
                  <div className="tache-corps">
                    <div className="tache-titre">
                      <span className={`etiquette cat-${t.categorie}`}>
                        {LIBELLE_CATEGORIE[t.categorie]}
                      </span>
                      <b>{t.titre}</b>
                      {t.reference && <span className="tache-ref">{t.reference}</span>}
                    </div>
                    {t.detail && <div className="sous-titre">{t.detail}</div>}
                    <div className="tache-echeance">
                      {etat.fait ? (
                        <>Fait le {dateCourte(etat.le)}</>
                      ) : (
                        <>
                          Échéance {dateCourte(t.echeance)} — {delaiLisible(t.echeance)}
                        </>
                      )}
                    </div>
                    <input
                      className="cellule tache-note"
                      placeholder="note…"
                      value={etat.note ?? ''}
                      onChange={(e) => majTache(t.id, { note: e.target.value })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="aide fenetre-pied">
          Les échéances se recalculent à partir du secteur chargé et des préparations : le
          premier jour de vol de chaque préparation fixe les délais (cinq semaines pour le STH,
          une semaine pour les autres démarches).
        </p>
      </div>
    </div>
  );
}
