# Rapports par e-mail : clôture enrichie et récap mensuel

- **Date :** 2026-11-19
- **Statut :** spec validée
- **Maquettes validées (données fictives) :** `docs/superpowers/mockups/email-quotidien.html`, `docs/superpowers/mockups/email-mensuel.html`

## 1. Objectif

1. **Enrichir l'e-mail envoyé à chaque clôture de caisse** avec un nouveau template (palette « atelier » de `DESIGN.md`), des comparaisons et des graphiques, pour que la gérante comprenne sa journée en 5 secondes.
2. **Créer un récapitulatif mensuel** envoyé automatiquement le 1er de chaque mois, sur le mois écoulé.

Les deux e-mails partent vers le même destinataire que l'e-mail de clôture actuel. Le propriétaire reçoit l'e-mail et une règle de transfert automatique le fait suivre à la gérante. Le domaine d'envoi Resend (`onboarding@resend.dev`) ne change pas.

## 2. Hors périmètre

- Graphiques en images (PNG) ou via un service externe. Seuls des graphiques en HTML pur sont prévus (décision A).
- Rédaction du bloc « En bref » par l'IA. Il est produit par des règles déterministes.
- Modification de la logique de clôture elle-même (calculs, `metrics_snapshot`, verrou `status = 'open'`), sauf décision D1 (§ 9).
- Changement de domaine d'envoi ou de destinataires.

## 3. Contenu de l'e-mail quotidien

Ordre des blocs, conforme à la maquette `email-quotidien.html` :

| # | Bloc | Contenu | Règle d'affichage |
|---|---|---|---|
| 1 | En-tête | Nom de l'organisation, « Rapport de journée », date longue en français | Toujours |
| 2 | Total encaissé | `totalRevenue` de la clôture (même valeur que le `metrics_snapshot`) + 2 pastilles : % vs hier (J-1) et % vs même jour semaine précédente (J-7), avec le montant de référence entre parenthèses | Une pastille est masquée si son CA de référence vaut 0 |
| 3 | L'essentiel | 3 tuiles : **Ventes** (nombre de transactions, % vs J-1), **Panier moyen** (CA ÷ ventes, % vs J-1), **Solde net** (CA − dépenses de la session, avec montant et nombre d'achats) | Panier moyen masqué si 0 vente |
| 4 | CA heure par heure | Barres verticales appariées aujourd'hui / J-1 par heure, de la première à la dernière heure qui a eu une vente (sur les deux jours) ; légende ; phrase « Heure de pointe : Xh–X+1h (montant) » | Masqué si aucune vente aujourd'hui |
| 5 | Modes de règlement | Barre empilée 100 % + tableau (pastille couleur, mode, montant, %) ; seuls les modes > 0 | Masqué si CA = 0 |
| 6 | Top 3 du jour | Rang, nom, quantité, mini-barre proportionnelle, CA | Masqué si aucun article vendu |
| 7 | À préparer pour demain | Nombre de commandes avec `pickup_date` = J+1 (hors annulées et supprimées), heure du premier retrait, reste à encaisser (Σ `total_amount − deposit_amount`, minimum 0) | Remplacé par « Aucun retrait prévu demain » si 0 |
| 8 | Points d'attention | Stock bas (ingrédients ≤ seuil), soldes dus (`totalPending`) | Bloc entier masqué si rien à signaler |
| 9 | Détails de la caisse | Ventes directes, acomptes, soldes ; qui a ouvert ou fermé la caisse et à quelle heure ; saisies de commandes par membre de l'équipe | Toujours |
| 10 | Pied de page | Mention « généré automatiquement », devise, lien « Ouvrir le tableau de bord » vers l'URL publique de l'app (variable `NEXT_PUBLIC_APP_URL`) | Le lien est masqué si la variable est absente |

