# Mascotte Croustik pour le Comptable IA

Date : 2026-08-09
Statut : Validé (brainstorming), prêt pour plan d'implémentation

## Contexte

L'application dispose déjà d'un chatbot "Comptable IA" (Gemini) exposé via
[`AIAssistant.tsx`](../../../src/components/dashboard/AIAssistant.tsx), utilisé à deux
endroits :

- `src/app/(pâtisserie)/dashboard/page.tsx` (widget dans le tableau de bord)
- `src/app/(pâtisserie)/ai-assistant/page.tsx` (page dédiée)

L'avatar actuel du bot est une icône générique `lucide-react` (`Bot` dans les
bulles de réponse, `Sparkles` dans le header). L'objectif est de remplacer ces
icônes par une mascotte illustrée nommée **Croustik**, un croissant à
lunettes et toque de pâtissier, pour donner une identité au "comptable IA".

Une planche de style a été partagée comme référence de direction artistique
(croissant cartoon, lunettes rondes, toque blanche, joues roses, palette
orange/blanc). Cette planche est composite (plusieurs poses collées sur une
seule image, avec légendes textuelles incrustées) et n'est donc pas
directement utilisable comme asset — elle sert uniquement de référence
stylistique pour régénérer des poses individuelles propres.

## Objectif

Donner une identité visuelle et un nom (Croustik) au Comptable IA existant,
sans changer son comportement fonctionnel ni son intégration technique
(Gemini, streaming SSE, historique localStorage restent inchangés).

## Périmètre

**Inclus :**
- 4 assets image individuels (fond transparent) représentant Croustik dans 4
  états, prêts à intégrer.
- Remplacement des icônes `Bot`/`Sparkles` par ces images dans
  `AIAssistant.tsx` (header + avatar des bulles de réponse).
- Renommage du libellé du header du chat : "Assistant Compta-Gâteau" →
  "Croustik" (sous-titre "Comptable IA" conservé).

**Exclu (hors scope pour ce livrable) :**
- Animation (breathing, blink, transitions).
- Détection d'un état "alerte budgétaire" par analyse sémantique de la
  réponse IA — l'état `alert` couvre uniquement le cas d'erreur réseau déjà
  géré par le composant.
- Mascotte hero sur la page `/ai-assistant` ou ailleurs dans l'app (option A
  retenue lors du brainstorming, pas d'option B).
- Renommage du titre de page "Comptable IA" (reste tel quel, distinct du nom
  de personnage utilisé dans le chat).

## Design

### Les 4 états

Le composant `AIAssistant.tsx` a déjà 4 états observables dans son état React
actuel ; chacun est mappé à une pose de Croustik :

