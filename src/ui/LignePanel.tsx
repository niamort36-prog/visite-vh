import { useMemo, useState } from 'react';
import type { Ligne, StatutLigne } from '../types';
import {
  calculerAvancement,
  codeAffiche,
  etatAgglo,
  nomAffiche,
  portionsFaites,
  useStore,
} from '../state/store';
import { couleur, LIBELLE_STATUT } from '../lib/tensions';
import { NATURES, nomNature } from '../lib/vols';
import { aujourdhui, dateCourte, km } from '../lib/geo';
import RattacherOuvrage from './RattacherOuvrage';
import ZonesSurvolees from './ZonesSurvolees';
import { SevesoDetail } from './SevesoCellule';

interface Props {
  ligne: Ligne;
  onCadrerPylone: (i: number) => void;
}

export default function LignePanel({ ligne, onCadrerPylone }: Props) {
  const {
    suivi,
    majSuivi,
    observations,
    ajouterObservation,
    supprimerObservation,
    aggloManuel,
    setAggloManuel,
    rattachement,
    majVisite,
    note,
    setNote,
    natureCourante,
    setNatureCourante,
  } = useStore();
  const s = suivi(ligne.id);
  const rat = rattachement(ligne.id);
  const nature = natureCourante;
  const v = s.visites[nature];
  const a = calculerAvancement(ligne, s, nature);
  const [filtrePylone, setFiltrePylone] = useState('');
  const [nouvelleObs, setNouvelleObs] = useState<{ i: number; gravite: 1 | 2 | 3; texte: string } | null>(
    null,
  );

  const obsLigne = useMemo(
    () => observations.filter((o) => o.ligneId === ligne.id).sort((x, y) => x.pyloneI - y.pyloneI),
    [observations, ligne.id],
  );

  const pylones = useMemo(() => {
    const f = filtrePylone.trim();
    if (!f) return ligne.pylones;
    return ligne.pylones.filter((p) => p.num.includes(f) || String(p.i) === f);
  }, [ligne.pylones, filtrePylone]);

  const changerStatut = (statut: StatutLigne) => {
    const patch: Partial<typeof v> = { statut };
    if (statut === 'fait') {
      patch.dateFin = v.dateFin ?? aujourdhui();
      patch.dateDebut = v.dateDebut ?? aujourdhui();
    } else if (statut === 'en_cours') {
      patch.dateDebut = v.dateDebut ?? aujourdhui();
    } else if (statut === 'a_faire') {
      patch.dateFin = undefined;
    }
    majVisite(ligne.id, nature, patch);
  };

  return (
    <div className="panneau detail">
      <div className="detail-entete">
        <span className="pastille-tension grosse" style={{ background: couleur(ligne.tension) }} />
        <div>
          <h2>{nomAffiche(ligne, s, rat)}</h2>
          <div className="sous-titre">
            {ligne.tension} kV · {ligne.operateur} · {km(ligne.km)} · {ligne.nbPylones} pylônes
          </div>
          {codeAffiche(ligne, s, rat) && (
            <div className="sous-titre">
              Ouvrage RTE <code>{codeAffiche(ligne, s, rat)}</code>
            </div>
          )}
          {rat?.gmr && (
            <div className="sous-titre">
              GMR <b>{rat.gmr}</b>
              {rat.cm && <> · CM {rat.cm}</>}
              {rat.eel && rat.eel !== rat.gmr && <> · EEL {rat.eel}</>}
            </div>
          )}
          {!codeAffiche(ligne, s, rat) && !!ligne.candidatsRte?.length && (
            <div className="sous-titre alerte">
              Plusieurs ouvrages RTE possibles : {ligne.candidatsRte.join(', ')}
            </div>
          )}
        </div>
      </div>

      <RattacherOuvrage ligne={ligne} s={s} />

      <div className="bloc-titre">Contexte de survol</div>
      {(() => {
        const ea = etatAgglo(ligne, aggloManuel);
        return (
          <>
            <label className="bascule-agglo">
              <input
                type="checkbox"
                checked={ea.actif}
                onChange={() => setAggloManuel(ligne.id, !ea.actif === ea.auto ? null : !ea.actif)}
              />
              <span>
                Traverse une zone d'agglomération — <b>bi-turbine obligatoire</b>
              </span>
            </label>
            <p className="aide">
              {ligne.agglo
                ? `Détection automatique : ${ligne.agglo.km
                    .toFixed(1)
                    .replace('.', ',')} km dans ${ligne.agglo.n} zone${
                    ligne.agglo.n > 1 ? 's' : ''
                  } urbanisée${ligne.agglo.n > 1 ? 's' : ''}.`
                : 'Détection automatique : aucune traversée.'}
              {ea.manuel && ' Valeur corrigée à la main.'}
              {ea.manuel && (
                <>
                  {' '}
                  <button className="lien" onClick={() => setAggloManuel(ligne.id, null)}>
                    rétablir la détection
                  </button>
                </>
              )}
            </p>
          </>
        );
      })()}
      {!!ligne.seveso?.length && <SevesoDetail sites={ligne.seveso} />}

      <div className="bloc-titre">
        Suivi de la visite
        <span className="compteur">{nomNature(nature)}</span>
      </div>
      <div className="onglets-nature">
        {NATURES.map((n) => {
          const av = calculerAvancement(ligne, s, n.cle);
          const st = s.visites[n.cle].statut;
          return (
            <button
              key={n.cle}
              className={n.cle === nature ? 'nature actif' : 'nature'}
              onClick={() => setNatureCourante(n.cle)}
              title={nomNature(n.cle)}
            >
              {n.court}
              <small>
                {st === 'hors_perimetre' ? 'hors périm.' : `${Math.round(av.pourcent)} %`}
              </small>
            </button>
          );
        })}
      </div>
      <p className="aide">
        L'avancement en kilomètres du tableau des lignes ne compte que les visites
        héliportées ; VTIR et LiDAR se suivent séparément.
      </p>

      <div className="ligne-boutons">
        {(['a_faire', 'en_cours', 'fait', 'hors_perimetre'] as StatutLigne[]).map((st) => (
          <button
            key={st}
            className={v.statut === st ? 'bouton-statut actif' : 'bouton-statut'}
            onClick={() => changerStatut(st)}
          >
            {LIBELLE_STATUT[st]}
          </button>
        ))}
      </div>

      <div className="bloc-titre">Pylônes frontières</div>
      <p className="aide">
        Bornes du tronçon dont vous avez la charge. Cliquez un pylône sur la carte pour le définir
        rapidement.
      </p>
      <div className="grille2">
        <label>
          Début
          <select
            value={s.debut ?? 1}
            onChange={(e) => majSuivi(ligne.id, { debut: Number(e.target.value) })}
          >
            {ligne.pylones.map((p) => (
              <option key={p.i} value={p.i}>
                {p.num}
                {p.numReel ? '' : ' (rang)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fin
          <select
            value={s.fin ?? ligne.pylones.length}
            onChange={(e) => majSuivi(ligne.id, { fin: Number(e.target.value) })}
          >
            {ligne.pylones.map((p) => (
              <option key={p.i} value={p.i}>
                {p.num}
                {p.numReel ? '' : ' (rang)'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bloc-titre">Avancement</div>
      <div className="avancement">
        <div className="barre grande">
          <span style={{ width: `${Math.min(a.pourcent, 100)}%` }} />
        </div>
        <div className="avancement-chiffres">
          <b>{Math.round(a.pourcent)} %</b> · {km(a.kmFaits)} faits sur {km(a.kmPerimetre)} ·{' '}
          <span className="reste">{km(a.kmRestants)} restants</span>
        </div>
      </div>
      <ZonesSurvolees ligne={ligne} nature={nature} />

      <div className="grille2 serree">
        <label>
          Première intervention
          <input
            type="date"
            value={v.dateDebut ?? ''}
            onChange={(e) => majVisite(ligne.id, nature, { dateDebut: e.target.value })}
          />
        </label>
        <label>
          Dernière intervention
          <input
            type="date"
            value={v.dateFin ?? ''}
            onChange={(e) => majVisite(ligne.id, nature, { dateFin: e.target.value })}
          />
        </label>
      </div>

      <div className="bloc-titre">Note</div>
      <p className="aide">
        Note et observations sont conservées d&apos;une campagne à l&apos;autre : vous
        retrouverez l&apos;an prochain ce qui a été consigné cette année.
      </p>
      <textarea
        className="champ"
        rows={2}
        placeholder="Contraintes, zones sensibles, consignes de survol…"
        value={note(ligne.id)}
        onChange={(e) => setNote(ligne.id, e.target.value)}
      />

      <div className="bloc-titre">
        Observations <span className="compteur">{obsLigne.length}</span>
      </div>
      {obsLigne.length === 0 && <p className="aide">Aucune observation sur cette ligne.</p>}
      <ul className="observations">
        {obsLigne.map((o) => (
          <li key={o.id} className={`gravite-${o.gravite}`}>
            <button className="lien" onClick={() => onCadrerPylone(o.pyloneI)}>
              Pylône {o.pyloneNum}
            </button>
            <span className="obs-date">{dateCourte(o.date)}</span>
            <p>{o.texte}</p>
            <button className="supprimer" onClick={() => supprimerObservation(o.id)} title="Supprimer">
              ×
            </button>
          </li>
        ))}
      </ul>

      {nouvelleObs ? (
        <div className="bloc">
          <div className="grille2 serree">
            <label>
              Pylône
              <select
                value={nouvelleObs.i}
                onChange={(e) => setNouvelleObs({ ...nouvelleObs, i: Number(e.target.value) })}
              >
                {ligne.pylones.map((p) => (
                  <option key={p.i} value={p.i}>
                    {p.num}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Gravité
              <select
                value={nouvelleObs.gravite}
                onChange={(e) =>
                  setNouvelleObs({ ...nouvelleObs, gravite: Number(e.target.value) as 1 | 2 | 3 })
                }
              >
                <option value={1}>1 — à surveiller</option>
                <option value={2}>2 — à programmer</option>
                <option value={3}>3 — urgent</option>
              </select>
            </label>
          </div>
          <textarea
            className="champ"
            rows={2}
            autoFocus
            placeholder="Constat…"
            value={nouvelleObs.texte}
            onChange={(e) => setNouvelleObs({ ...nouvelleObs, texte: e.target.value })}
          />
          <div className="ligne-boutons">
            <button
              className="principal"
              disabled={!nouvelleObs.texte.trim()}
              onClick={() => {
                const p = ligne.pylones.find((x) => x.i === nouvelleObs.i);
                ajouterObservation({
                  ligneId: ligne.id,
                  pyloneI: nouvelleObs.i,
                  pyloneNum: p?.num ?? String(nouvelleObs.i),
                  date: aujourdhui(),
                  gravite: nouvelleObs.gravite,
                  texte: nouvelleObs.texte.trim(),
                });
                setNouvelleObs(null);
              }}
            >
              Enregistrer
            </button>
            <button onClick={() => setNouvelleObs(null)}>Annuler</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setNouvelleObs({ i: a.debut, gravite: 1, texte: '' })}>
          + Ajouter une observation
        </button>
      )}

      <div className="bloc-titre">
        Pylônes <span className="compteur">{ligne.nbPylones}</span>
      </div>
      <input
        className="champ"
        placeholder="Aller au pylône n°…"
        value={filtrePylone}
        onChange={(e) => setFiltrePylone(e.target.value)}
      />
      <div className="liste-pylones">
        {pylones.slice(0, 400).map((p) => {
          const hors = p.i < a.debut || p.i > a.fin;
          const fait =
            !hors && portionsFaites(ligne, s, nature).some((z) => p.i >= z.debut && p.i <= z.fin);
          return (
            <button
              key={p.i}
              className={`pylone${hors ? ' hors' : ''}${fait ? ' fait' : ''}${
                p.i === s.debut || p.i === s.fin ? ' frontiere' : ''
              }`}
              onClick={() => onCadrerPylone(p.i)}
              title={`PK ${p.d.toFixed(2)} km${p.numReel ? '' : ' — rang calculé'}`}
            >
              {p.num}
            </button>
          );
        })}
        {pylones.length > 400 && <span className="aide">… {pylones.length - 400} autres</span>}
      </div>
    </div>
  );
}