**Préheader** (texte d'aperçu dans la boîte de réception) : `{CA} encaissés, {±x} % vs hier, {±y} % vs {jour} dernier`.

**Objet** : `📊 Rapport de journée — {organisation} — {date}`.

## 4. Contenu du récap mensuel

Ordre des blocs, conforme à la maquette `email-mensuel.html` :

| # | Bloc | Contenu | Règle d'affichage |
|---|---|---|---|
| 1 | En-tête | « Récapitulatif du mois », « {Mois AAAA} · {n} jours d'ouverture » | Toujours |
| 2 | CA du mois | Montant + pastilles % vs mois précédent et % vs même mois de l'année précédente ; ligne « dont {montant} saisis a posteriori (commandes papier importées) » | Une pastille est masquée si son CA de référence vaut 0 ; la ligne « a posteriori » seulement si la part historique > 0 |
| 3 | En bref | 3 à 4 phrases produites par `report-insights.ts` (§ 6.4) | Masqué si aucune règle ne s'applique |
| 4 | L'essentiel | Ligne 1 : ventes, panier moyen, commandes. Ligne 2 : dépenses, solde net., chacun avec % vs mois précédent | Une tuile sans référence affiche « — » à la place de la pastille |
| 5 | CA jour par jour | Histogramme sur tous les jours du mois ; semaine en clair, week-end en foncé, meilleur jour en vert ; étiquettes 1, 5, 10, 15, 20, 25, dernier jour ; phrase meilleur jour + moyenne par jour d'ouverture | Toujours (jours sans vente = barre vide) |
| 6 | Quels jours portent la boutique ? | Barres horizontales lun→dim du CA moyen par jour d'ouverture ; phrase « Un samedi rapporte X× plus qu'un lundi. Le week-end pèse Y % du CA. » | Une ligne de jour est masquée si ce jour n'a eu aucune ouverture ; la phrase compare le meilleur et le plus faible jour réellement ouverts |
| 7 | Modes de règlement | Comme le quotidien | Masqué si CA = 0 |
| 8 | Top 10 produits + ventes les plus faibles | Classement par CA, à partir des articles vendus en caisse (`transaction_items`) ; les imports historiques n'en créent pas et n'y figurent donc pas ; puis les 3 produits vendus au moins une fois avec la plus faible quantité | La partie « plus faibles » est affichée seulement si au moins 13 produits distincts ont été vendus (pour ne pas recouper le top 10) |
| 9 | Commandes et clients | Nouveaux clients (`customers.created_at` dans le mois) ; clients revenus (≥ 2 commandes dans le mois) ; top 5 clients par montant de commandes du mois (nom, nombre, montant) | Top 5 masqué si aucune commande liée à un client |
| 10 | Pied de page | Comme le quotidien | Toujours |

**Objet** : `📈 Récap du mois — {organisation} — {Mois AAAA}`.

**Jour d'ouverture** : jour du mois ayant au moins une transaction comptée.

## 5. Règles de calcul communes

- **Journées en UTC.** C'est l'heure de la Côte d'Ivoire, et le Dashboard fait de même (`utcDayKey`, `previousUtcDayKey`). J-1 et J-7 sont des journées calendaires UTC complètes.
- **Transactions comptées, e-mail quotidien** : `deleted_at IS NULL` et `is_historical = false`, les mêmes filtres que `load-manager-charts.ts`. Le quotidien décrit l'activité de la caisse ; un import historique n'est pas passé par la caisse (voir D1).
- **Transactions comptées, récap mensuel** : `deleted_at IS NULL`, **historiques compris**. Une transaction historique porte sa date réelle de paiement (acompte = date de prise de commande, solde = date de retrait), donc elle appartient bien au CA du mois concerné. La même règle s'applique à M-1 et M-12. La part historique est affichée à part (§ 4, bloc 2). Limite connue : les imports faits après l'envoi du 1er ne figurent pas dans le récap déjà envoyé.
- **Réutilisation** des fonctions pures de `src/lib/domain/dashboard-metrics.ts` : `hourlyBuckets`, `summarizeSales`, `paymentSlices`, `topProducts`, `utcDayKey`. Aucune formule n'est dupliquée.
- **Pourcentage de variation** : `(courant − référence) / référence × 100`, arrondi à l'entier ; `null` si la référence vaut 0.
- **Pourcentages de la barre empilée** : arrondis par la méthode du plus fort reste, pour que la somme affichée fasse exactement 100.
- **Lecture paginée.** Toute lecture de transactions, d'articles ou de commandes sur un mois passe par un helper `fetchAllRows` qui enchaîne des `range()` de 1 000 lignes jusqu'à épuisement. PostgREST plafonne les réponses à 1 000 lignes, et sans pagination les totaux seraient tronqués sans erreur.
- **Format des montants** : séparateur de milliers = espace, espace insécable avant la devise (`org.currency_symbol`, `FCFA` par défaut).
- **Hausse / baisse** : flèche ▲/▼, signe +/− et couleur (sauge / rouge). L'information ne repose jamais sur la couleur seule.

## 6. Architecture

### 6.1 Fichiers

```
src/lib/reports/
  fetch-all-rows.ts          # pagination PostgREST générique
  report-recipient.ts        # résout le destinataire (prod : gérant ; sinon REPORT_DEV_EMAIL)
  daily-report-data.ts       # loadDailyReportData(admin, ctx) -> DailyReportData
  monthly-report-data.ts     # loadMonthlyReportData(admin, orgId, month) -> MonthlyReportData
  report-insights.ts         # buildMonthlyInsights(data) -> string[]   (pur)
  report-math.ts             # variation %, plus fort reste, moyennes par jour de semaine, bornes de mois (pur)
  emails/
    components.tsx           # Shell, Section, KpiTiles, DeltaPill, StackedBar, PairedHourBars,
                             # DayBars, WeekdayBars, RankedList, Callout
    DailyReportEmail.tsx
    MonthlyReportEmail.tsx
src/app/api/cron/monthly-report/route.ts
```

Dépendances ajoutées : `@react-email/components` et `@react-email/render` (rendu en HTML côté serveur, envoyé à Resend via `html`).

**Pourquoi React Email** : composants lisibles et testables, et **échappement automatique** des noms (produits, clients, équipe). L'e-mail actuel les interpole sans échappement dans une chaîne HTML.

Les composants n'utilisent que des tableaux et des styles en ligne, sans image ni JavaScript, comme dans les maquettes. Polices : `Manrope, Inter` avec repli `Helvetica Neue, Arial`.

### 6.2 E-mail quotidien : flux

Dans `closeSingleSession` (`src/lib/actions/session-utils.ts`) :

1. Les étapes 1 à 4 restent inchangées : lecture de la session, calcul des métriques, alertes stock, dépenses, `UPDATE` de clôture avec `metrics_snapshot`.
2. L'étape 5 est remplacée :
   - `resolveReportRecipient(admin, orgId)` : même logique qu'aujourd'hui (gérant actif en production, `REPORT_DEV_EMAIL` sinon). Sans destinataire, on retourne `emailSent: false` comme avant.
   - `loadDailyReportData(admin, { orgId, session, closedBy, metrics, alertItems, expensesSummary, now })` charge les données supplémentaires : transactions de J-7 00:00 à maintenant (une seule requête paginée, découpée ensuite par jour), articles du jour, commandes à retirer à J+1, profils ouvreur et fermeur, saisies par membre de l'équipe.
   - `render(<DailyReportEmail data={…} />)` produit le HTML, puis `resend.emails.send(...)`.
3. **Isolation des erreurs.** Chaque sous-chargement optionnel (comparaisons, heures, top 3, retraits de demain) est enveloppé : en cas d'erreur, le champ vaut `null` et le bloc est masqué. Une erreur de rendu ou d'envoi est journalisée sans données sensibles et renvoyée dans `error`. La session reste clôturée dans tous les cas, puisque l'`UPDATE` a déjà eu lieu.

### 6.3 Récap mensuel : flux

**Route** `GET /api/cron/monthly-report` (Vercel appelle les crons en `GET`) :

- Autorisation : `Authorization: Bearer ${CRON_SECRET}`, sinon 401. Si `CRON_SECRET` est absent, 500.
- Paramètres optionnels, pour les tests et les rattrapages :
  - `?month=AAAA-MM` : mois ciblé ; par défaut, le mois précédant la date UTC courante ;
  - en-tête `X-Test-Email` : force le destinataire, accepté seulement en dehors de la production ;
  - `?org=<uuid>` : limite l'envoi à une organisation.
- Pour chaque organisation (`Promise.allSettled`, une organisation à la fois pour ménager les quotas) : `loadMonthlyReportData`, `buildMonthlyInsights`, `render`, puis `resend.emails.send(..., { idempotencyKey: 'monthly-{orgId}-{AAAA-MM}' })`.
- Les organisations sans aucune transaction sur le mois sont ignorées : pas d'e-mail vide.
- Réponse JSON : `{ month, results: [{ orgId, sent, reason? }] }`, sans adresse e-mail.

**Planification** dans `vercel.json` :

```json
{ "path": "/api/cron/monthly-report", "schedule": "0 6 1 * *" }
```

Le plan Hobby autorise un déclenchement au plus par jour, avec une précision à l'heure près.

**Données chargées par organisation** (toutes paginées) :

- transactions du mois M et de M-1 (détail) et de M-12 (somme uniquement) ;
- articles vendus de M (`transaction_items` jointure `transactions`) ;
- dépenses non annulées de M et de M-1 ;
- commandes non supprimées et non annulées de M et de M-1, historiques comprises comme pour le CA (nombre ; `customer_id`, `customer_name`, `total_amount` pour le top clients) ;
- clients créés dans M.

**Bornes de mois** : `[AAAA-MM-01T00:00:00Z, premier jour du mois suivant)`.

### 6.4 Règles du bloc « En bref »

`buildMonthlyInsights` renvoie au plus 4 phrases, dans cet ordre de priorité, chacune seulement si sa condition est remplie :

1. **Tendance du CA** (si M-1 > 0) : « Le CA progresse de +X % » ou « Le CA recule de −X % » par rapport à {mois précédent}. On ajoute « porté par {produit n°1} » quand la variation est positive et que le top 1 pèse au moins 15 % du CA, et « … et {produit n°2} » si le n°2 pèse aussi au moins 15 %.
2. **Solde net** (si les dépenses de M et de M-1 sont > 0 et le solde net de M-1 > 0) : « Le solde net (CA − dépenses) progresse de +x % » ou « recule de −x % » par rapport au mois précédent. Le constat porte sur le solde réel, pour rester exact quel que soit le sens des variations.
3. **Jour faible** (si au moins 5 jours de la semaine différents ont été ouverts) : « Les {jour faible}s restent les plus calmes (X % de moins que la moyenne) », si l'écart vaut au moins 25 %.
4. **Produits peu vendus** (si la partie « plus faibles » est affichée) : « {n} produits se vendent à moins de 10 exemplaires par mois : à revoir. »

Pas de suggestion d'action inventée : seuls les constats chiffrés sont formulés.

## 7. Gestion des erreurs et sécurité

- **Le multi-tenant** : chaque requête filtre sur `organization_id` de la session (quotidien) ou de l'organisation en cours (mensuel). Le client service-role contourne le RLS, donc ce filtre est obligatoire dans chaque requête. Il est vérifié par revue et par les tests de `*-data.ts` avec un client simulé.
- **Les routes de cron** n'acceptent que le `CRON_SECRET`. `X-Test-Email` est ignoré si `ENVIRONMENT === 'production'`.
- **Les journaux** ne contiennent ni adresse e-mail, ni nom de client, ni montant : seulement l'identifiant d'organisation et un code d'erreur.
- **Pas de doublon mensuel** grâce à la clé d'idempotence Resend (valable 24 h). Un rattrapage volontaire plus tard reste possible.

## 8. Tests

**Unitaires (Vitest)** :

- `report-math.ts` : variation % (référence 0 → `null`) ; plus fort reste (somme = 100, cas d'un seul mode, cas d'égalités) ; bornes de mois (février bissextile ou non, décembre → janvier) ; moyennes par jour de la semaine qui ignorent les jours non ouverts.
- `report-insights.ts` : chaque règle déclenchée ou non selon ses seuils, maximum 4 phrases, ordre respecté.
- `fetch-all-rows.ts` : enchaîne les pages jusqu'à une page incomplète, propage une erreur.
- `daily-report-data.ts` / `monthly-report-data.ts` avec un client Supabase simulé : découpage J / J-1 / J-7, retraits de J+1, filtre `organization_id` présent dans chaque requête.

**Rendu** : les deux gabarits sont rendus avec les données fictives des maquettes. On vérifie les textes clés, l'absence de `<script>` et l'échappement d'un nom contenant `<b>`. Le rendu avec des données vides (aucune vente) ne doit pas planter.

**Manuel avant mise en ligne** :

- clôture d'une session sur l'environnement de test, et réception de l'e-mail sur l'adresse de test ;
- appel de la route mensuelle avec `?month=` sur le mois précédent ;
- contrôle visuel dans Gmail web, Gmail mobile et Apple Mail, puis **après transfert automatique**.

`npm run lint`, `npm run test` et `npm run build` doivent passer.

## 9. Décisions et points ouverts

- **D1 : ventes historiques.**
  - **Récap mensuel : incluses** (décidé), à leur date réelle de paiement, avec la part historique affichée à part (§ 5).
  - **Clôture et e-mail quotidien : exclues** (décidé). Le commentaire de la colonne `transactions.is_historical` indique qu'elle sert à « exclure [ces transactions] des clôtures de caisse actuelles ». Mais `closeSingleSession` lit `created_at >= ouverture` sans filtre `is_historical` ni borne haute. Une transaction historique datée d'aujourd'hui, ou **dans le futur** (solde à une date de retrait future, possible via la liste `payments` de l'import), est donc comptée à tort dans le total de la session. Correction : ajouter `.eq('is_historical', false)` aux lectures de transactions et de commandes de l'étape 2 (et `lte('created_at', maintenant)` sur les transactions). Dans un usage normal, le total ne change pas (les imports sont datés dans le passé, donc déjà exclus). **Zone argent : commit séparé**, test unitaire dédié, et mention dans la PR.
