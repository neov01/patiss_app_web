-- ============================================================
-- Migration : 20260823230200_transactions_reference_code
-- Objectif  : L'onglet « Vente rapide » affiche une référence courte
--             (« Ref: 1787A3C2 » = les 8 premiers caractères de l'UUID en
--             majuscules) et la barre de recherche est censée la retrouver.
--             La recherche construisait pour cela le filtre PostgREST
--             `id::text.ilike.%…%` — or PostgREST refuse le cast `::` dans
--             un arbre logique `or=(…)` et renvoyait une 400
--             « failed to parse logic tree », affichée en toast dès la
--             deuxième lettre tapée.
--
--             On matérialise donc la référence affichée dans une colonne
--             générée, directement filtrable avec un `ilike` ordinaire.
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reference_code TEXT
  GENERATED ALWAYS AS (UPPER(LEFT(id::text, 8))) STORED;

COMMENT ON COLUMN public.transactions.reference_code IS
  'Référence courte affichée dans l''UI (8 premiers caractères de l''UUID, en majuscules). Sert à la recherche des ventes rapides.';
