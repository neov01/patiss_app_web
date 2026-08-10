# Croustik — widget flottant global

Date : 2026-08-10
Statut : Validé (brainstorming), prêt pour plan d'implémentation

## Contexte

Le "Comptable IA" (chatbot Gemini) a été personnifié par la mascotte
**Croustik** (voir
[2026-08-09-croustik-mascot-design.md](2026-08-09-croustik-mascot-design.md)),
mais reste aujourd'hui accessible uniquement via deux emplacements : une carte
intégrée sur `/dashboard` et une page dédiée `/ai-assistant`. L'objectif de ce
livrable est d'ajouter un troisième point d'accès : un personnage flottant,
présent sur toutes les pages de l'app, cliquable pour ouvrir une conversation
avec Croustik sans quitter la page courante.

## Objectif

Rendre Croustik accessible et interactif depuis n'importe quelle page de
l'app (`/dashboard`, `/caisse`, `/catalogue`, `/commandes`, `/equipe`,
`/ingredients`, `/inventaire`, `/ai-assistant`), via un bouton flottant qui
ouvre un panneau de chat, sans dupliquer la logique de conversation existante.

## Périmètre

**Inclus :**
- Un nouveau composant `FloatingMascot` monté une seule fois dans le layout
  partagé de la zone `(pâtisserie)`, donc visible sur toutes les pages listées
  ci-dessus.
- État fermé : bouton rond flottant (coin bas-droit), affichant Croustik en
  pose `greeting`, avec une légère animation de pulsation/rebond au repos.
- État ouvert (au clic) : panneau de chat ancré juste au-dessus du bouton, qui
  reste visible et cliquable pour refermer le panneau.
- Le panneau réutilise le composant `AIAssistant` existant tel quel (pas de
  nouvelle logique de chat/streaming) — la conversation est donc
  automatiquement partagée avec la carte du dashboard et la page
  `/ai-assistant` (même clé `localStorage`).
- Positionnement responsive : le bouton doit rester au-dessus de la barre de
  navigation mobile fixe (`sidebar-mobile-bar`, 70px de hauteur, visible
  sous 768px de large) plutôt que de la chevaucher.

**Exclu (hors scope pour ce livrable) :**
- Déplacement du bouton par l'utilisateur (drag & drop) — position fixe
  uniquement (coin bas-droit).
- Suppression ou remplacement de la carte de chat existante sur `/dashboard`
  ou de la page `/ai-assistant` — les trois points d'accès coexistent.
- Synchronisation live entre deux instances du chat montées en même temps
  (ex : panneau flottant ouvert en même temps que la carte du dashboard) —
  chacune garde son propre état React tant qu'elle est montée ; la dernière à
  écrire dans `localStorage` l'emporte. Cas rare, non traité.
- Nouveaux états visuels de Croustik au-delà des 4 existants
  (`greeting`/`thinking`/`happy`/`alert`) — le bouton fermé affiche toujours
  `greeting` ; les états à l'intérieur du panneau ouvert suivent exactement le
  comportement déjà en place dans `AIAssistant`.
- Badge de notification / compteur de messages non lus.

## Design

### Composant et emplacement

Nouveau fichier `src/components/dashboard/FloatingMascot.tsx` (même dossier
que `AIAssistant.tsx`, puisqu'il en est un simple conteneur). Monté dans
[`src/app/(pâtisserie)/layout.tsx`](../../../src/app/(pâtisserie)/layout.tsx),
à l'intérieur du même conteneur flex que `DashboardSidebar`, avec les mêmes
props déjà calculées dans ce layout : `currency` (`organization.currency_symbol`),
`organizationId` (`typedDisplayProfile.organization_id`), `userRole`
(`typedDisplayProfile.role_slug`).

`FloatingMascot` est un composant client (`'use client'`) qui :
1. Gère un seul état local `open: boolean` (`useState`, init `false`).
2. Rend toujours le bouton flottant (`position: fixed`).
3. Si `open`, rend en plus le panneau ancré, contenant `<AIAssistant currency={currency} organizationId={organizationId} userRole={userRole} />` sans aucune prop supplémentaire ni variante.

### État fermé — bouton

- Cercle 56×56px, `position: fixed`, `right: 20px`.
- `bottom: 20px` par défaut (desktop, ≥768px).
- `bottom: 90px` sous 768px de large (même seuil que `DashboardSidebar`), pour
  rester au-dessus de la barre de navigation mobile fixe (70px + marge).
- `z-index: 45` — au-dessus du contenu de page et de la barre mobile
  (`zIndex: 40`), en dessous des overlays plein écran de l'app (drawer mobile
  et `SessionMaster`/`SessionPill`, `zIndex: 50`/`9999`).