- **D2 : cron de clôture automatique (validé).** `api/cron/close-session` n'exporte que `POST`, alors que Vercel appelle les crons en `GET`. À vérifier dans les logs Vercel avant l'implémentation. Si la clôture de 21h échoue réellement, l'ajout d'un handler `GET` (même autorisation) fera partie de ce chantier, dans un commit dédié.
- **D3 : code mort (validé).** `src/app/api/cron/daily-report/route.ts` et `supabase/functions/daily-report/` ne sont appelés par aucun cron du dépôt. Ils seront supprimés dans ce chantier, après une recherche littérale confirmant qu'aucun appelant ne subsiste. Pour la fonction Supabase, vérifier aussi qu'elle n'est pas planifiée côté projet avant suppression.

- **Livraison** : la spec, les maquettes et l'implémentation sont commitées sur une branche dédiée créée depuis `main` (et non sur `design/atelier-gourmand`, qui contient d'autres travaux en cours).

## 10. Critères de réussite

- L'e-mail de clôture reprend la maquette validée, avec des chiffres identiques au Dashboard pour une même journée.
- Une erreur dans un bloc optionnel n'empêche ni la clôture ni l'envoi.
- Le récap mensuel part une seule fois par organisation le 1er du mois, avec des totaux corrects au-delà de 1 000 transactions.
- Les deux e-mails restent lisibles après transfert automatique et sans affichage des images.
