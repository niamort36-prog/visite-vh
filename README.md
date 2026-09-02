# Visite VH

Application web de **préparation et de suivi des visites héliportées** du réseau haute
tension (63 kV à 400 kV). Elle fonctionne entièrement dans le navigateur, sans serveur ni
compte, et reste utilisable **hors connexion** une fois le secteur chargé.

## Ce que fait l'application

- **Carte** du réseau HTB : lignes colorées par tension, pylônes positionnés et numérotés,
  postes RTE et postes sources Enedis. Fonds de carte IGN (plan et photo aérienne) et
  OpenStreetMap.
- **Tableau du secteur** : une ligne par ouvrage, avec longueur, périmètre à visiter,
  kilomètres faits et restants, pourcentage d'avancement et date de dernière mise à jour.
- **Pylônes frontières** : bornes du tronçon dont vous avez la charge, définies au clic sur
  la carte ou dans la liste.
- **Suivi de l'avancement** : le dernier pylône survolé fixe la progression ; les kilomètres
  et les dates se calculent seuls, et la portion réalisée apparaît en vert sur la carte.
- **Observations** géolocalisées au pylône, avec niveau de gravité.
- **Campagnes** : un suivi distinct par campagne (par exemple une par année).
- **Sauvegarde** par export / import d'un fichier JSON, à conserver ou à partager.

## Origine des données

| Donnée | Source | Remarque |
| --- | --- | --- |
| Tracés des lignes, position des pylônes, postes | OpenStreetMap (Overpass API) | Seule source nationale gratuite : RTE a retiré les géométries de ses ouvrages de l'open data. |
| Codes et libellés d'ouvrage (`code_ligne`, `nom_ligne`), sites électriques | ODRE / RTE | Nomenclature officielle, sans géométrie. |
| Contours départementaux | france-geojson | Rattachement des ouvrages aux départements. |
| Fonds de carte | IGN Géoplateforme, OpenStreetMap | Gratuits, sans clé d'accès. |

**Deux limites à connaître :**

1. **Numéros de pylônes.** Environ 5 % des pylônes portent leur numéro réel dans
   OpenStreetMap. Pour les autres, l'application affiche le **rang calculé** le long de la
   ligne, en italique et en gris, pour qu'on ne le confonde jamais avec un numéro officiel.
2. **Identification des ouvrages.** OpenStreetMap ne nomme pas tous les postes. Quand aucune
   extrémité n'est nommée, la ligne apparaît comme « à identifier » : le panneau *Ouvrage*
   permet alors de la renommer et de la **rattacher à un ouvrage du catalogue RTE officiel**
   embarqué (9 200 entrées). Ce rattachement est enregistré avec votre suivi et voyage avec
   l'export JSON.

Ces données sont indicatives et destinées à la préparation. Elles ne remplacent aucun
document d'exploitation.

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
2. Cliquez **Fond de carte — zoom 13** (ou 14, plus détaillé mais plus lourd) pour
   pré-télécharger les tuiles IGN du secteur.
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
src/map/MapView.tsx        carte Leaflet, tracés, pylônes, postes, position GPS
src/ui/                    panneaux secteur, tableau des lignes, détail d'ouvrage
```

## Licences

Données OpenStreetMap sous [ODbL](https://www.openstreetmap.org/copyright), données RTE et
IGN sous licence ouverte. Toute diffusion de cartes issues de l'application doit conserver
ces mentions.
