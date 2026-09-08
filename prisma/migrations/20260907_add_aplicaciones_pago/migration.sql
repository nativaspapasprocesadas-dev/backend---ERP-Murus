-- Aplicaciones de pago: vincula un ABONO con los CARGO (o SALDO_INICIAL) que cancela.
-- Permite que el usuario elija que cuentas paga y que esa eleccion quede registrada;
-- cuando no se eligen cargos, el monto se aplica del mas antiguo al mas reciente (FIFO).
--
-- Compatibilidad con datos historicos: los ABONO anteriores a esta tabla no tienen
-- aplicaciones. El calculo de saldo pendiente por cargo reparte ese remanente en FIFO,
-- de modo que la suma de pendientes siempre coincide con el saldo del cliente.

CREATE TABLE "aplicaciones_pago" (
  "id"                     SERIAL PRIMARY KEY,
  "abono_id"               INTEGER NOT NULL,
  "cargo_id"               INTEGER NOT NULL,
  "monto_aplicado"         DECIMAL(12, 2) NOT NULL,
  "status"                 VARCHAR(20) DEFAULT 'active',
  "user_id_registration"   INTEGER,
  "date_time_registration" TIMESTAMPTZ DEFAULT NOW(),
  "user_id_modification"   INTEGER,
  "date_time_modification" TIMESTAMPTZ,
  CONSTRAINT "fk_aplicaciones_pago_abono" FOREIGN KEY ("abono_id")
    REFERENCES "movimientos_credito"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_aplicaciones_pago_cargo" FOREIGN KEY ("cargo_id")
    REFERENCES "movimientos_credito"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "chk_aplicaciones_pago_monto" CHECK ("monto_aplicado" > 0)
);

CREATE INDEX "idx_aplicaciones_pago_abono" ON "aplicaciones_pago"("abono_id");
CREATE INDEX "idx_aplicaciones_pago_cargo" ON "aplicaciones_pago"("cargo_id");
CREATE INDEX "idx_aplicaciones_pago_status" ON "aplicaciones_pago"("status");
