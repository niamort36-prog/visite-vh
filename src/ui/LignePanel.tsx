import { useMemo, useState } from 'react';
import type { Ligne, StatutLigne, SuiviLigne } from '../types';
import { calculerAvancement, codeAffiche, nomAffiche, useStore } from '../state/store';
import { couleur, LIBELLE_STATUT } from '../lib/tensions';
import { aujourdhui, dateCourte, km } from '../lib/geo';
import RattacherOuvrage from './RattacherOuvrage';

interface Props {
  ligne: Ligne;
  onCadrerPylone: (i: number) => void;
}

export default function LignePanel({ ligne, onCadrerPylone }: Props) {
  const { suivi, majSuivi, observations, ajouterObservation, supprimerObservation } = useStore();
  const s = suivi(ligne.id);
  const a = calculerAvancement(ligne, s);
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
    const patch: Partial<SuiviLigne> = { statut };
    if (statut === 'fait') {
      patch.avancement = a.fin;
      patch.dateFin = s.dateFin ?? aujourdhui();
      patch.dateDebut = s.dateDebut ?? aujourdhui();
    } else if (statut === 'en_cours') {
      patch.dateDebut = s.dateDebut ?? aujourdhui();
    } else if (statut === 'a_faire') {
      patch.avancement = undefined;
      patch.dateFin = undefined;
    }
    majSuivi(ligne.id, patch);
  };

  return (
    <div className="panneau detail">
      <div className="detail-entete">
        <span className="pastille-tension grosse" style={{ background: couleur(ligne.tension) }} />
        <div>
          <h2>{nomAffiche(ligne, s)}</h2>
          <div className="sous-titre">
            {ligne.tension} kV · {ligne.operateur} · {km(ligne.km)} · {ligne.nbPylones} pylônes
          </div>
          {codeAffiche(ligne, s) && (
            <div className="sous-titre">
              Ouvrage RTE <code>{codeAffiche(ligne, s)}</code>
            </div>
          )}
          {!codeAffiche(ligne, s) && !!ligne.candidatsRte?.length && (
            <div className="sous-titre alerte">
              Plusieurs ouvrages RTE possibles : {ligne.candidatsRte.join(', ')}
            </div>
          )}
        </div>
      </div>

      <RattacherOuvrage ligne={ligne} s={s} />

      <div className="bloc-titre">Statut</div>
      <div className="ligne-boutons">
        {(['a_faire', 'en_cours', 'fait', 'hors_perimetre'] as StatutLigne[]).map((st) => (
          <button
            key={st}
            className={s.statut === st ? 'bouton-statut actif' : 'bouton-statut'}
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
      <div className="grille2">
        <label>
          Dernier pylône survolé
          <select
            value={s.avancement ?? ''}
            onChange={(e) =>
              majSuivi(ligne.id, {
                avancement: e.target.value ? Number(e.target.value) : undefined,
                statut: s.statut === 'a_faire' ? 'en_cours' : s.statut,
                dateDebut: s.dateDebut ?? aujourdhui(),
              })
            }
          >
            <option value="">—</option>
            {ligne.pylones
              .filter((p) => p.i >= a.debut && p.i <= a.fin)
              .map((p) => (
                <option key={p.i} value={p.i}>
                  {p.num} — PK {p.d.toFixed(1).replace('.', ',')}
                </option>
              ))}
          </select>
        </label>
        <div className="grille2 serree">
          <label>
            Date de début
            <input
              type="date"
              value={s.dateDebut ?? ''}
              onChange={(e) => majSuivi(ligne.id, { dateDebut: e.target.value })}
            />
          </label>
          <label>
            Date de fin
            <input
              type="date"
              value={s.dateFin ?? ''}
              onChange={(e) => majSuivi(ligne.id, { dateFin: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div className="bloc-titre">Note</div>
      <textarea
        className="champ"
        rows={2}
        placeholder="Contraintes, zones sensibles, consignes de survol…"
        value={s.note ?? ''}
        onChange={(e) => majSuivi(ligne.id, { note: e.target.value })}
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
        <button onClick={() => setNouvelleObs({ i: s.avancement ?? a.debut, gravite: 1, texte: '' })}>
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
          const fait = s.statut === 'fait' || (s.avancement != null && p.i <= s.avancement && !hors);
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
