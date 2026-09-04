import { useMemo, useState } from 'react';
import type { Ligne, StatutLigne } from '../types';
import {
  calculerAvancement,
  codeAffiche,
  kmSection,
  portionsFaites,
  etatAgglo,
  nomAffiche,
  sectionDansSecteur,
  useStore,
} from '../state/store';
import { couleur } from '../lib/tensions';
import { NATURES } from '../lib/vols';
import BarreFiltres from './BarreFiltres';
import { dateCourte, km } from '../lib/geo';

type Colonne = 'nom' | 'tension' | 'km' | 'perimetre' | 'faits' | 'restants' | 'pourcent' | 'date';

interface Props {
  onOuvrir: (l: Ligne) => void;
}

/** Tableau de bord du secteur : une ligne par ouvrage, avec kilométrage et avancement. */
export default function LignesTable({ onOuvrir }: Props) {
  const {
    lignes,
    lignesAffichees,
    suivi,
    ligneActive,
    aggloManuel,
    setAggloManuel,
    rattachement,
    secteur,
  } = useStore();
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<{ col: Colonne; desc: boolean }>({ col: 'nom', desc: false });

  const gmrDisponibles = useMemo(() => {
    const s = new Set<string>();
    for (const l of lignes) {
      const g = rattachement(l.id)?.gmr;
      if (g) s.add(g);
    }
    return [...s].sort();
  }, [lignes, rattachement]);

  const rangees = useMemo(() => {
    const r = recherche.trim().toLowerCase();
    return lignesAffichees
      .filter((l) => {
        if (!r) return true;
        const s = suivi(l.id);
        return (
          nomAffiche(l, s, rattachement(l.id)).toLowerCase().includes(r) ||
          (codeAffiche(l, s, rattachement(l.id)) ?? '').toLowerCase().includes(r) ||
          (rattachement(l.id)?.gmr ?? '').toLowerCase().includes(r) ||
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
            return (
              sens *
              String(x.s.visites.VH.dateMaj ?? '').localeCompare(
                String(y.s.visites.VH.dateMaj ?? ''),
              )
            );
          default:
            return (
              sens *
              nomAffiche(x.l, x.s, rattachement(x.l.id)).localeCompare(
                nomAffiche(y.l, y.s, rattachement(y.l.id)),
                'fr',
              )
            );
        }
      });
  }, [lignesAffichees, suivi, recherche, tri, rattachement]);

  const totaux = useMemo(() => {
    const t = { perimetre: 0, faits: 0, restants: 0, lignes: rangees.length, terminees: 0 };
    for (const { s, a } of rangees) {
      if (s.visites.VH.statut === 'hors_perimetre') continue;
      t.perimetre += a.kmPerimetre;
      t.faits += a.kmFaits;
      t.restants += a.kmRestants;
      if (s.visites.VH.statut === 'fait') t.terminees++;
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

      <BarreFiltres masquees={lignes.length - lignesAffichees.length} />

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
              {entete('faits', 'Faits', 'Kilomètres survolés en visite héliportée')}
              {entete('restants', 'Reste', 'Kilomètres restant à survoler en visite héliportée')}
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
                  `statut-${s.visites.VH.statut}`
                }
                onClick={() => onOuvrir(l)}
              >
                <td className="col-nom">
                  <span className="pastille-tension" style={{ background: couleur(l.tension) }} />
                  <span className="nom">{nomAffiche(l, s, rattachement(l.id))}</span>
                  {(() => {
                    const rt = rattachement(l.id);
                    if (!rt?.gmr) return null;
                    const num = (rang: number) =>
                      l.pylones.find((p) => p.i === rang)?.num ?? rang;
                    /*
                     * Un ouvrage qui franchit une frontière de GMR est partagé
                     * avec l'équipe voisine : on montre chaque section, la
                     * nôtre en clair, celle du voisin en grisé, pour savoir où
                     * la visite s'arrête.
                     */
                    return rt.sections.map((sec) => {
                      const notre = sectionDansSecteur(sec, secteur);
                      const partage = rt.sections.length > 1;
                      return (
                        <span
                          key={sec.code}
                          className={
                            'marque-gmr' + (partage && !notre ? ' marque-voisine' : '')
                          }
                          title={
                            `GMR ${sec.gmr}${sec.eel && sec.eel !== sec.gmr ? ` — équipe ${sec.eel}` : ''}` +
                            ` — CM ${sec.cm}` +
                            (partage
                              ? `\nPylônes ${num(sec.du)} à ${num(sec.au)} — ` +
                                `${kmSection(l, sec).toFixed(1).replace('.', ',')} km` +
                                (notre
                                  ? '\nSection à visiter par votre équipe.'
                                  : "\nSection de l'équipe voisine : la visite s'arrête à la frontière.")
                              : '')
                          }
                        >
                          {sec.eel && sec.eel !== sec.gmr ? sec.eel : sec.gmr}
                          {partage && (
                            <small>
                              {' '}
                              {num(sec.du)}–{num(sec.au)}
                            </small>
                          )}
                        </span>
                      );
                    });
                  })()}
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
                  {NATURES.filter((n) => n.cle !== 'VH').map((n) => {
                    const av = calculerAvancement(l, s, n.cle);
                    if (av.kmFaits <= 0) return null;
                    return (
                      <span
                        key={n.cle}
                        className={`marque-nature n-${n.cle}`}
                        title={(() => {
                          const num = (rang: number) =>
                            l.pylones.find((p) => p.i === rang)?.num ?? rang;
                          const zones = portionsFaites(l, s, n.cle)
                            .map((z) => `${num(z.debut)} → ${num(z.fin)}`)
                            .join(', ');
                          return (
                            `${n.nom} : ${zones || 'aucune zone'}` +
                            ` — ${av.kmFaits.toFixed(1).replace('.', ',')} km sur ` +
                            `${av.kmPerimetre.toFixed(1).replace('.', ',')} km ` +
                            `(${Math.round(av.pourcent)} %)`
                          );
                        })()}
                      >
                        {n.court} {Math.round(av.pourcent)} %
                      </span>
                    );
                  })}
                  {codeAffiche(l, s, rattachement(l.id)) && (
                    <code className="code-rte">{codeAffiche(l, s, rattachement(l.id))}</code>
                  )}
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
                <td className="num date">{dateCourte(s.visites.VH.dateMaj)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="aide">Cliquez une ligne pour l'ouvrir et la cadrer sur la carte.</p>
    </div>
  );
}
