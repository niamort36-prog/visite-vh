import { useMemo } from 'react';
import type { StatutLigne } from '../types';
import { FILTRES_VIDES, filtresActifs, useStore } from '../state/store';
import { couleur, LIBELLE_STATUT, TENSIONS } from '../lib/tensions';
import { domaine } from '../lib/vols';

/** Tensions regroupées par domaine, au sens RTE. */
const DOMAINES: { cle: string; nom: string; tensions: number[] }[] = [
  { cle: 'HTB1', nom: 'HTB1 — 63 et 90 kV', tensions: [63, 90] },
  { cle: 'HTB2', nom: 'HTB2 — 150 et 225 kV', tensions: [150, 225] },
  { cle: 'HTB3', nom: 'HTB3 — 400 kV', tensions: [400] },
];

const STATUTS: StatutLigne[] = ['a_faire', 'en_cours', 'fait', 'hors_perimetre'];

/**
 * Filtres d'affichage, communs à la liste et à la carte : ce qui est masqué ici
 * disparaît des deux.
 */
export default function BarreFiltres({ masquees }: { masquees: number }) {
  const { filtres, setFiltres, lignes, rattachement } = useStore();

  const gmrDisponibles = useMemo(() => {
    const s = new Set<string>();
    for (const l of lignes) {
      const g = rattachement(l.id)?.gmr;
      if (g) s.add(g);
    }
    return [...s].sort();
  }, [lignes, rattachement]);

  const basculer = <T,>(liste: T[], v: T): T[] =>
    liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v];

  /** Un domaine est actif quand toutes ses tensions le sont. */
  const domaineActif = (d: (typeof DOMAINES)[number]) =>
    d.tensions.every((t) => filtres.tensions.includes(t));

  const actifs = filtresActifs(filtres);

  return (
    <div className="barre-filtres">
      <div className="filtres">
        <span className="aide">Domaine :</span>
        {DOMAINES.map((d) => (
          <button
            key={d.cle}
            className={domaineActif(d) ? 'puce active' : 'puce'}
            title={d.nom}
            onClick={() =>
              setFiltres({
                ...filtres,
                tensions: domaineActif(d)
                  ? filtres.tensions.filter((t) => !d.tensions.includes(t))
                  : [...new Set([...filtres.tensions, ...d.tensions])],
              })
            }
          >
            {d.cle}
          </button>
        ))}
        <span className="separateur-filtres" />
        {TENSIONS.map((t) => (
          <button
            key={t}
            className={filtres.tensions.includes(t) ? 'puce active' : 'puce'}
            title={`${t} kV — ${domaine(t)}`}
            style={{
              borderColor: couleur(t),
              color: filtres.tensions.includes(t) ? '#fff' : couleur(t),
              background: filtres.tensions.includes(t) ? couleur(t) : undefined,
            }}
            onClick={() => setFiltres({ ...filtres, tensions: basculer(filtres.tensions, t) })}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="filtres">
        <span className="aide">Avancement :</span>
        {STATUTS.map((st) => (
          <button
            key={st}
            className={filtres.statuts.includes(st) ? 'puce active' : 'puce'}
            onClick={() => setFiltres({ ...filtres, statuts: basculer(filtres.statuts, st) })}
          >
            {LIBELLE_STATUT[st]}
          </button>
        ))}
      </div>

      <div className="filtres">
        <button
          className={filtres.aggloSeules ? 'puce active puce-agglo' : 'puce puce-agglo'}
          title="Ouvrages traversant une agglomération"
          onClick={() => setFiltres({ ...filtres, aggloSeules: !filtres.aggloSeules })}
        >
          Agglomération
        </button>
        <button
          className={filtres.sevesoSeules ? 'puce active puce-sev' : 'puce puce-sev'}
          title="Ouvrages passant à moins de 2 km d'un site Seveso"
          onClick={() => setFiltres({ ...filtres, sevesoSeules: !filtres.sevesoSeules })}
        >
          Seveso
        </button>
        <button
          className={filtres.aIdentifierSeules ? 'puce active' : 'puce'}
          title="Ouvrages dont aucune extrémité n'est nommée"
          onClick={() =>
            setFiltres({ ...filtres, aIdentifierSeules: !filtres.aIdentifierSeules })
          }
        >
          À identifier
        </button>
        <span className="separateur-filtres" />
        <button
          className={filtres.postes ? 'puce active' : 'puce'}
          title="Afficher les postes sur la carte"
          onClick={() => setFiltres({ ...filtres, postes: !filtres.postes })}
        >
          Postes
        </button>
      </div>

      {gmrDisponibles.length > 1 && (
        <div className="filtres">
          <span className="aide">GMR :</span>
          {gmrDisponibles.map((g) => (
            <button
              key={g}
              className={filtres.gmr.includes(g) ? 'puce active' : 'puce'}
              onClick={() => setFiltres({ ...filtres, gmr: basculer(filtres.gmr, g) })}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {actifs && (
        <div className="filtres-actifs">
          <b>{masquees}</b> ouvrage{masquees > 1 ? 's' : ''} masqué{masquees > 1 ? 's' : ''} sur
          la liste et sur la carte
          <button
            className="lien"
            onClick={() => setFiltres({ ...FILTRES_VIDES, postes: filtres.postes })}
          >
            tout afficher
          </button>
        </div>
      )}
    </div>
  );
}
