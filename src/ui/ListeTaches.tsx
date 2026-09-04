import { useStore } from '../state/store';
import { LIBELLE_CATEGORIE, libellePortee, type Tache } from '../lib/taches';
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
                <span className={`role role-${t.role}`}>{t.role === 'IL' ? 'Opérateur IL' : 'GET'}</span>
                {t.portee.type !== 'commune' && (
                  <span className="portee">{libellePortee(t.portee)}</span>
                )}
                {t.reference && !sansReference && <span className="tache-ref">{t.reference}</span>}
              </div>
              {t.detail && <div className="sous-titre">{t.detail}</div>}
              {t.points && t.points.length > 0 && (
                <ul className="points-tache">
                  {t.points.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
              {t.contacts && t.contacts.length > 0 && (
                <ul className="contacts-tache">
                  {t.contacts.map((c) => (
                    <li key={c.valeur}>
                      <span className="contact-libelle">{c.libelle}</span>
                      {c.type === 'mail' ? (
                        <a href={`mailto:${c.valeur}`}>{c.valeur}</a>
                      ) : c.type === 'lien' ? (
                        <a href={c.valeur} target="_blank" rel="noopener noreferrer">
                          {c.valeur}
                        </a>
                      ) : (
                        <span>{c.valeur}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="tache-echeance">
                {etat.fait ? (
                  <>Fait le {dateCourte(etat.le)}</>
                ) : (
                  <>
                    {t.auPlusTard ? 'Au plus tard le' : 'Échéance'} {dateCourte(t.echeance)} —{' '}
                    {delaiLisible(t.echeance)}
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
