import { useEffect, useMemo, useState } from 'react';
import type { Ligne, SuiviLigne } from '../types';
import { chargerCatalogue, type OuvrageRte } from '../data/reseau';
import { useStore } from '../state/store';

/**
 * OpenStreetMap ne nomme pas toujours les postes : certaines lignes reconstituées
 * arrivent donc sans identité. Ce bloc permet de leur donner un libellé d'usage et
 * de les rattacher à un ouvrage du catalogue officiel RTE.
 */
export default function RattacherOuvrage({ ligne, s }: { ligne: Ligne; s: SuiviLigne }) {
  const { majSuivi } = useStore();
  const [catalogue, setCatalogue] = useState<OuvrageRte[] | null>(null);
  // Quand une seule extrémité est connue, elle sert d'amorce à la recherche.
  const [recherche, setRecherche] = useState(
    () => ligne.extremites.find((e) => e) ?? '',
  );
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert || catalogue) return;
    chargerCatalogue()
      .then(setCatalogue)
      .catch((e) => setErreur(String(e.message)));
  }, [ouvert, catalogue]);

  const resultats = useMemo(() => {
    if (!catalogue) return [];
    const r = recherche.trim().toLowerCase();
    const base = catalogue.filter((o) => o.t === ligne.tension);
    if (!r) return base.slice(0, 40);
    return base.filter((o) => o.n.toLowerCase().includes(r) || o.c.toLowerCase().includes(r)).slice(0, 60);
  }, [catalogue, recherche, ligne.tension]);

  const codeRetenu = s.codeRtePerso || ligne.codeRte;

  return (
    <>
      <div className="bloc-titre">Identification de l'ouvrage</div>

      <label>
        Libellé
        <input
          className="champ"
          placeholder={ligne.nom}
          value={s.nomPerso ?? ''}
          onChange={(e) => majSuivi(ligne.id, { nomPerso: e.target.value })}
        />
      </label>

      {codeRetenu ? (
        <div className="rattachement">
          <div>
            Ouvrage RTE <code>{codeRetenu}</code>
            {(s.nomRtePerso || ligne.nomRte) && (
              <div className="sous-titre">{s.nomRtePerso || ligne.nomRte}</div>
            )}
            {s.codeRtePerso && <span className="tag">rattaché à la main</span>}
          </div>
          {s.codeRtePerso && (
            <button
              className="lien"
              onClick={() => majSuivi(ligne.id, { codeRtePerso: undefined, nomRtePerso: undefined })}
            >
              détacher
            </button>
          )}
        </div>
      ) : (
        <p className="aide">Aucun ouvrage RTE rattaché.</p>
      )}

      {!ouvert ? (
        <button onClick={() => setOuvert(true)}>
          {codeRetenu ? "Changer l'ouvrage rattaché" : 'Rattacher un ouvrage RTE'}
        </button>
      ) : (
        <div className="bloc">
          <input
            className="champ"
            autoFocus
            placeholder={`Rechercher parmi les ouvrages ${ligne.tension} kV…`}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          {erreur && <p className="aide alerte">{erreur}</p>}
          {!catalogue && !erreur && <p className="aide">Chargement du catalogue…</p>}
          <div className="liste-ouvrages">
            {resultats.map((o) => (
              <button
                key={o.c}
                className="ouvrage"
                onClick={() => {
                  majSuivi(ligne.id, {
                    codeRtePerso: o.c,
                    nomRtePerso: o.n,
                    nomPerso: s.nomPerso?.trim() ? s.nomPerso : o.n,
                  });
                  setOuvert(false);
                  setRecherche('');
                }}
              >
                <code>{o.c}</code>
                <span>{o.n}</span>
              </button>
            ))}
            {catalogue && resultats.length === 0 && (
              <span className="aide">Aucun ouvrage {ligne.tension} kV ne correspond.</span>
            )}
          </div>
          <button onClick={() => setOuvert(false)}>Fermer</button>
        </div>
      )}
    </>
  );
}
