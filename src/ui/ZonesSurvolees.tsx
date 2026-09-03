import { useState } from 'react';
import type { Ligne, NatureVisite } from '../types';
import { kmPortion, lacunes, portionsFaites, useStore } from '../state/store';
import { aujourdhui, dateCourte, km } from '../lib/geo';

/**
 * Saisie de l'avancement d'une ligne sous forme de zones survolées.
 *
 * Une ligne est rarement faite d'un seul tenant : on peut l'avoir parcourue
 * entièrement sauf une portion au milieu. Chaque zone porte donc ses propres
 * bornes et sa date, et le complément affiché dit ce qui reste.
 */
export default function ZonesSurvolees({
  ligne,
  nature,
}: {
  ligne: Ligne;
  nature: NatureVisite;
}) {
  const { suivi, ajouterZone, majZone, supprimerZone } = useStore();
  const s = suivi(ligne.id);
  const v = s.visites[nature];
  const faites = portionsFaites(ligne, s, nature);
  const restantes = lacunes(ligne, s, nature);
  const terminee = v.statut === 'fait';

  const [nouvelle, setNouvelle] = useState<{ debut: number; fin: number; date: string } | null>(
    null,
  );

  const num = (rang: number) => ligne.pylones.find((p) => p.i === rang)?.num ?? String(rang);
  const options = ligne.pylones.map((p) => (
    <option key={p.i} value={p.i}>
      {p.num}
      {p.numReel ? '' : ' (rang)'} — PK {p.d.toFixed(1).replace('.', ',')}
    </option>
  ));

  return (
    <>
      <div className="bloc-titre">
        Zones survolées
        {!terminee && <span className="compteur">{v.zones.length}</span>}
      </div>

      {terminee ? (
        <p className="aide">
          Ligne validée à 100 % : tout le périmètre est considéré comme survolé. Repassez le
          statut en « En cours » pour saisir des zones précises.
        </p>
      ) : (
        <>
          {v.zones.length === 0 && !nouvelle && (
            <p className="aide">
              Aucune zone saisie. Ajoutez la portion réellement survolée, ou cliquez deux
              pylônes sur la carte.
            </p>
          )}

          <ul className="zones">
            {v.zones.map((z) => (
              <li key={z.id}>
                <div className="zone-bornes">
                  <select
                    value={z.debut}
                    onChange={(e) =>
                      majZone(ligne.id, nature, z.id, { debut: Number(e.target.value) })
                    }
                  >
                    {options}
                  </select>
                  <span className="fleche-zone">→</span>
                  <select
                    value={z.fin}
                    onChange={(e) =>
                      majZone(ligne.id, nature, z.id, { fin: Number(e.target.value) })
                    }
                  >
                    {options}
                  </select>
                  <input
                    type="date"
                    className="zone-date"
                    value={z.date ?? ''}
                    onChange={(e) => majZone(ligne.id, nature, z.id, { date: e.target.value })}
                  />
                  <button
                    className="supprimer"
                    title="Retirer cette zone"
                    onClick={() => supprimerZone(ligne.id, nature, z.id)}
                  >
                    ×
                  </button>
                </div>
                <div className="zone-mesure">
                  {km(kmPortion(ligne, z))}
                  {z.date && <> · survolée le {dateCourte(z.date)}</>}
                </div>
              </li>
            ))}
          </ul>

          {nouvelle ? (
            <div className="bloc">
              <div className="zone-bornes">
                <select
                  value={nouvelle.debut}
                  onChange={(e) => setNouvelle({ ...nouvelle, debut: Number(e.target.value) })}
                >
                  {options}
                </select>
                <span className="fleche-zone">→</span>
                <select
                  value={nouvelle.fin}
                  onChange={(e) => setNouvelle({ ...nouvelle, fin: Number(e.target.value) })}
                >
                  {options}
                </select>
                <input
                  type="date"
                  className="zone-date"
                  value={nouvelle.date}
                  onChange={(e) => setNouvelle({ ...nouvelle, date: e.target.value })}
                />
              </div>
              <div className="ligne-boutons">
                <button
                  className="principal"
                  disabled={nouvelle.debut === nouvelle.fin}
                  onClick={() => {
                    ajouterZone(ligne.id, nature, nouvelle);
                    setNouvelle(null);
                  }}
                >
                  Ajouter la zone
                </button>
                <button onClick={() => setNouvelle(null)}>Annuler</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() =>
                setNouvelle({
                  debut: restantes[0]?.debut ?? 1,
                  fin: restantes[0]?.fin ?? ligne.pylones.length,
                  date: aujourdhui(),
                })
              }
            >
              + Ajouter une zone survolée
            </button>
          )}
        </>
      )}

      {!terminee && faites.length > 0 && (
        <>
          <div className="bloc-titre">
            Reste à survoler
            {restantes.length > 0 && <span className="compteur en-cours">{restantes.length}</span>}
          </div>
          {restantes.length === 0 ? (
            <p className="aide ok">
              Tout le périmètre est couvert. Vous pouvez passer la ligne en « Terminée ».
            </p>
          ) : (
            <ul className="lacunes">
              {restantes.map((z) => (
                <li key={`${z.debut}-${z.fin}`}>
                  du pylône <b>{num(z.debut)}</b> au pylône <b>{num(z.fin)}</b>
                  <span className="lacune-km">{km(kmPortion(ligne, z))}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
