import { useMemo } from 'react';
import { useStore } from './store';
import { genererTaches, type Tache } from '../lib/taches';

/**
 * Échéances de la campagne courante. Elles sont dérivées du secteur chargé et
 * des préparations : ce calcul est partagé par l'en-tête, la fenêtre des
 * échéances et le détail d'une préparation, pour qu'ils ne divergent jamais.
 */
export function useTaches(): Tache[] {
  const { campagnes, campagneCourante, index, depts, preparations, lignes, secteur } =
    useStore();
  return useMemo(() => {
    const campagne = campagnes.find((c) => c.id === campagneCourante);
    if (!campagne) return [];
    const entrees = (index?.departements ?? []).filter((d) => depts.includes(d.code));
    return genererTaches(campagne, entrees, preparations, lignes, secteur);
  }, [campagnes, campagneCourante, index, depts, preparations, lignes, secteur]);
}
