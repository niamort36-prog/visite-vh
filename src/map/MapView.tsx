import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Ligne, Poste, Pylone } from '../types';
import { calculerAvancement, codeAffiche, nomAffiche, useStore } from '../state/store';
import { couleur, epaisseur } from '../lib/tensions';

import {
  COUCHE_AERO,
  FOND_IGN_ORTHO,
  FOND_IGN_PLAN,
  FOND_OSM,
  FOND_VFR_BASE,
  type Fond,
} from './fonds';

/** Construit une couche de tuiles Leaflet à partir d'une définition de fond. */
function coucheTuiles(f: Fond): L.TileLayer {
  return L.tileLayer(f.url, {
    attribution: f.attribution,
    maxZoom: 19,
    maxNativeZoom: f.zoomNatifMax,
    minNativeZoom: f.zoomNatifMin,
    // au-delà du zoom natif, mieux vaut étirer la tuile que ne rien afficher
    ...(f.zoomNatifMin ? { minZoom: 0 } : {}),
  });
}

/** Seuils d'affichage : au-delà, la carte deviendrait illisible et lente. */
const ZOOM_PYLONES = 12;
const ZOOM_NUMEROS = 15;
const MAX_ETIQUETTES = 400;

export interface CibleCarte {
  ligneId?: string;
  pyloneI?: number;
}

interface Props {
  /** ligne à cadrer, pilotée depuis le tableau */
  cible: CibleCarte | null;
  onPyloneClic: (ligne: Ligne, pylone: Pylone) => void;
}

