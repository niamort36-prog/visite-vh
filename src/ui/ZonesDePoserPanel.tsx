import { useMemo, useState } from 'react';
import { useStore } from '../state/store';

interface Props {
  /** active le placement sur la carte : le prochain clic donnera la position */
  onPlacer: (nom: string, gmr: string) => void;
  enPlacement: boolean;
  onAnnuler: () => void;
}

/**
 * Zones de poser, rattachées à un GMR : l'endroit d'où part l'hélicoptère le
 * matin et où il se pose en fin de journée. Elles servent de point de départ et
 * d'arrivée au calcul des trajets de liaison d'une préparation.
 */
export default function ZonesDePoserPanel({ onPlacer, enPlacement, onAnnuler }: Props) {
  const { zonesDePoser, majZoneDePoser, supprimerZoneDePoser, secteur, zonesDisponibles } =
    useStore();
  const [nom, setNom] = useState('');
  const [gmr, setGmr] = useState('');

  /** GMR proposés : ceux du secteur, sinon tous ceux du référentiel. */
  const gmrProposes = useMemo(() => {
    if (secteur.gmr.length) return secteur.gmr;
    const tous = [...new Set(Object.values(zonesDisponibles.gmrParCm).flat())].sort();
    return tous;
  }, [secteur.gmr, zonesDisponibles]);

  const gmrRetenu = gmr || secteur.gmr[0] || gmrProposes[0] || '';

  const groupees = useMemo(() => {
    const m = new Map<string, typeof zonesDePoser>();
    for (const z of zonesDePoser) {
      const l = m.get(z.gmr);
      if (l) l.push(z);
      else m.set(z.gmr, [z]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [zonesDePoser]);

  return (
    <div className="bloc">
      <div className="bloc-titre">
        Zones de poser
        {zonesDePoser.length > 0 && <span className="compteur">{zonesDePoser.length}</span>}
      </div>

      {zonesDePoser.length === 0 && (
        <p className="aide">
          Aucune zone de poser. Créez-en une par GMR : elle sert de point de départ et de
          retour au calcul des trajets de liaison dans les préparations de vol.
        </p>
      )}

      {groupees.map(([g, liste]) => (
        <div key={g} className="dz-groupe">
          <div className="dz-gmr">{g || 'sans GMR'}</div>
          <ul className="dz-liste">
            {liste.map((z) => (
              <li key={z.id}>
                <input
                  className="cellule"
                  value={z.nom}
                  onChange={(e) => majZoneDePoser(z.id, { nom: e.target.value })}
                />
                <span className="dz-coord">
                  {z.lat.toFixed(4)}, {z.lon.toFixed(4)}
                </span>
                <button
                  className="supprimer"
                  title="Supprimer cette zone de poser"
                  onClick={() => supprimerZoneDePoser(z.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {enPlacement ? (
        <div className="ligne-boutons">
          <span className="aide">Cliquez la position sur la carte…</span>
          <button onClick={onAnnuler}>Annuler</button>
        </div>
      ) : (
        <>
          <div className="grille2 serree">
            <input
              className="champ"
              placeholder="Nom de la zone (terrain, hélisurface…)"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
            <select value={gmrRetenu} onChange={(e) => setGmr(e.target.value)}>
              {gmrProposes.length === 0 && <option value="">—</option>}
              {gmrProposes.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <button
            disabled={!nom.trim()}
            onClick={() => {
              onPlacer(nom.trim(), gmrRetenu);
              setNom('');
            }}
          >
            Placer sur la carte
          </button>
        </>
      )}
    </div>
  );
}
