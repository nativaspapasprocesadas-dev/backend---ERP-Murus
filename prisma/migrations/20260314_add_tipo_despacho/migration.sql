-- Agregar campo tipo_despacho a la tabla pedidos
-- Valores: RUTA (delivery propio), TAXI (taxi/delivery externo), RECOJO (recojo en planta), OTRO
ALTER TABLE "pedidos" ADD COLUMN "tipo_despacho" VARCHAR(20) DEFAULT 'RUTA';

-- Índice para consultas por tipo de despacho
CREATE INDEX "idx_pedidos_tipo_despacho" ON "pedidos"("tipo_despacho");

-- Migración de datos existentes: inferir tipo de despacho basado en ruta asignada
-- Pedidos con ruta asignada → RUTA (ya es el default)
-- Pedidos sin ruta → se dejan como RUTA por default (no hay forma de inferir si fueron taxi/recojo)
