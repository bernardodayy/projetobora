-- Habilita o PostGIS e passa a manter, por trigger, uma coluna geoespacial indexada (GiST) em sincronia
-- com o que a aplicação já grava hoje (lat/lng do motorista, geometria JSON da zona). Nenhum código da
-- aplicação precisa mudar: quem grava lastLat/lastLng ou geometry/shape continua gravando exatamente como
-- sempre gravou, e a coluna espacial se atualiza sozinha. Ver apps/api/src/common/postgis.ts para consultas
-- prontas que usam essas colunas (ainda não ligadas no despacho/precificação — ver ARQUITETURA.md 5-K).
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────
-- Driver.geom — ponto (geography, calcula distância em metros direto) espelhando lastLat/lastLng.
-- ─────────────────────────────────────────────────────────
ALTER TABLE "Driver" ADD COLUMN "geom" geography(Point, 4326);
CREATE INDEX "Driver_geom_idx" ON "Driver" USING GIST ("geom");

CREATE OR REPLACE FUNCTION driver_sync_geom() RETURNS trigger AS $$
BEGIN
  IF NEW."lastLat" IS NOT NULL AND NEW."lastLng" IS NOT NULL THEN
    NEW."geom" := ST_SetSRID(ST_MakePoint(NEW."lastLng"::float8, NEW."lastLat"::float8), 4326)::geography;
  ELSE
    NEW."geom" := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER driver_geom_sync
  BEFORE INSERT OR UPDATE OF "lastLat", "lastLng" ON "Driver"
  FOR EACH ROW EXECUTE FUNCTION driver_sync_geom();

-- Preenche quem já tinha posição gravada (dispara o trigger acima).
UPDATE "Driver" SET "lastLat" = "lastLat";

-- ─────────────────────────────────────────────────────────
-- PricingZone.geom — geometria de verdade (círculo vira polígono via buffer) espelhando geometry/shape.
-- ─────────────────────────────────────────────────────────
ALTER TABLE "PricingZone" ADD COLUMN "geom" geometry(Geometry, 4326);
CREATE INDEX "PricingZone_geom_idx" ON "PricingZone" USING GIST ("geom");

CREATE OR REPLACE FUNCTION pricing_zone_sync_geom() RETURNS trigger AS $$
DECLARE
  ring geometry[];
BEGIN
  IF NEW."shape" = 'CIRCLE' THEN
    NEW."geom" := ST_Buffer(
      ST_SetSRID(ST_MakePoint((NEW."geometry"->'center'->>'lng')::float8, (NEW."geometry"->'center'->>'lat')::float8), 4326)::geography,
      (NEW."geometry"->>'radiusMeters')::float8
    )::geometry;
  ELSE
    SELECT ARRAY(
      SELECT ST_SetSRID(ST_MakePoint((p->>'lng')::float8, (p->>'lat')::float8), 4326)
      FROM jsonb_array_elements(NEW."geometry"->'points') AS p
    ) INTO ring;
    -- ST_MakePolygon exige o anel fechado (primeiro ponto = último); o JSON da aplicação não fecha.
    NEW."geom" := ST_MakePolygon(ST_MakeLine(ring || ring[1]));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pricing_zone_geom_sync
  BEFORE INSERT OR UPDATE OF "geometry", "shape" ON "PricingZone"
  FOR EACH ROW EXECUTE FUNCTION pricing_zone_sync_geom();

-- Preenche as zonas já cadastradas (dispara o trigger acima).
UPDATE "PricingZone" SET "geometry" = "geometry";
