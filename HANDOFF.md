# 📄 HANDOFF — TRANSITION DU MODULE "MON ÉQUIPE" (RH)
> **Date** : 04 Avril 2026
> **Statut** : Module RH Opérationnel (v1.0)

---

## 🏗️ 1. RÉSUMÉ TECHNIQUE
Le module "Mon Équipe" a été transformé d'une simple liste d'employés en un système de gestion RH léger et complet.

### 🔌 Modifications Base de Données (Supabase)
- **Table `profiles`** : Enrichie avec les champs `phone`, `hire_date`, `contract_type`, `base_salary`, et `avatar_url`.
- **Table `employee_pay_events`** : Créée pour suivre les primes et retenues mensuelles.
- **Sécurité (RLS)** : Isolation stricte par `organization_id`.

### 🛠️ Nouvelles Server Actions (`lib/actions/employees.ts`)
- `createEmployee` / `updateEmployee` / `deleteEmployee` (soft-delete).
- `addPayEvent` / `deletePayEvent` : Gestion des mouvements financiers.
- `getMonthlyPayslip` : Calcul dynamique du Salaire Net (Base + Primes - Retenues).
- `uploadEmployeeAvatar` : Intégration avec **Supabase Storage**.

---

## 🎨 2. COMPOSANTS UI DÉPLOYÉS (`src/components/equipe/`)
1. **`EquipeClient.tsx`** : Orchestrateur principal (Dashboard RH).
2. **`EmployeeCard.tsx`** : Vue synthétique de l'employé (Badge statut, rôle, accès rapide).
3. **`EmployeeModal.tsx`** : Interface d'édition splitée (Identité vs Accès/Paie).
4. **`PayEventModal.tsx`** : Ajout rapide de primes/retenues.
5. **`PayslipDrawer.tsx`** : Tiroir latéral pour consulter l'historique et le net à payer.

---

## 🚧 3. ACTIONS À VENIR & POINTS DE VIGILANCE
- [ ] **Stockage** : Vérifier que le bucket `avatars` est créé dans Supabase Storage (public).
- [ ] **Impression** : Le bouton "Imprimer" sur la fiche de paie utilise `window.print()`. Une feuille de style CSS `@media print` dédiée pourrait être ajoutée pour un rendu "Document Officiel".
- [ ] **Historique** : Actuellement, le `contract_type` n'est pas historisé (si on change de plein temps à temps partiel, cela affecte le mois en cours).

---

## 💡 4. IMPORTANCE DE CE FICHIER HANDOFF
Avoir un fichier `HANDOFF.md` est crucial pour plusieurs raisons :

1. **Continuité Contextuelle** : Si vous reprenez le projet dans 2 semaines, ou si un autre développeur intervient, ce document permet de comprendre **immédiatement** ce qui a été fait, où se trouvent les fichiers clés, et quelles ont été les décisions techniques.
2. **Débugage Accéléré** : En listant les modifications de schéma et les nouvelles actions, on réduit le temps d'investigation en cas d'erreur.
3. **Audit de Sécurité** : Il documente les points critiques comme les politiques RLS appliquées.
4. **Gestion de Projet** : Il sert de "Checklist" pour les étapes restantes, évitant ainsi d'oublier des détails importants comme la configuration du stockage.

---

> [!TIP]
> Ce fichier fait désormais partie de la documentation de votre dépôt. Il complète le `PROJECT_SNAPSHOT.md` pour une vue granulaire sur cette mise à jour RH.