| État        | Pose                                             | Déclencheur dans le code actuel |
|-------------|---------------------------------------------------|----------------------------------|
| `greeting`  | Salutation, main levée, souriant                  | `history.length === 0` (message d'accueil affiché) |
| `thinking`  | Réflexif, crayon/loupe, sourcils froncés          | `item.loading === true` (pendant le streaming) |
| `happy`     | Enthousiaste, pouce levé ou sourire large          | Bulle de réponse reçue normalement (`!item.loading`, pas d'erreur) |
| `alert`     | Inquiet, expression soucieuse                     | Catch du `fetch` → message `"Erreur de connexion à l'assistant IA."` |

### Emplacements dans l'UI (Option A — avatar seul)

Deux emplacements dans `AIAssistant.tsx`, tous deux remplacés par `next/image` :

1. **Avatar du header** (actuellement icône `Sparkles` dans un cercle
   48×48px) → toujours la pose `greeting`, c'est l'avatar "identité" du
   composant.
2. **Avatar des bulles de réponse** (actuellement icône `Bot` dans un cercle
   32×32px, une par message assistant + message d'accueil) → pose dépendant
   de l'état du message correspondant (`greeting` pour le message d'accueil
   vide, `thinking` pendant le chargement, `happy` une fois la réponse
   affichée, `alert` si la réponse est le message d'erreur de connexion).

Pas de changement sur la page `/ai-assistant` au-delà de ce que le composant
`AIAssistant` lui-même affiche (pas de hero dédié).

### Copie

- Header du chat : `"Assistant Compta-Gâteau"` → `"Croustik"`.
- Sous-titre du header : `"Intelligence Artisanale"` a été conservé tel quel
  (implémentation confirmée dans `AIAssistant.tsx`).
- Titre de la page `ai-assistant/page.tsx` (`"Comptable IA"`) : **inchangé**.

### Assets

- Format : PNG, fond transparent, export carré ~512×512px (redimensionné en
  CSS/`next/image` selon l'emplacement : 48px header, 32px bulles).
- Emplacement : `public/mascot/croustik-greeting.png`,
  `public/mascot/croustik-thinking.png`, `public/mascot/croustik-happy.png`,
  `public/mascot/croustik-alert.png`.
- Cohérence visuelle obligatoire entre les 4 poses : même palette (corps
  orange/doré, toque et gants blancs, joues roses), mêmes proportions de
  personnage, mêmes lunettes rondes, même style d'illustration (cartoon plat,
  contours nets), pour que Croustik reste reconnaissable d'un état à l'autre.
- Génération : les 4 poses sont recréées individuellement (pas de découpe de
  la planche existante) via des prompts dédiés — voir section suivante.

## Prompts de génération d'image

Les 4 prompts ci-dessous sont conçus pour être utilisés indépendamment (un
par asset) avec un outil de génération d'image externe. Un bloc "style de
base" commun garantit la cohérence entre les poses ; chaque prompt l'inclut
en entier pour éviter toute dérive entre générations séparées.

### Bloc de style commun (inclus dans chaque prompt)

```
A cute cartoon mascot character shaped like a golden-brown croissant,
personifying a friendly AI accountant. Round black-rimmed glasses, a
white chef's toque on top, small white pastry-dough gloves for hands and
feet, rosy pink cheeks, simple friendly dot eyes, flat vector cartoon
illustration style with clean bold outlines, warm orange/gold and white
color palette only, soft flat shading (no gradients, no photorealism),
centered composition, transparent background, no text, no logos, no
watermark, no other characters, square framing.
```

### Prompt 1 — `croustik-greeting.png` (salutation / idle)

```
[bloc de style commun]
Pose: standing, one gloved hand raised in a friendly wave, warm open
smile, welcoming and approachable expression, looking directly at
viewer.
```

### Prompt 2 — `croustik-thinking.png` (réflexion / chargement)

```
[bloc de style commun]
Pose: one gloved hand near the chin in a thinking gesture, eyebrows
slightly raised, eyes looking upward or to the side, thoughtful and
focused expression, as if calculating something.
```

### Prompt 3 — `croustik-happy.png` (réponse positive)

```
[bloc de style commun]
Pose: both gloved hands giving an enthusiastic thumbs-up (or one
thumbs-up if two hands reads awkwardly), big joyful smile, eyes
slightly closed with happiness, small sparkle accents optional,
celebratory and confident expression.
```

### Prompt 4 — `croustik-alert.png` (erreur / alerte)

```
[bloc de style commun]
Pose: one gloved hand touching the side of the face or head in a
worried gesture, slightly furrowed brow, wide concerned eyes, mouth in
a small worried line, apologetic and concerned expression (not scared
or sad, just mildly concerned).
```

## Gestion des erreurs

Aucun nouveau cas d'erreur introduit : les images sont des assets statiques
livrés avec le build (pas de chargement réseau dynamique à runtime au-delà de
ce que `next/image` gère déjà pour toute image statique du projet). Pas de
fallback dynamique nécessaire — si un fichier est manquant, cela se
détecterait au build/à la revue visuelle, pas en production face à
l'utilisateur.

## Tests

- Vérification visuelle manuelle des 4 états dans le composant (déclencher
  chaque état : chat vide, question en cours, réponse normale, coupure réseau
  simulée) sur le dashboard et sur `/ai-assistant`.
- Pas de nouveau test automatisé requis : aucune logique métier n'est
  ajoutée, seul le rendu visuel change (le mapping état→image est une
  fonction pure triviale, déjà couverte implicitement par les tests
  existants du composant s'il y en a).

## Risques / points d'attention

- La cohérence visuelle entre les 4 générations séparées dépend de la
  fidélité de l'outil de génération au prompt — une revue visuelle groupée
  des 4 images avant intégration est recommandée pour vérifier qu'elles
  forment bien un seul personnage cohérent.
- Le poids des 4 PNG doit rester raisonnable (privilégier une compression /
  export optimisé) pour ne pas alourdir le chargement du dashboard.
