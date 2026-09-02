import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useTaches } from '../state/useTaches';
import ListeTaches, { urgence } from './ListeTaches';

type Filtre = 'ouvertes' | 'toutes';

/**
 * Récapitulatif des démarches à effectuer : courriers de début de campagne, et
 * pour chaque préparation les échéances qui découlent de sa date de vol.
 *
 * Les tâches sont recalculées à chaque ouverture à partir du secteur et des
 * préparations ; seul leur état est conservé.
 */
export default function TachesFenetre({ onFermer }: { onFermer: () => void }) {
  const { campagnes, campagneCourante, taches: etats, majCampagne } = useStore();
  const toutes = useTaches();
  const [filtre, setFiltre] = useState<Filtre>('ouvertes');

  const campagne = campagnes.find((c) => c.id === campagneCourante);

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

          <ListeTaches taches={visibles} />
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
