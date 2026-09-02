import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';

/** Sélection de la campagne de visite, sauvegarde et restauration du suivi. */
export default function CampagneBarre() {
  const {
    campagnes,
    campagneCourante,
    setCampagneCourante,
    creerCampagne,
    supprimerCampagne,
    exporter,
    importer,
  } = useStore();
  const fichier = useRef<HTMLInputElement>(null);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setEnLigne(true);
    const off = () => setEnLigne(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return (
    <div className="barre-campagne">
      <span className={enLigne ? 'etat en-ligne' : 'etat hors-ligne'}>
        {enLigne ? 'En ligne' : 'Hors ligne'}
      </span>

      <select value={campagneCourante} onChange={(e) => setCampagneCourante(e.target.value)}>
        {campagnes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </select>

      <button
        title="Nouvelle campagne"
        onClick={() => {
          const annee = new Date().getFullYear();
          const nom = window.prompt('Nom de la campagne :', `Campagne ${annee}`);
          if (nom) creerCampagne(nom, annee);
        }}
      >
        +
      </button>
      <button
        title="Supprimer la campagne courante"
        disabled={campagnes.length <= 1}
        onClick={() => {
          const c = campagnes.find((x) => x.id === campagneCourante);
          if (c && window.confirm(`Supprimer « ${c.nom} » et tout son suivi ?`))
            supprimerCampagne(c.id);
        }}
      >
        −
      </button>

      <button onClick={exporter} title="Exporter le suivi dans un fichier">
        Exporter
      </button>
      <button onClick={() => fichier.current?.click()} title="Importer un fichier de suivi">
        Importer
      </button>
      <input
        ref={fichier}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            await importer(f);
            setMessage('Suivi importé.');
          } catch (err) {
            setMessage(`Import impossible : ${(err as Error).message}`);
          }
          e.target.value = '';
          setTimeout(() => setMessage(null), 4000);
        }}
      />
      {message && <span className="message">{message}</span>}
    </div>
  );
}
