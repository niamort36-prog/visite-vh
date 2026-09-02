import { useStore } from '../state/store';
import { LIBELLE_CATEGORIE, type Tache } from '../lib/taches';
import { delaiLisible, joursAvant } from '../lib/semaines';
import { aujourdhui, dateCourte } from '../lib/geo';

/** Urgence d'une échéance non faite. */
export function urgence(t: Tache): 'retard' | 'proche' | 'venir' {
  const j = joursAvant(t.echeance);
  if (j < 0) return 'retard';
  if (j <= 14) return 'proche';
  return 'venir';
}

/** Liste d'échéances cochables, partagée par la fenêtre et le détail d'une préparation. */
export default function ListeTaches({
  taches,
  /** masque le repère de préparation, inutile quand on est déjà dedans */
  sansReference = false,
}: {
  taches: Tache[];
  sansReference?: boolean;
}) {
  const { taches: etats, majTache } = useStore();

  return (
    <ul className="taches">
      {taches.map((t) => {
        const etat = etats[t.id] ?? { fait: false };
        return (
          <li key={t.id} className={etat.fait ? 'tache faite' : `tache ${urgence(t)}`}>
            <input
              type="checkbox"
              checked={etat.fait}
              onChange={() =>
                majTache(t.id, { fait: !etat.fait, le: !etat.fait ? aujourdhui() : undefined })
              }
            />
            <div className="tache-corps">
              <div className="tache-titre">
                <span className={`etiquette cat-${t.categorie}`}>
                  {LIBELLE_CATEGORIE[t.categorie]}
                </span>
                <b>{t.titre}</b>
                {t.reference && !sansReference && <span className="tache-ref">{t.reference}</span>}
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
  );
}