export default function MapView({ cible, onPyloneClic }: Props) {
  const { lignes, postes, suivi, ligneActive, setLigneActive, depts } = useStore();
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const coucheLignes = useRef<L.LayerGroup | null>(null);
  const couchePylones = useRef<L.LayerGroup | null>(null);
  const couchePostes = useRef<L.LayerGroup | null>(null);
  const marqueurGps = useRef<L.CircleMarker | null>(null);
  const dernierSecteur = useRef<string>('');
  const [zoom, setZoom] = useState(8);
  const [bornes, setBornes] = useState<L.LatLngBounds | null>(null);
  const [gpsActif, setGpsActif] = useState(false);

  /* ---- initialisation ------------------------------------------- */
  useEffect(() => {
    if (!conteneur.current || carte.current) return;

    const plan = coucheTuiles(FOND_IGN_PLAN);
    const ortho = coucheTuiles(FOND_IGN_ORTHO);
    const osm = coucheTuiles(FOND_OSM);
    // La carte VFR combine le relief open flightmaps et sa surcharge aéronautique.
    const vfrFond = coucheTuiles(FOND_VFR_BASE);
    const vfrAero = coucheTuiles(COUCHE_AERO);
    const vfr = L.layerGroup([vfrFond, vfrAero]);
    // Même surcharge, disponible seule pour se superposer au plan ou à la photo.
    const aero = coucheTuiles(COUCHE_AERO);

    const m = L.map(conteneur.current, {
      center: [46.7, 2.4],
      zoom: 6,
      layers: [plan],
      preferCanvas: true,
      zoomControl: true,
    });
    L.control
      .layers(
        {
          'Plan IGN': plan,
          'Photo aérienne': ortho,
          OpenStreetMap: osm,
          'Carte VFR (OACI)': vfr,
        },
        { 'Espaces aériens': aero },
        { position: 'topright' },
      )
      .addTo(m);

    // La carte VFR contient déjà les espaces aériens : on évite le doublon.
    m.on('baselayerchange', (e: L.LayersControlEvent) => {
      if (e.layer === vfr && m.hasLayer(aero)) m.removeLayer(aero);
    });

    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);

    coucheLignes.current = L.layerGroup().addTo(m);
    couchePylones.current = L.layerGroup().addTo(m);
    couchePostes.current = L.layerGroup().addTo(m);

    const maj = () => {
      setZoom(m.getZoom());
      setBornes(m.getBounds());
    };
    m.on('moveend zoomend', maj);
    maj();
    carte.current = m;

    return () => {
      m.remove();
      carte.current = null;
    };
  }, []);

  /* ---- tracé des lignes ------------------------------------------ */
  useEffect(() => {
    const g = coucheLignes.current;
    if (!g) return;
    g.clearLayers();

    for (const l of lignes) {
      const s = suivi(l.id);
      const av = calculerAvancement(l, s);
      const actif = ligneActive === l.id;

      // halo de sélection
      if (actif) {
        L.polyline(l.geom, { color: '#111827', weight: epaisseur(l.tension) + 6, opacity: 0.35 }).addTo(g);
      }

      const trace = L.polyline(l.geom, {
        color: couleur(l.tension),
        weight: epaisseur(l.tension) + (actif ? 1.5 : 0),
        opacity: s.statut === 'hors_perimetre' ? 0.3 : 0.9,
        dashArray: s.statut === 'hors_perimetre' ? '4 6' : undefined,
      });
      trace.on('click', () => setLigneActive(l.id));
      const code = codeAffiche(l, s);
      trace.bindTooltip(
        `<b>${nomAffiche(l, s)}</b><br>${l.tension} kV · ${l.km.toFixed(1).replace('.', ',')} km` +
          (code ? `<br><code>${code}</code>` : ''),
        { sticky: true },
      );
      trace.addTo(g);

      // portion réalisée, superposée en vert
      if (av.kmFaits > 0 && s.statut !== 'hors_perimetre') {
        const iFin = s.statut === 'fait' ? av.fin : Math.min(s.avancement ?? av.debut, av.fin);
        const pts = l.pylones
          .filter((p) => p.i >= av.debut && p.i <= iFin)
          .map((p) => [p.lat, p.lon] as [number, number]);
        if (pts.length > 1) {
          L.polyline(pts, {
            color: '#16a34a',
            weight: epaisseur(l.tension) + 3,
            opacity: 0.85,
          }).addTo(g);
        }
      }
    }
  }, [lignes, suivi, ligneActive, setLigneActive]);

  /* ---- postes ----------------------------------------------------- */
  useEffect(() => {
    const g = couchePostes.current;
    if (!g) return;
    g.clearLayers();
    if (zoom < 8) return;
    for (const p of postes) {
      if (bornes && !bornes.contains([p.lat, p.lon])) continue;
      const m = L.circleMarker([p.lat, p.lon], {
        radius: zoom >= 12 ? 7 : 4,
        color: '#0b2545',
        weight: 2,
        fillColor: p.operateur === 'RTE' ? '#0b2545' : '#7c3aed',
        fillOpacity: 0.9,
      });
      m.bindTooltip(
        `<b>${p.nom || 'Poste'}</b>${p.code ? ` <code>${p.code}</code>` : ''}<br>` +
          `${p.operateur}${p.fonction ? ` · ${p.fonction}` : ''}`,
        { direction: 'top' },
      );
      m.addTo(g);
      if (zoom >= 11 && p.nom) {
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: 'etiquette-poste',
            html: p.nom,
            iconSize: undefined as unknown as L.PointExpression,
          }),
          interactive: false,
        }).addTo(g);
      }
    }
  }, [postes, zoom, bornes]);

  /* ---- pylônes ---------------------------------------------------- */
  const pylonesVisibles = useMemo(() => {
    if (zoom < ZOOM_PYLONES || !bornes) return [];
    const out: { l: Ligne; p: Pylone }[] = [];
    for (const l of lignes) {
      for (const p of l.pylones) {
        if (bornes.contains([p.lat, p.lon])) out.push({ l, p });
      }
    }
    return out;
  }, [lignes, zoom, bornes]);

  useEffect(() => {
    const g = couchePylones.current;
    if (!g) return;
    g.clearLayers();
    const avecNumeros = zoom >= ZOOM_NUMEROS && pylonesVisibles.length <= MAX_ETIQUETTES;

    for (const { l, p } of pylonesVisibles) {
      const s = suivi(l.id);
      const av = calculerAvancement(l, s);
      const frontiere = p.i === s.debut || p.i === s.fin;
      const fait =
        s.statut === 'fait' || (s.avancement != null && p.i >= av.debut && p.i <= s.avancement);
      const hors = p.i < av.debut || p.i > av.fin;

      const m = L.circleMarker([p.lat, p.lon], {
        radius: frontiere ? 7 : zoom >= 14 ? 4.5 : 3,
        color: frontiere ? '#111827' : fait ? '#15803d' : hors ? '#cbd5e1' : '#374151',
        weight: frontiere ? 2.5 : 1,
        fillColor: frontiere ? '#facc15' : fait ? '#22c55e' : hors ? '#e2e8f0' : '#ffffff',
        fillOpacity: 1,
      });
      m.bindTooltip(
        `Pylône <b>${p.num}</b>${p.numReel ? '' : ' <i>(rang calculé)</i>'}<br>` +
          `${nomAffiche(l, s)}<br>PK ${p.d.toFixed(2).replace('.', ',')} km`,
        { direction: 'top' },
      );
      m.on('click', () => {
        setLigneActive(l.id);
        onPyloneClic(l, p);
      });
      m.addTo(g);

      if (avecNumeros) {
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: `etiquette-pylone${p.numReel ? '' : ' calcule'}`,
            html: p.num,
            iconSize: undefined as unknown as L.PointExpression,
          }),
          interactive: false,
        }).addTo(g);
      }
    }
  }, [pylonesVisibles, zoom, suivi, onPyloneClic, setLigneActive]);

  /* ---- cadrage automatique sur le secteur chargé -------------------- */
  useEffect(() => {
    const m = carte.current;
    const cle = depts.join(',');
    if (!m || !lignes.length || cle === dernierSecteur.current) return;
    dernierSecteur.current = cle;
    let s = 90;
    let w = 180;
    let n = -90;
    let e = -180;
    for (const l of lignes)
      for (const [lat, lon] of l.geom) {
        if (lat < s) s = lat;
        if (lat > n) n = lat;
        if (lon < w) w = lon;
        if (lon > e) e = lon;
      }
    if (s <= n && w <= e) {
      m.fitBounds(
        L.latLngBounds([s, w], [n, e]),
        { padding: [30, 30] },
      );
    }
  }, [lignes, depts]);

  /* ---- cadrage piloté depuis le tableau --------------------------- */
  useEffect(() => {
    const m = carte.current;
    if (!m || !cible?.ligneId) return;
    const l = lignes.find((x) => x.id === cible.ligneId);
    if (!l) return;
    if (cible.pyloneI != null) {
      const p = l.pylones.find((x) => x.i === cible.pyloneI);
      if (p) {
        m.setView([p.lat, p.lon], Math.max(m.getZoom(), 16));
        return;
      }
    }
    m.fitBounds(L.latLngBounds(l.geom as L.LatLngExpression[]), { padding: [40, 40] });
  }, [cible, lignes]);

  /* ---- position GPS ----------------------------------------------- */
  useEffect(() => {
    if (!gpsActif || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const m = carte.current;
        if (!m) return;
        const ll: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
        if (!marqueurGps.current) {
          marqueurGps.current = L.circleMarker(ll, {
            radius: 8,
            color: '#ffffff',
            weight: 3,
            fillColor: '#2563eb',
            fillOpacity: 1,
          }).addTo(m);
          m.setView(ll, Math.max(m.getZoom(), 14));
        } else {
          marqueurGps.current.setLatLng(ll);
        }
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 2000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      if (marqueurGps.current && carte.current) carte.current.removeLayer(marqueurGps.current);
      marqueurGps.current = null;
    };
  }, [gpsActif]);

  return (
    <div className="carte-hote">
      <div ref={conteneur} className="carte" />
      <div className="carte-outils">
        <button
          className={gpsActif ? 'actif' : ''}
          onClick={() => setGpsActif((v) => !v)}
          title="Suivre ma position"
        >
          ⌖
        </button>
      </div>
      {zoom < ZOOM_PYLONES && lignes.length > 0 && (
        <div className="carte-info">Zoomez pour afficher les pylônes</div>
      )}
    </div>
  );
}
