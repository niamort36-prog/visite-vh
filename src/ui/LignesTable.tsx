import { useMemo, useState } from 'react';
import type { Ligne, StatutLigne } from '../types';
import { calculerAvancement, codeAffiche, etatAgglo, nomAffiche, useStore } from '../state/store';
import { couleur, LIBELLE_STATUT, TENSIONS } from '../lib/tensions';
import { dateCourte, km } from '../lib/geo';

type Colonne = 'nom' | 'tension' | 'km' | 'perimetre' | 'faits' | 'restants' | 'pourcent' | 'date';

interface Props {
  onOuvrir: (l: Ligne) => void;
}

/** Tableau de bord du secteur : une ligne par ouvrage, avec kilométrage et avancement. */
export default function LignesTable({ onOuvrir }: Props) {
  const { lignes, suivi, ligneActive, aggloManuel, setAggloManuel } = useStore();
  const [recherche, setRecherche] = useState('');
  const [tensionsActives, setTensionsActives] = useState<number[]>([]);
  const [statutsActifs, setStatutsActifs] = useState<StatutLigne[]>([]);
  const [tri, setTri] = useState<{ col: Colonne; desc: boolean }>({ col: 'nom', desc: false });
  const [aIdentifierSeules, setAIdentifierSeules] = useState(false);
  const [aggloSeules, setAggloSeules] = useState(false);
  const [sevesoSeules, setSevesoSeules] = useState(false);

  const rangees = useMemo(() => {
    const r = recherche.trim().toLowerCase();
    return lignes
      .filter((l) => {
        if (tensionsActives.length && !tensionsActives.includes(l.tension)) return false;
        const s = suivi(l.id);
        if (statutsActifs.length && !statutsActifs.includes(s.statut)) return false;
        if (aIdentifierSeules && !l.aIdentifier) return false;
        if (aggloSeules && !etatAgglo(l, aggloManuel).actif) return false;
        if (sevesoSeules && !l.seveso?.length) return false;
        if (!r) return true;
        return (
          nomAffiche(l, s).toLowerCase().includes(r) ||
          (codeAffiche(l, s) ?? '').toLowerCase().includes(r) ||
          (l.nomRte ?? '').toLowerCase().includes(r)
        );
      })
      .map((l) => ({ l, s: suivi(l.id), a: calculerAvancement(l, suivi(l.id)) }))
      .sort((x, y) => {
        const sens = tri.desc ? -1 : 1;
        switch (tri.col) {
          case 'tension':
            return sens * (x.l.tension - y.l.tension);
          case 'km':
            return sens * (x.l.km - y.l.km);
          case 'perimetre':
            return sens * (x.a.kmPerimetre - y.a.kmPerimetre);
          case 'faits':
            return sens * (x.a.kmFaits - y.a.kmFaits);
          case 'restants':
            return sens * (x.a.kmRestants - y.a.kmRestants);
          case 'pourcent':
            return sens * (x.a.pourcent - y.a.pourcent);
          case 'date':
            return sens * String(x.s.dateMaj ?? '').localeCompare(String(y.s.dateMaj ?? ''));
          default:
            return sens * nomAffiche(x.l, x.s).localeCompare(nomAffiche(y.l, y.s), 'fr');
        }
      });
  }, [
    lignes,
    suivi,
    recherche,
    tensionsActives,
    statutsActifs,
    tri,
    aIdentifierSeules,
    aggloSeules,
    sevesoSeules,
    aggloManuel,
  ]);

  const totaux = useMemo(() => {
    const t = { perimetre: 0, faits: 0, restants: 0, lignes: rangees.length, terminees: 0 };
    for (const { s, a } of rangees) {
      if (s.statut === 'hors_perimetre') continue;
      t.perimetre += a.kmPerimetre;
      t.faits += a.kmFaits;
      t.restants += a.kmRestants;
      if (s.statut === 'fait') t.terminees++;
    }
    return t;
  }, [rangees]);

  const entete = (col: Colonne, libelle: string, titre?: string) => (
    <th
      className={tri.col === col ? 'trie' : undefined}
      title={titre}
      onClick={() => setTri((t) => ({ col, desc: t.col === col ? !t.desc : false }))}
    >
      {libelle}
      {tri.col === col && <span className="fleche">{tri.desc ? '▾' : '▴'}</span>}
    </th>
  );

  if (!lignes.length) {
    return (
      <div className="vide">
        Aucune ligne chargée. Choisissez d'abord un ou plusieurs départements dans l'onglet
        <b> Secteur</b>.
      </div>
    );
  }

  return (
    <div className="panneau tableau-panneau">
      <input
        className="champ"
        placeholder="Rechercher une ligne, un code d'ouvrage…"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
      />

      <div className="filtres">
        {TENSIONS.map((t) => (
          <button
            key={t}
            className={tensionsActives.includes(t) ? 'puce active' : 'puce'}
            style={{ borderColor: couleur(t), color: tensionsActives.includes(t) ? '#fff' : couleur(t), background: tensionsActives.includes(t) ? couleur(t) : undefined }}
            onClick={() =>
              setTensionsActives((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))
            }
          >
            {t} kV
          </button>
        ))}
        {(['a_faire', 'en_cours', 'fait', 'hors_perimetre'] as StatutLigne[]).map((s) => (
          <button
            key={s}
            className={statutsActifs.includes(s) ? 'puce active' : 'puce'}
            onClick={() =>
              setStatutsActifs((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))
            }
          >
            {LIBELLE_STATUT[s]}
          </button>
        ))}
        <button
          className={aIdentifierSeules ? 'puce active' : 'puce'}
          title="Ouvrages dont aucune extrémité n'est nommée dans les données"
          onClick={() => setAIdentifierSeules((v) => !v)}
        >
          À identifier
        </button>
        <button
          className={aggloSeules ? 'puce active puce-agglo' : 'puce puce-agglo'}
          title="Ouvrages traversant une agglomération"
          onClick={() => setAggloSeules((v) => !v)}
        >
          Agglomération
        </button>
        <button
          className={sevesoSeules ? 'puce active puce-sev' : 'puce puce-sev'}
          title="Ouvrages passant à moins de 2 km d'un site Seveso"
          onClick={() => setSevesoSeules((v) => !v)}
        >
          Seveso
        </button>
      </div>

      <p className="legende">
        <span className="pastille-agglo" /> traverse une agglomération —{' '}
        <b>bi-turbine obligatoire</b> pour le survol. La colonne <b>Agg.</b> se coche et se
        décoche : la détection automatique n'est qu'une approximation.
      </p>

      <div className="synthese">
        <div>
          <span>{totaux.lignes}</span> lignes
        </div>
        <div>
          <span>{totaux.terminees}</span> terminées
        </div>
        <div>
          <span>{km(totaux.perimetre)}</span> à visiter
        </div>
        <div className="ok">
          <span>{km(totaux.faits)}</span> faits
        </div>
        <div className="reste">
          <span>{km(totaux.restants)}</span> restants
        </div>
      </div>

      <div className="tableau-defilant">
        <table className="tableau">
          <thead>
            <tr>
              {entete('nom', 'Ligne')}
              <th
                className="col-agglo"
                title="Traverse une agglomération : bi-turbine obligatoire. Cochez ou décochez pour corriger la détection."
              >
                Agg.
              </th>
              {entete('tension', 'kV')}
              {entete('km', 'Long.', 'Longueur totale de la ligne')}
              {entete('perimetre', 'Périm.', 'Longueur entre les pylônes frontières')}
              {entete('faits', 'Faits')}
              {entete('restants', 'Reste')}
              {entete('pourcent', '%')}
              {entete('date', 'Maj')}
            </tr>
          </thead>
          <tbody>
            {rangees.map(({ l, s, a }) => (
              <tr
                key={l.id}
                className={
                  (ligneActive === l.id ? 'active ' : '') +
                  (etatAgglo(l, aggloManuel).actif ? 'agglo ' : '') +
                  `statut-${s.statut}`
                }
                onClick={() => onOuvrir(l)}
              >
                <td className="col-nom">
                  <span className="pastille-tension" style={{ background: couleur(l.tension) }} />
                  <span className="nom">{nomAffiche(l, s)}</span>
                  {l.seveso?.length && (
                    <span
                      className="marque-seveso"
                      title={l.seveso
                        .map((x) => `${x.n} — seuil ${x.t} — ${x.d} km`)
                        .join('\n')}
                    >
                      ⬤
                    </span>
                  )}
                  {codeAffiche(l, s) && <code className="code-rte">{codeAffiche(l, s)}</code>}
                </td>
                <td className="col-agglo" onClick={(e) => e.stopPropagation()}>
                  {(() => {
                    const e = etatAgglo(l, aggloManuel);
                    return (
                      <input
                        type="checkbox"
                        className={e.manuel ? 'coche-agglo manuelle' : 'coche-agglo'}
                        checked={e.actif}
                        title={
                          e.manuel
                            ? `Corrigé à la main (les données indiquent ${
                                e.auto ? 'une traversée' : 'aucune traversée'
                              }). Décochez puis recochez pour revenir à la détection.`
                            : l.agglo
                              ? `Détecté : ${l.agglo.km.toFixed(1).replace('.', ',')} km en agglomération`
                              : 'Aucune traversée détectée'
                        }
                        onChange={() =>
                          setAggloManuel(l.id, !e.actif === e.auto ? null : !e.actif)
                        }
                      />
                    );
                  })()}
                </td>
                <td className="num">{l.tension}</td>
                <td className="num">{l.km.toFixed(1).replace('.', ',')}</td>
                <td className="num">{a.kmPerimetre.toFixed(1).replace('.', ',')}</td>
                <td className="num ok">{a.kmFaits.toFixed(1).replace('.', ',')}</td>
                <td className="num reste">{a.kmRestants.toFixed(1).replace('.', ',')}</td>
                <td className="num">
                  <div className="jauge">
                    <span style={{ width: `${Math.min(a.pourcent, 100)}%` }} />
                  </div>
                  {Math.round(a.pourcent)}
                </td>
                <td className="num date">{dateCourte(s.dateMaj)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="aide">Cliquez une ligne pour l'ouvrir et la cadrer sur la carte.</p>
    </div>
  );
}
