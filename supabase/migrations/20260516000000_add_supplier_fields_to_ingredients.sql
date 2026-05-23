-- Ajout des champs fournisseur aux ingrédients
-- Permet le suivi du nom du fournisseur et le contact WhatsApp pour réapprovisionnement rapide

ALTER TABLE ingredients
    ADD COLUMN IF NOT EXISTS supplier_name text,
    ADD COLUMN IF NOT EXISTS supplier_phone text;
