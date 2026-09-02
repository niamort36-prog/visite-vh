# Visite VH

Application web de **préparation et de suivi des visites héliportées** du réseau haute
tension (63 kV à 400 kV). Elle fonctionne entièrement dans le navigateur, sans serveur ni
compte, et reste utilisable **hors connexion** une fois le secteur chargé.

## Ce que fait l'application

- **Carte** du réseau HTB : lignes colorées par tension, pylônes positionnés et numérotés,
  postes RTE et postes sources Enedis. Quatre fonds : plan IGN, photo aérienne IGN,
  OpenStreetMap et **carte VFR type OACI**.
- **Espaces aériens** : la surcharge aéronautique (CTR, TMA, zones LF-R/LF-D, terrains,
  fréquences, niveaux, points de report) s'affiche seule par-dessus le plan ou la photo, ou
  complète pour former la carte VFR.
- **Tableau du secteur** : une ligne par ouvrage, avec longueur, périmètre à visiter,
  kilomètres faits et restants, pourcentage d'avancement et date de dernière mise à jour.
- **Pylônes frontières** : bornes du tronçon dont vous avez la charge, définies au clic sur
  la carte ou dans la liste.
- **Suivi de l'avancement** : le dernier pylône survolé fixe la progression ; les kilomètres
  et les dates se calculent seuls, et la portion réalisée apparaît en vert sur la carte.
- **Observations** géolocalisées au pylône, avec niveau de gravité.
- **Préparations de vol** : au sein d'une campagne, une préparation par semaine (S24…) et
  par type de vol (VH mono-turbine, VH bi-turbines, VTIR, vol dédié LiDAR). On y renseigne
  l'OAN, le pilote et l'appareil (choisi dans une flotte enregistrée une fois pour toutes),
  on coche les jours travaillés, puis on compose un **planning par demi-journée** : chaque
  ouvrage y apparaît avec son domaine de tension, son kilométrage, un temps de visite
  calculé (50 km/h par défaut, modifiable) et un commentaire libre. Les lignes s'ajoutent
  **en les cliquant sur la carte** ou par recherche sur leur nom.
- **NOTAM** : chaque journée de préparation porte un bouton *NOTAM* qui déduit des ouvrages
  planifiés les **terrains à code OACI** situés dans un rayon réglable (10, 15 ou 25 km),
  avec leur distance au tracé et les lignes concernées ; les codes se copient d'un clic et
  le service officiel s'ouvre à côté. Voir la limite expliquée plus bas.
- **Campagnes** : un suivi distinct par campagne (par exemple une par année).
- **Sauvegarde** par export / import d'un fichier JSON, à conserver ou à partager.

## Origine des données

