import type { SiteSeveso } from '../types';
import { useStore } from '../state/store';

/**
 * Sites Seveso à proximité d'un ouvrage.
 *
 * Géorisques publie l'identité, l'adresse et le seuil des établissements, mais
 * ni téléphone ni courriel : ces champs n'existent pas dans l'open data. Ils sont
 * donc saisissables ici, enregistrés avec le suivi et repris dans l'export.
 */
export function SevesoBadge({
  sites,
  ouvert,
  onToggle,
}: {
  sites: SiteSeveso[];
  ouvert: boolean;
  onToggle: () => void;
}) {
  if (!sites.length) return <span className="aide">—</span>;
  const seuilHaut = sites.some((s) => s.t === 'haut');
  return (
    <button
      className={`puce-seveso${seuilHaut ? ' haut' : ''}${ouvert ? ' actif' : ''}`}
      onClick={onToggle}
      title={sites.map((s) => `${s.n} — seuil ${s.t} — ${s.d} km`).join('\n')}
    >
      ⬤ {sites.length === 1 ? sites[0].n : `${sites.length} sites`}
    </button>
  );
}

/** Détail dépliable, rendu sur une rangée à part pour rester lisible. */
export function SevesoDetail({ sites }: { sites: SiteSeveso[] }) {
  const { contactsSeveso, majContactSeveso } = useStore();
  return (
    <div className="seveso-detail">
      {sites.map((s) => {
        const contact = contactsSeveso[s.id] ?? {};
        return (
          <div key={s.id} className="seveso-site">
            <div className="seveso-titre">
              <b>{s.n}</b>
              <span className={s.t === 'haut' ? 'seuil haut' : 'seuil bas'}>seuil {s.t}</span>
              <span className="seveso-distance">{s.d} km du tracé</span>
            </div>
            <div className="sous-titre">
              {[s.a, s.c].filter(Boolean).join(', ')}
              {s.act ? ` · ${s.act}` : ''}
              {s.s ? ` · ${s.s}` : ''}
            </div>
            <div className="grille3">
              <label>
                Téléphone
                <input
                  className="champ"
                  placeholder="à renseigner"
                  value={contact.telephone ?? ''}
                  onChange={(e) => majContactSeveso(s.id, { telephone: e.target.value })}
                />
              </label>
              <label>
                Courriel
                <input
                  className="champ"
                  placeholder="à renseigner"
                  value={contact.courriel ?? ''}
                  onChange={(e) => majContactSeveso(s.id, { courriel: e.target.value })}
                />
              </label>
              <label>
                Note
                <input
                  className="champ"
                  placeholder="interlocuteur, consigne de survol…"
                  value={contact.note ?? ''}
                  onChange={(e) => majContactSeveso(s.id, { note: e.target.value })}
                />
              </label>
            </div>
          </div>
        );
      })}
      <p className="aide">
        Téléphone et courriel ne figurent pas dans l'open data Géorisques : saisissez-les une
        fois, ils sont conservés et repris dans l'export.
      </p>
    </div>
  );
}
