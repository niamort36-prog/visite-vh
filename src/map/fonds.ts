/**
 * Fonds de carte, définis en un seul endroit : la carte les affiche, le panneau
 * Secteur les pré-télécharge pour l'usage hors connexion.
 */

const IGN = 'https://data.geopf.fr/wmts';

function wmts(couche: string, format = 'image/png'): string {
  return (
    `${IGN}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${couche}` +
    `&STYLE=normal&TILEMATRIXSET=PM&FORMAT=${format}` +
    '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
  );
}

/** Tuiles open flightmaps : `base` est le relief, `aero` la surcharge aéronautique. */
const OFM = 'https://nwy-tiles-api.prod.newaydata.com/tiles/{z}/{x}/{y}';
const OFM_BASE = `${OFM}.jpg?path=latest/base/latest`;
const OFM_AERO = `${OFM}.png?path=latest/aero/latest`;

export const ATTR_IGN = '© <a href="https://www.ign.fr/">IGN</a> — Géoplateforme';
export const ATTR_OSM =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const ATTR_OFM =
  '© <a href="https://www.openflightmaps.org/">open flightmaps</a> — ' +
  'usage non contractuel, ne remplace pas la documentation aéronautique officielle';

export interface Fond {
  cle: string;
  nom: string;
  url: string;
  attribution: string;
  /** dernier zoom réellement servi par la source ; au-delà les tuiles sont étirées */
  zoomNatifMax: number;
  zoomNatifMin?: number;
  /** proposé au pré-téléchargement hors connexion */
  telechargeable?: boolean;
}

export const FOND_IGN_PLAN: Fond = {
  cle: 'plan',
  nom: 'Plan IGN',
  url: wmts('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2'),
  attribution: ATTR_IGN,
  zoomNatifMax: 19,
  telechargeable: true,
};

export const FOND_IGN_ORTHO: Fond = {
  cle: 'ortho',
  nom: 'Photo aérienne',
  url: wmts('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
  attribution: ATTR_IGN,
  zoomNatifMax: 19,
  telechargeable: true,
};

export const FOND_OSM: Fond = {
  cle: 'osm',
  nom: 'OpenStreetMap',
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: ATTR_OSM,
  zoomNatifMax: 19,
};

export const FOND_VFR_BASE: Fond = {
  cle: 'vfr-base',
  nom: 'Fond VFR',
  url: OFM_BASE,
  attribution: ATTR_OFM,
  zoomNatifMin: 7,
  zoomNatifMax: 12,
  telechargeable: true,
};

export const COUCHE_AERO: Fond = {
  cle: 'aero',
  nom: 'Espaces aériens',
  url: OFM_AERO,
  attribution: ATTR_OFM,
  zoomNatifMin: 7,
  zoomNatifMax: 12,
  telechargeable: true,
};

/** Fonds proposés au pré-téléchargement, avec la plage de zoom pertinente. */
export const FONDS_TELECHARGEABLES = [
  { fond: FOND_IGN_PLAN, nom: 'Plan IGN', zMin: 8 },
  { fond: FOND_IGN_ORTHO, nom: 'Photo aérienne', zMin: 8 },
  { fond: FOND_VFR_BASE, nom: 'Carte VFR (OACI)', zMin: 7, avecAero: true },
];

/** Remplace {z}/{x}/{y} dans un gabarit de tuile. */
export function urlTuile(fond: Fond, z: number, x: number, y: number): string {
  return fond.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}