| Donnée | Source | Remarque |
| --- | --- | --- |
| Tracés des lignes, position des pylônes, postes | OpenStreetMap (Overpass API) | Seule source nationale gratuite : RTE a retiré les géométries de ses ouvrages de l'open data. |
| Codes et libellés d'ouvrage (`code_ligne`, `nom_ligne`), sites électriques | ODRE / RTE | Nomenclature officielle, sans géométrie. |
| Contours départementaux | france-geojson | Rattachement des ouvrages aux départements. |
| Fonds de carte | IGN Géoplateforme, OpenStreetMap | Gratuits, sans clé d'accès. |
| Carte VFR et espaces aériens | [open flightmaps](https://www.openflightmaps.org/) | *OFMA General Users' License*, usage commercial inclus. Zoom natif 7 à 12, sur-zoom au-delà. |
| Aérodromes et hélistations | [OurAirports](https://ourairports.com/) | Domaine public. 1 666 terrains français, dont 433 avec code OACI. |

**Deux limites à connaître :**

1. **Numéros de pylônes.** Environ 5 % des pylônes portent leur numéro réel dans
   OpenStreetMap. Pour les autres, l'application affiche le **rang calculé** le long de la
   ligne, en italique et en gris, pour qu'on ne le confonde jamais avec un numéro officiel.
2. **Identification des ouvrages.** OpenStreetMap ne nomme pas tous les postes. Quand aucune
   extrémité n'est nommée, la ligne apparaît comme « à identifier » : le panneau *Ouvrage*
   permet alors de la renommer et de la **rattacher à un ouvrage du catalogue RTE officiel**
   embarqué (9 200 entrées). Ce rattachement est enregistré avec votre suivi et voyage avec
   l'export JSON.

**Les NOTAM ne sont pas récupérés par l'application.** Aucun service ne les expose à une page
web sans compte ni clé : l'API de la FAA et celle d'autorouter exigent une authentification et
n'autorisent pas les requêtes depuis un navigateur tiers, l'ancien NOTAMWEB de la DGAC a été
retiré, et SOFIA-Briefing qui l'a remplacé n'offre pas d'API publique. Une application statique
sans serveur ne peut donc pas les afficher — et un NOTAM servi depuis un cache périmé serait
pire qu'absent. L'application se limite à ce qu'elle peut garantir : dire **quels terrains
consulter**, calculé sur la géométrie réelle des ouvrages planifiés, et ouvrir le service
officiel avec les codes prêts à coller.

Ces données sont indicatives et destinées à la préparation. Elles ne remplacent aucun
document d'exploitation. **La carte VFR est fournie à titre non contractuel : elle ne
remplace pas la documentation aéronautique officielle du SIA et ne doit pas servir à la
navigation.**

## Démarrage

```bash
npm install
npm run dev
```

L'application est alors disponible sur <http://localhost:5173/visite-vh/>.

## Régénérer les données réseau

```bash
npm run data:fetch    # télécharge le réseau depuis Overpass (≈ 1 h 30, reprenable)
npm run data:build    # produit public/data/ (index, départements, catalogue RTE)
```

`data:fetch` découpe la France en mailles d'un degré, interroge quatre miroirs Overpass en
parallèle et écrit chaque maille dans `data/raw/`. Le script est **reprenable** : s'il est
interrompu, il repart des mailles manquantes. Options utiles :

```bash
node scripts/fetch-osm.mjs --bbox 44,-1,46,2   # une zone précise (sud,ouest,nord,est)
node scripts/fetch-osm.mjs --force             # tout retélécharger
```

`data/raw/` n'est pas versionné : seules les données construites (`public/data/`) le sont.

## Mise en ligne

Le dépôt contient un workflow GitHub Actions qui construit le site et le publie sur GitHub
Pages à chaque `push` sur `main`. Il faut activer **Settings → Pages → Source : GitHub
Actions** une fois pour toutes. La base d'URL est déduite du nom du dépôt.

## Usage hors connexion

1. Dans l'onglet **Secteur**, cochez vos départements : les données réseau sont mises en
   cache dès leur chargement.
2. Choisissez les fonds à emporter (plan IGN, photo aérienne, carte VFR) et le zoom : le
   nombre de tuiles est annoncé avant le téléchargement.
3. Installez l'application depuis le navigateur (« Installer » / « Ajouter à l'écran
   d'accueil »). Elle s'ouvre ensuite sans réseau, avec la carte et la saisie du suivi.

Le suivi est enregistré dans le navigateur. **Exportez-le régulièrement** : c'est la seule
sauvegarde, et elle sert aussi à partager l'avancement avec un collègue.

## Organisation du code

```
scripts/fetch-osm.mjs      téléchargement Overpass, maillé et reprenable
scripts/build-dataset.mjs  reconstruction des lignes, numérotation, découpage départemental
scripts/make-icons.mjs     icônes de la PWA
src/data/                  chargement des jeux de données
src/state/store.tsx        campagnes, suivi, avancement, export / import
src/map/fonds.ts           définition des fonds de carte (IGN, OSM, VFR)
src/map/MapView.tsx        carte Leaflet, tracés, pylônes, postes, position GPS
src/lib/semaines.ts        calendrier ISO 8601 (semaines, jours, libellés)
src/lib/vols.ts            types de vol, domaines de tension, temps de visite
src/lib/notam.ts           terrains concernés par un vol (distance au tracé)
src/ui/                    panneaux secteur, tableau des lignes, détail d'ouvrage,
                           préparations de vol et planning par demi-journée
```

## Licences

Données OpenStreetMap sous [ODbL](https://www.openstreetmap.org/copyright), données RTE et
IGN sous licence ouverte, cartes aéronautiques sous *OFMA General Users' License*. Toute
diffusion de cartes issues de l'application doit conserver ces mentions.
