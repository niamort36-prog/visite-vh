import { useMemo, useState } from 'react';
import type { TypeVol } from '../types';
import { useStore } from '../state/store';
import { dureeMinutes, libelleDuree, nomTypeVol, TYPES_VOL } from '../lib/vols';
import { libelleSemaine, nbSemaines, semaineDe } from '../lib/semaines';
import { km as fmtKm } from '../lib/geo';

/** Liste des préparations de la campagne courante, et création d'une nouvelle. */
export default function PrepasPanel({ onOuvrir }: { onOuvrir: (id: string) => void }) {
  const { preparations, creerPreparation, campagnes, campagneCourante } = useStore();
  const courante = semaineDe(new Date());
  const [annee, setAnnee] = useState(courante.annee);
  const [semaine, setSemaine] = useState(courante.semaine);
  const [typeVol, setTypeVol] = useState<TypeVol>('VH_MONO');

  const semaines = useMemo(
    () => Array.from({ length: nbSemaines(annee) }, (_, i) => i + 1),
    [annee],
  );

  const triees = useMemo(
    () =>
      [...preparations].sort(
        (a, b) => a.annee - b.annee || a.semaine - b.semaine || a.typeVol.localeCompare(b.typeVol),
      ),
    [preparations],
  );

  /** Volume planifié d'une préparation, pour l'afficher dans la liste. */
  function bilan(p: (typeof preparations)[number]) {
    let km = 0;
    let min = 0;
    let n = 0;
    for (const c of Object.values(p.creneaux))
      for (const v of [...c.matin, ...c.apresMidi]) {
        km += v.km;
        min += v.dureeMin ?? dureeMinutes(v.km, p.vitesse);
        n++;
      }
    return { km, min, n };
  }

  const nomCampagne = campagnes.find((c) => c.id === campagneCourante)?.nom ?? '';

  return (
    <div className="panneau">
      <p className="aide">
        Préparations de vol de la campagne <b>{nomCampagne}</b>. Chaque préparation couvre une
        semaine et un type de vol.
      </p>

      <div className="bloc">
        <div className="bloc-titre">Nouvelle préparation</div>
        <div className="grille3">
          <label>
            Année
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
              {[courante.annee - 1, courante.annee, courante.annee + 1].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label>
            Semaine
            <select value={semaine} onChange={(e) => setSemaine(Number(e.target.value))}>
              {semaines.map((n) => (
                <option key={n} value={n}>
                  S{String(n).padStart(2, '0')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type de vol
            <select value={typeVol} onChange={(e) => setTypeVol(e.target.value as TypeVol)}>
              {TYPES_VOL.map((t) => (
                <option key={t.cle} value={t.cle}>
                  {t.nom}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="sous-titre">{libelleSemaine(annee, semaine)}</div>
        <button className="principal" onClick={() => onOuvrir(creerPreparation(annee, semaine, typeVol))}>
          Créer la préparation
        </button>
      </div>

      <div className="bloc-titre">
        Préparations <span className="compteur">{triees.length}</span>
      </div>

      {triees.length === 0 && (
        <p className="aide">Aucune préparation pour cette campagne.</p>
      )}

      <div className="liste-prepas">
        {triees.map((p) => {
          const b = bilan(p);
          return (
            <button key={p.id} className="carte-prepa" onClick={() => onOuvrir(p.id)}>
              <div className="carte-prepa-titre">
                <b>S{String(p.semaine).padStart(2, '0')}</b>
                <span className="type-vol">{nomTypeVol(p.typeVol)}</span>
              </div>
              <div className="sous-titre">{libelleSemaine(p.annee, p.semaine)}</div>
              <div className="carte-prepa-bilan">
                {p.jours.length > 0 && (
                  <span>
                    {p.jours.length} jour{p.jours.length > 1 ? 's' : ''}
                  </span>
                )}
                {b.n > 0 && (
                  <>
                    <span>
                      {b.n} ouvrage{b.n > 1 ? 's' : ''}
                    </span>
                    <span>{fmtKm(b.km)}</span>
                    <span>{libelleDuree(b.min)}</span>
                  </>
                )}
                {p.validee && <span className="immat validee">validée</span>}
                {p.immatriculation && <span className="immat">{p.immatriculation}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
