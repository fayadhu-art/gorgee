# Gorgée

Suivi des boissons : quantité réellement bue, apports (sucres, gras, caféine…), avis appuyés sur des repères officiels, séances de sport. Tout reste sur le téléphone.

## Installer sur iPhone avec Sideloadly

1. Ouvre l'onglet **Releases** du dépôt et télécharge le dernier `Gorgee.ipa`.
2. Ouvre Sideloadly, branche l'iPhone, glisse `Gorgee.ipa` dans la fenêtre et lance l'installation avec ton identifiant Apple.
3. Sur l'iPhone : Réglages › Général › VPN et gestion de l'appareil › fais confiance à ton identifiant (première fois seulement).

Pour mettre à jour, réinstalle **par-dessus** l'ancienne version, sans la supprimer : tes données restent dans l'appli. Avant une mise à jour, fais quand même une sauvegarde depuis Profil › Données.

Avec un identifiant Apple gratuit, l'appli doit être réinstallée tous les 7 jours (limite d'Apple).

## Fabrication

Chaque envoi sur `main` déclenche GitHub Actions, qui :

1. lance les tests et construit la page avec Vite ;
2. crée le projet iOS avec Capacitor ;
3. compile sans signature, puis publie `Gorgee.ipa` dans les Releases.

## Développement

```
npm install
npm run dev      # appli dans le navigateur
npm test         # tests du domaine
npm run build    # page compilée dans dist/
```
