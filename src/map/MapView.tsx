import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Ligne, Poste, Pylone } from '../types';
import {
  calculerAvancement,
  codeAffiche,
  kmSection,
  portionsFaites,
  nomAffiche,
  sectionDansSecteur,
  useStore,
} from '../state/store';
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
  /** quand il est fourni, un clic sur la carte renvoie la position pointée */
  onPositionClic?: (lat: number, lon: number) => void;
  onPyloneClic: (ligne: Ligne, pylone: Pylone) => void;
  /** quand il est fourni, un clic sur une ligne l'ajoute à la préparation en cours */
  onLigneSelection?: (ligne: Ligne) => void;
  /** ouvrages déjà inscrits au planning de la préparation ouverte */
  lignesPrepa?: Set<string>;
}

/** Numéro officiel d'un pylône par son rang, ou le rang à défaut. */
function numPylone(l: Ligne, rang: number): string {
  return l.pylones.find((p) => p.i === rang)?.num ?? String(rang);
}

export default function MapView({
  cible,
  onPyloneClic,
  onLigneSelection,
  lignesPrepa,
  onPositionClic,
}: Props) {
  const {
    lignesAffichees: lignes,
    postes,
    suivi,
    ligneActive,
    setLigneActive,
    depts,
    rattachement,
    secteur,
    filtres,
    zonesDePoser,
    pointsCarburant,
  } = useStore();
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<L.Map | null>(null);
  const coucheLignes = useRef<L.LayerGroup | null>(null);
  const couchePylones = useRef<L.LayerGroup | null>(null);
  const couchePostes = useRef<L.LayerGroup | null>(null);
  const couchePrepa = useRef<L.LayerGroup | null>(null);
  // gardé dans une référence : le tracé ne doit pas être redessiné à chaque
  // changement de créneau de destination
  const selectionCourante = useRef(onLigneSelection);
  selectionCourante.current = onLigneSelection;
  const positionCourante = useRef(onPositionClic);
  positionCourante.current = onPositionClic;
  const coucheDz = useRef<L.LayerGroup | null>(null);
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
    couchePrepa.current = L.layerGroup().addTo(m);
    coucheDz.current = L.layerGroup().addTo(m);

    // placement d'une zone de poser : le prochain clic sur le fond donne la position
    m.on('click', (e: L.LeafletMouseEvent) => {
      positionCourante.current?.(e.latlng.lat, e.latlng.lng);
    });
    couchePylones.current = L.layerGroup().addTo(m);
    couchePostes.current = L.layerGroup().addTo(m);

    const maj = () => {
      setZoom(m.getZoom());
      setBornes(m.getBounds());
    };
    m.on('moveend zoomend', maj);
    maj();
    carte.current = m;

    // le panneau latéral est redimensionnable : la carte doit suivre
    const observateur = new ResizeObserver(() => m.invalidateSize());
    observateur.observe(conteneur.current);

    return () => {
      observateur.disconnect();
      m.remove();
      carte.current = null;
    };
  }, []);

  /* ---- tracé des lignes ------------------------------------------ */
  /**
   * Chaque nature de visite se lit différemment sur la carte :
   *  - VH : la portion survolée passe en vert clair translucide, si bien que
   *    seule la portion restant à faire garde la couleur de tension ;
   *  - VTIR : la portion survolée est doublée — un trait épais coloré surmonté
   *    d'un trait clair, ce qui donne deux lignes parallèles ;
   *  - LiDAR : rien n'est tracé, l'avancement se lit dans la liste des lignes.
   */
  useEffect(() => {
    const g = coucheLignes.current;
    if (!g) return;
    g.clearLayers();

    for (const l of lignes) {
      const s = suivi(l.id);
      const vh = s.visites.VH;
      const actif = ligneActive === l.id;

      if (actif) {
        L.polyline(l.geom, {
          color: '#111827',
          weight: epaisseur(l.tension) + 6,
          opacity: 0.35,
        }).addTo(g);
      }

      /** Points du tracé entre deux rangs de pylônes. */
      const points = (p: { debut: number; fin: number }) =>
        l.pylones
          .filter((x) => x.i >= p.debut && x.i <= p.fin)
          .map((x) => [x.lat, x.lon] as [number, number]);
      const zonesVh = portionsFaites(l, s, 'VH').map(points).filter((p) => p.length > 1);
      const zonesVtir = portionsFaites(l, s, 'VTIR').map(points).filter((p) => p.length > 1);
      const horsPerimetre = vh.statut === 'hors_perimetre';

      // 1. VTIR : trait large posé sous la ligne, dont les bords resteront visibles
      for (const pts of horsPerimetre ? [] : zonesVtir) {
        L.polyline(pts, {
          color: couleur(l.tension),
          weight: epaisseur(l.tension) + 6,
          opacity: 0.95,
        }).addTo(g);
      }

      // 2. la ligne elle-même
      const trace = L.polyline(l.geom, {
        color: couleur(l.tension),
        weight: epaisseur(l.tension) + (actif ? 1.5 : 0),
        opacity: horsPerimetre ? 0.3 : 0.9,
        dashArray: horsPerimetre ? '4 6' : undefined,
      });
      trace.on('click', () => {
        setLigneActive(l.id);
        selectionCourante.current?.(l);
      });
      const rat = rattachement(l.id);
      const code = codeAffiche(l, s, rat);
      const partage = (rat?.sections.length ?? 0) > 1;
      trace.bindTooltip(
        `<b>${nomAffiche(l, s, rat)}</b><br>${l.tension} kV · ` +
          `${l.km.toFixed(1).replace('.', ',')} km` +
          (code ? `<br><code>${code}</code>` : '') +
          (partage
            ? '<br>' +
              rat!.sections
                .map(
                  (sec) =>
                    `${sectionDansSecteur(sec, secteur) ? '▸' : '·'} ${sec.eel || sec.gmr} : ` +
                    `${numPylone(l, sec.du)} → ${numPylone(l, sec.au)} ` +
                    `(${kmSection(l, sec).toFixed(1).replace('.', ',')} km)`,
                )
                .join('<br>')
            : rat?.gmr
              ? `<br>GMR ${rat.gmr}`
              : ''),
        { sticky: true },
      );
      trace.addTo(g);

      /*
       * Hors périmètre : section de l'équipe voisine, et extrémités que le
       * référentiel ne décrit pas. On les estompe plutôt que de les masquer —
       * savoir que la ligne continue aide à se repérer en vol — et un repère
       * marque le pylône frontière, là où la visite s'arrête.
       */
      const estomper = (debut: number, fin: number) => {
        const pts = points({ debut, fin });
        if (pts.length < 2) return;
        L.polyline(pts, {
          color: '#ffffff',
          weight: epaisseur(l.tension) + 1,
          opacity: 0.7,
        }).addTo(g);
        L.polyline(pts, {
          color: couleur(l.tension),
          weight: epaisseur(l.tension),
          opacity: 0.45,
          dashArray: '3 5',
        }).addTo(g);
      };
      const rangs = l.pylones.map((x) => x.i);
      const premier = rangs[0] ?? 1;
      const dernier = rangs[rangs.length - 1] ?? 1;
      const av = calculerAvancement(l, s);
      if (av.debut > premier) estomper(premier, av.debut);
      if (av.fin < dernier) estomper(av.fin, dernier);
      if (partage)
        for (const sec of rat!.sections)
          if (!sectionDansSecteur(sec, secteur)) estomper(sec.du, sec.au);

      for (const borne of [av.debut, av.fin]) {
        if (borne === premier && av.fin === dernier) continue;
        const py = l.pylones.find((x) => x.i === borne);
        if (!py) continue;
        const voisine = rat?.sections.find(
          (sec) => !sectionDansSecteur(sec, secteur) && Math.abs(sec.du - borne) <= 1,
        );
        L.circleMarker([py.lat, py.lon], {
          radius: 5,
          color: '#b45309',
          weight: 2,
          fillColor: '#fde68a',
          fillOpacity: 1,
        })
          .bindTooltip(
            `<b>Pylône frontière</b><br>pylône ${py.num}` +
              (voisine ? `<br>au-delà : ${voisine.eel || voisine.gmr}` : ''),
            { direction: 'top' },
          )
          .addTo(g);
      }

      if (horsPerimetre) continue;

      // 3. cœur clair : évidé, le trait large du VTIR se lit comme deux lignes
      for (const pts of zonesVtir) {
        L.polyline(pts, {
          color: '#ffffff',
          weight: epaisseur(l.tension) + 1.5,
          opacity: 1,
        }).addTo(g);
      }

      // 4. VH : chaque zone survolée s'efface en vert clair, moins large que le
      //    trait VTIR pour que les deux informations cohabitent
      for (const pts of zonesVh) {
        L.polyline(pts, {
          color: '#86efac',
          weight: epaisseur(l.tension) + 2.5,
          opacity: 0.8,
          lineCap: 'round',
        }).addTo(g);
      }
    }
  }, [lignes, suivi, ligneActive, setLigneActive, rattachement, secteur]);

  /* ---- ouvrages inscrits à la préparation ouverte ------------------- */
  useEffect(() => {
    const g = couchePrepa.current;
    if (!g) return;
    g.clearLayers();
    if (!lignesPrepa?.size) return;
    for (const l of lignes) {
      if (!lignesPrepa.has(l.id)) continue;
      L.polyline(l.geom, {
        color: '#7c3aed',
        weight: epaisseur(l.tension) + 8,
        opacity: 0.35,
        lineCap: 'round',
      }).addTo(g);
    }
  }, [lignes, lignesPrepa]);

  /* ---- zones de poser ---------------------------------------------- */
  useEffect(() => {
    const g = coucheDz.current;
    if (!g) return;
    g.clearLayers();
    for (const z of zonesDePoser) {
      L.marker([z.lat, z.lon], {
        icon: L.divIcon({
          className: 'marqueur-dz',
          html: `<span>H</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      })
        .bindTooltip(`<b>${z.nom}</b><br>Zone de poser · ${z.gmr}`, { direction: 'top' })
        .addTo(g);
    }
    for (const c of pointsCarburant) {
      const produits = [c.jetA1 ? 'Jet A-1' : '', c.avgas ? '100LL' : ''].filter(Boolean);
      L.marker([c.lat, c.lon], {
        icon: L.divIcon({
          className: 'marqueur-carburant',
          html: `<span>⛽</span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      })
        .bindTooltip(
          `<b>${c.nom}</b>${c.oaci ? ` <code>${c.oaci}</code>` : ''}<br>` +
            `${produits.join(' · ') || 'carburant à préciser'}` +
            `${c.automate ? ' · automate' : ''}` +
            `${c.horaires ? `<br>${c.horaires}` : ''}`,
          { direction: 'top' },
        )
        .addTo(g);
    }
  }, [zonesDePoser, pointsCarburant]);

  /* ---- postes ----------------------------------------------------- */
  useEffect(() => {
    const g = couchePostes.current;
    if (!g) return;
    g.clearLayers();
    if (zoom < 8 || !filtres.postes) return;
    for (const p of postes) {
      if (bornes && !bornes.contains([p.lat, p.lon])) continue;
      // les clients du réseau — traction, production, industrie — restent masqués
      // tant qu'on ne les demande pas
      if (p.cat === 'autre' && !filtres.postesAutres) continue;
      const couleurPoste =
        p.cat === 'mixte' ? '#7c3aed' : p.cat === 'autre' ? '#64748b' : '#0b2545';
      const m = L.circleMarker([p.lat, p.lon], {
        radius: zoom >= 12 ? 7 : 4,
        color: '#0b2545',
        weight: 2,
        fillColor: couleurPoste,
        fillOpacity: 0.9,
      });
      m.bindTooltip(
        `<b>${p.nom || 'Poste'}</b>${p.code ? ` <code>${p.code}</code>` : ''}<br>` +
          `${p.operateur}${p.cat === 'mixte' ? ' · poste source (mixte)' : ''}` +
          `${p.fonction ? ` · ${p.fonction}` : ''}`,
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
  }, [postes, zoom, bornes, filtres.postes, filtres.postesAutres]);

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
      // l'état d'un pylône reflète la visite héliportée, seule à porter l'avancement
      const fait = portionsFaites(l, s, 'VH').some((z) => p.i >= z.debut && p.i <= z.fin);
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
          `${nomAffiche(l, s, rattachement(l.id))}<br>PK ${p.d
            .toFixed(2)
            .replace('.', ',')} km`,
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
