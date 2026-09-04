import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import { ErreurImport, lireReferentiel, resumeReferentiel } from '../data/rte';
import { dateCourte } from '../lib/geo';

/**
 * Import du référentiel RTE (liaisons, CM / GMR / EEL, pylônes géolocalisés).
 *
 * Le fichier n'est pas publié avec l'application : il est lu dans le navigateur,
 * conservé localement et repris dans l'export du suivi.
 */
export default function ReferentielPanel() {
  const { referentiel, setReferentiel, bilanRte, depts } = useStore();
  const fichier = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const resume = referentiel ? resumeReferentiel(referentiel) : null;

  return (
    <div className="bloc">
      <div className="bloc-titre">Référentiel RTE</div>

      {!referentiel && (
        <p className="aide">
          Chargez l'export des pylônes (colonnes <b>CM</b>, <b>GMR</b>, <b>Code Liaison</b>,{' '}
          <b>Numéro Pylône</b>, <b>Coord GPS</b>) au format .xlsx ou .csv. Les ouvrages prennent
          alors leur nom et leur code officiels, leur rattachement GMR, et les pylônes retrouvés
          leur numéro réel. <b>Le fichier reste dans ce navigateur</b> et n'est jamais publié.
        </p>
      )}

      {referentiel && resume && (
        <>
          <div className="stats">
            <div>
              <b>{resume.liaisons.toLocaleString('fr-FR')}</b> ouvrages
            </div>
            <div>
              <b>{resume.ancres.toLocaleString('fr-FR')}</b> pylônes de référence
            </div>
            <div>
              <b>{resume.cm.length}</b> centres de maintenance
            </div>
            <div>
              <b>{resume.gmr.length}</b> GMR
            </div>
          </div>
          <div className="sous-titre">
            {referentiel.source} — importé le {dateCourte(referentiel.importeLe)}
          </div>

          {!referentiel.zones && (
            <p className="avis">
              Cet import ne retient qu&apos;une équipe par ouvrage. Réimportez le fichier
              pour que la frontière soit placée au pylône où change l&apos;équipe.
            </p>
          )}

          {bilanRte ? (
            <p className="aide">
              Sur le secteur chargé : <b>{bilanRte.lignes}</b> tracés rattachés,{' '}
              <b>{bilanRte.numerosOfficiels}</b> numéros de pylône vérifiés
              {bilanRte.numerosInterpoles > 0 && (
                <> et {bilanRte.numerosInterpoles} déduits entre deux pylônes vérifiés</>
              )}
              .{' '}
              {bilanRte.lignesFrontieres > 0 && (
                <>
                  <b>{bilanRte.lignesFrontieres}</b> tracés franchissent une frontière
                  d&apos;équipe et sont découpés en sections.{' '}
                </>
              )}
              GMR concernés : {bilanRte.gmr.join(', ') || '—'}.
            </p>
          ) : (
            <p className="aide">
              {depts.length
                ? "Aucun tracé du secteur chargé ne correspond au référentiel."
                : 'Sélectionnez un département pour voir le rattachement.'}
            </p>
          )}
        </>
      )}

      {erreur && <p className="aide alerte">{erreur}</p>}

      <div className="ligne-boutons">
        <button disabled={enCours} onClick={() => fichier.current?.click()}>
          {enCours ? 'Lecture…' : referentiel ? 'Remplacer le fichier' : 'Importer le fichier'}
        </button>
        {referentiel && (
          <button
            onClick={() => {
              if (window.confirm('Retirer le référentiel RTE de ce navigateur ?')) {
                setReferentiel(null);
                setErreur(null);
              }
            }}
          >
            Retirer
          </button>
        )}
      </div>

      <input
        ref={fichier}
        type="file"
        accept=".xlsx,.xlsm,.csv,.txt"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setEnCours(true);
          setErreur(null);
          try {
            setReferentiel(await lireReferentiel(f));
          } catch (err) {
            setErreur(
              err instanceof ErreurImport
                ? err.message
                : `Lecture impossible : ${(err as Error).message}`,
            );
          } finally {
            setEnCours(false);
          }
        }}
      />
    </div>
  );
}