- Contenu : `next/image` avec `getMascotImagePath('greeting')`, `alt=""` (image décorative — le bouton porte déjà `aria-label="Ouvrir Croustik, l'assistant comptable IA"`), taille ~44px dans le cercle de 56px.
- Animation : pulsation CSS discrète en boucle sur le cercle (`transform: scale`
  ou `box-shadow` pulsé, ~2s de cycle) — implémentée en CSS pur
  (`@keyframes`), pas de librairie d'animation. Cesse pendant que le panneau
  est ouvert (pas de distraction pendant qu'on discute).
- `onClick` : bascule `open`.

### État ouvert — panneau

- `position: fixed`, ancré au même coin (`right: 20px`), avec son bord bas
  juste au-dessus du bouton (`bottom` = hauteur du bouton + marge, soit
  desktop `bottom: 84px` / mobile `bottom: 154px`).
- Largeur ~360px (`min(360px, calc(100vw - 40px))` pour rester utilisable sur
  petit écran), pas de hauteur forcée par ce conteneur — `AIAssistant`
  applique déjà sa propre hauteur (`500px`) en interne, le conteneur du
  panneau se contente de l'envelopper avec `border-radius`/`box-shadow`
  cohérents avec le reste de l'UI (`var(--radius-md)`/`box-shadow` déjà utilisés
  ailleurs dans l'app, pas de nouvelle valeur inventée).
- Le bouton flottant reste visible et cliquable pendant que le panneau est
  ouvert (cliquer dessus referme le panneau — pas de bouton de fermeture
  séparé dans le panneau, `AIAssistant` n'a pas besoin d'être modifié pour ça).
- `z-index` du panneau = celui du bouton (`45`) — les deux forment un seul
  groupe flottant.

### Partage de conversation

Aucun changement à `AIAssistant.tsx`. Comme il persiste déjà son historique
dans `localStorage` sous la clé `ai-chat-${organizationId}` (identique quel
que soit l'endroit où il est monté), une conversation commencée dans le
panneau flottant continue automatiquement dans la carte du dashboard ou la
page `/ai-assistant`, et inversement, dès qu'un de ces composants est
(re)monté.

## Gestion des erreurs

Aucun nouveau cas d'erreur : `FloatingMascot` ne fait aucun appel réseau
propre, il délègue entièrement à `AIAssistant` (déjà testé/en production) une
fois ouvert. Le seul état local (`open`) est un booléen sans persistance —
s'il se réinitialise à `false` lors d'une navigation entre pages (le layout
partagé remonte `FloatingMascot` à chaque changement de route côté client
selon le comportement standard de Next.js pour les composants du layout), le
panneau se referme simplement ; ce n'est pas un bug, c'est le comportement
attendu (revenir à l'état fermé par défaut en changeant de page).

## Tests

- Vérification manuelle sur au moins 3 pages différentes (`/dashboard`,
  `/caisse`, `/inventaire`) : bouton visible, cliquable, panneau s'ouvre/se
  ferme, conversation persiste entre un aller-retour panneau flottant → page
  `/ai-assistant`.
- Vérification manuelle en largeur mobile (< 768px) : bouton ne chevauche pas
  la barre de navigation du bas.
- Pas de nouvelle logique pure à tester unitairement (`open` est un booléen
  local trivial) — pas de nouveau fichier `*.test.ts` prévu pour ce livrable.
