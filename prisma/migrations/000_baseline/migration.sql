-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."branches" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "address" VARCHAR(255),
    "phone" VARCHAR(50),
    "email" VARCHAR(100),
    "manager" VARCHAR(100),
    "is_main" BOOLEAN DEFAULT false,
    "color" VARCHAR(20),
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."choferes" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "telefono" VARCHAR(20),
    "licencia" VARCHAR(50),
    "fecha_vencimiento_lic" DATE,
    "branch_id" INTEGER NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "choferes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."comentarios" (
    "id" SERIAL NOT NULL,
    "entidad_tipo" VARCHAR(50) NOT NULL,
    "entidad_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "contenido" TEXT NOT NULL,
    "fecha_comentario" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."comunicado_destinatarios" (
    "id" SERIAL NOT NULL,
    "comunicado_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "comunicado_destinatarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."comunicado_lecturas" (
    "id" SERIAL NOT NULL,
    "comunicado_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "fecha_lectura" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "comunicado_lecturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."comunicados" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "contenido" TEXT NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "branch_id" INTEGER,
    "user_id_autor" INTEGER NOT NULL,
    "fecha_publicacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_expiracion" TIMESTAMPTZ(6),
    "es_urgente" BOOLEAN DEFAULT false,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "imagen_url" VARCHAR(500),

    CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."configuracion_sistema" (
    "id" SERIAL NOT NULL,
    "clave" VARCHAR(100) NOT NULL,
    "valor" TEXT NOT NULL,
    "tipo_dato" VARCHAR(20) NOT NULL,
    "descripcion" TEXT,
    "modulo" VARCHAR(50),
    "es_editable" BOOLEAN DEFAULT true,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "configuracion_sistema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."customers" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "address" VARCHAR(255),
    "route_id" INTEGER,
    "contact_name" VARCHAR(150),
    "contact_position" VARCHAR(100),
    "contact_phone" VARCHAR(50),
    "credit_days" INTEGER DEFAULT 0,
    "current_balance" DECIMAL(12,2) DEFAULT 0.00,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "customer_type" VARCHAR(20) DEFAULT 'RECURRENTE',
    "credit_limit" DECIMAL(12,2) DEFAULT 10000.00,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."especies" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "especies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."medidas" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "abreviatura" VARCHAR(10) NOT NULL,
    "factor_conversion" DECIMAL(10,4),
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "medidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."movimientos_credito" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "pedido_id" INTEGER,
    "tipo_movimiento" VARCHAR(20) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "saldo_anterior" DECIMAL(12,2) NOT NULL,
    "saldo_nuevo" DECIMAL(12,2) NOT NULL,
    "descripcion" TEXT,
    "fecha_movimiento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "voucher_url" VARCHAR(500),
    "metodo_pago" VARCHAR(20),
    "referencia_pago" VARCHAR(100),

    CONSTRAINT "movimientos_credito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pedido_detalles" (
    "id" SERIAL NOT NULL,
    "pedido_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "descuento_linea" DECIMAL(10,2) DEFAULT 0,
    "subtotal_linea" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "pedido_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pedidos" (
    "id" SERIAL NOT NULL,
    "numero_pedido" VARCHAR(30) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "user_id_vendedor" INTEGER NOT NULL,
    "fecha_pedido" DATE NOT NULL,
    "fecha_entrega" DATE,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    "tipo_pedido" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,
    "ruta_diaria_id" INTEGER,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "voucher_url" VARCHAR(500),
    "estado_pago" VARCHAR(20) DEFAULT 'PENDIENTE',
    "tipo_pago" VARCHAR(20),
    "pago_anticipado" BOOLEAN DEFAULT false,

    CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "module" VARCHAR(100),
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pizarra_produccion" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "especie_id" INTEGER NOT NULL,
    "medida_id" INTEGER NOT NULL,
    "presentacion_id" INTEGER NOT NULL,
    "ruta_config_id" INTEGER,
    "cantidad_solicitada" DECIMAL(10,2) NOT NULL,
    "cantidad_producida" DECIMAL(10,2) DEFAULT 0,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    "prioridad" INTEGER DEFAULT 0,
    "observaciones" TEXT,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "pizarra_produccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."precios_cliente" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "precio_especial" DECIMAL(10,2) NOT NULL,
    "fecha_inicio" DATE,
    "fecha_fin" DATE,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "precios_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."presentaciones" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "presentaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."productos" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(50) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "especie_id" INTEGER NOT NULL,
    "medida_id" INTEGER NOT NULL,
    "presentacion_id" INTEGER NOT NULL,
    "precio_base" DECIMAL(10,2) NOT NULL,
    "stock_actual" DECIMAL(10,2) DEFAULT 0,
    "stock_minimo" DECIMAL(10,2) DEFAULT 0,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "imagen_url" VARCHAR(500),
    "visible_en_catalogo" BOOLEAN DEFAULT true,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roles_permissions" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "roles_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rutas_config" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "branch_id" INTEGER NOT NULL,
    "dia_semana" INTEGER,
    "orden" INTEGER DEFAULT 0,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "color" VARCHAR(7) DEFAULT '#3B82F6',
    "hora_limite_recepcion" VARCHAR(10),

    CONSTRAINT "rutas_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rutas_diarias" (
    "id" SERIAL NOT NULL,
    "ruta_config_id" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" VARCHAR(30) NOT NULL DEFAULT 'pendiente',
    "hora_inicio" TIMESTAMPTZ(6),
    "hora_fin" TIMESTAMPTZ(6),
    "kilometraje_inicio" DECIMAL(10,2),
    "kilometraje_fin" DECIMAL(10,2),
    "observaciones" TEXT,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),
    "chofer_id" INTEGER,

    CONSTRAINT "rutas_diarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "is_valid" BOOLEAN DEFAULT true,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role_id" INTEGER NOT NULL,
    "phone" VARCHAR(50),
    "is_active" BOOLEAN DEFAULT true,
    "branch_id" INTEGER,
    "status" VARCHAR(20) DEFAULT 'active',
    "user_id_registration" INTEGER,
    "date_time_registration" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "user_id_modification" INTEGER,
    "date_time_modification" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "public"."branches"("code" ASC);

-- CreateIndex
CREATE INDEX "idx_branches_code" ON "public"."branches"("code" ASC);

-- CreateIndex
CREATE INDEX "idx_branches_is_main" ON "public"."branches"("is_main" ASC);

-- CreateIndex
CREATE INDEX "idx_branches_status" ON "public"."branches"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_choferes_branch_id" ON "public"."choferes"("branch_id" ASC);

-- CreateIndex
CREATE INDEX "idx_choferes_status" ON "public"."choferes"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_comentarios_entidad" ON "public"."comentarios"("entidad_tipo" ASC, "entidad_id" ASC);

-- CreateIndex
CREATE INDEX "idx_comentarios_status" ON "public"."comentarios"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_comentarios_user_id" ON "public"."comentarios"("user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicado_destinatarios_comunicado_id" ON "public"."comunicado_destinatarios"("comunicado_id" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicado_destinatarios_customer_id" ON "public"."comunicado_destinatarios"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicado_destinatarios_status" ON "public"."comunicado_destinatarios"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uk_comunicado_destinatarios" ON "public"."comunicado_destinatarios"("comunicado_id" ASC, "customer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicado_lecturas_comunicado_id" ON "public"."comunicado_lecturas"("comunicado_id" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicado_lecturas_customer_id" ON "public"."comunicado_lecturas"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicado_lecturas_fecha" ON "public"."comunicado_lecturas"("fecha_lectura" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicado_lecturas_status" ON "public"."comunicado_lecturas"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uk_comunicado_lecturas" ON "public"."comunicado_lecturas"("comunicado_id" ASC, "customer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicados_branch_id" ON "public"."comunicados"("branch_id" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicados_fecha_publicacion" ON "public"."comunicados"("fecha_publicacion" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicados_status" ON "public"."comunicados"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicados_tipo" ON "public"."comunicados"("tipo" ASC);

-- CreateIndex
CREATE INDEX "idx_comunicados_user_id_autor" ON "public"."comunicados"("user_id_autor" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_sistema_clave_key" ON "public"."configuracion_sistema"("clave" ASC);

-- CreateIndex
CREATE INDEX "idx_configuracion_sistema_clave" ON "public"."configuracion_sistema"("clave" ASC);

-- CreateIndex
CREATE INDEX "idx_configuracion_sistema_modulo" ON "public"."configuracion_sistema"("modulo" ASC);

-- CreateIndex
CREATE INDEX "idx_configuracion_sistema_status" ON "public"."configuracion_sistema"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "customers_user_id_key" ON "public"."customers"("user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_customers_route_id" ON "public"."customers"("route_id" ASC);

-- CreateIndex
CREATE INDEX "idx_customers_status" ON "public"."customers"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_customers_type" ON "public"."customers"("customer_type" ASC);

-- CreateIndex
CREATE INDEX "idx_customers_user_id" ON "public"."customers"("user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_especies_nombre" ON "public"."especies"("nombre" ASC);

-- CreateIndex
CREATE INDEX "idx_especies_status" ON "public"."especies"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_medidas_nombre" ON "public"."medidas"("nombre" ASC);

-- CreateIndex
CREATE INDEX "idx_medidas_status" ON "public"."medidas"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_movimientos_credito_customer_id" ON "public"."movimientos_credito"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_movimientos_credito_fecha" ON "public"."movimientos_credito"("fecha_movimiento" ASC);

-- CreateIndex
CREATE INDEX "idx_movimientos_credito_pedido_id" ON "public"."movimientos_credito"("pedido_id" ASC);

-- CreateIndex
CREATE INDEX "idx_movimientos_credito_status" ON "public"."movimientos_credito"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_movimientos_credito_tipo" ON "public"."movimientos_credito"("tipo_movimiento" ASC);

-- CreateIndex
CREATE INDEX "idx_movimientos_metodo_pago" ON "public"."movimientos_credito"("metodo_pago" ASC);

-- CreateIndex
CREATE INDEX "idx_pedido_detalles_pedido_id" ON "public"."pedido_detalles"("pedido_id" ASC);

-- CreateIndex
CREATE INDEX "idx_pedido_detalles_producto_id" ON "public"."pedido_detalles"("producto_id" ASC);

-- CreateIndex
CREATE INDEX "idx_pedido_detalles_status" ON "public"."pedido_detalles"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_pedidos_branch_id" ON "public"."pedidos"("branch_id" ASC);

-- CreateIndex
CREATE INDEX "idx_pedidos_customer_id" ON "public"."pedidos"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_pedidos_estado" ON "public"."pedidos"("estado" ASC);

-- CreateIndex
CREATE INDEX "idx_pedidos_estado_pago" ON "public"."pedidos"("estado_pago" ASC);

-- CreateIndex
CREATE INDEX "idx_pedidos_fecha_pedido" ON "public"."pedidos"("fecha_pedido" ASC);

-- CreateIndex
CREATE INDEX "idx_pedidos_ruta_diaria_id" ON "public"."pedidos"("ruta_diaria_id" ASC);

-- CreateIndex
CREATE INDEX "idx_pedidos_status" ON "public"."pedidos"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_pedidos_tipo_pago" ON "public"."pedidos"("tipo_pago" ASC);

-- CreateIndex
CREATE INDEX "idx_pedidos_user_id_vendedor" ON "public"."pedidos"("user_id_vendedor" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_numero_pedido_key" ON "public"."pedidos"("numero_pedido" ASC);

-- CreateIndex
CREATE INDEX "idx_permissions_module" ON "public"."permissions"("module" ASC);

-- CreateIndex
CREATE INDEX "idx_permissions_name" ON "public"."permissions"("name" ASC);

-- CreateIndex
CREATE INDEX "idx_permissions_status" ON "public"."permissions"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "public"."permissions"("name" ASC);

-- CreateIndex
CREATE INDEX "idx_pizarra_produccion_especie_id" ON "public"."pizarra_produccion"("especie_id" ASC);

-- CreateIndex
CREATE INDEX "idx_pizarra_produccion_estado" ON "public"."pizarra_produccion"("estado" ASC);

-- CreateIndex
CREATE INDEX "idx_pizarra_produccion_fecha" ON "public"."pizarra_produccion"("fecha" ASC);

-- CreateIndex
CREATE INDEX "idx_pizarra_produccion_status" ON "public"."pizarra_produccion"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_precios_cliente_customer_id" ON "public"."precios_cliente"("customer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_precios_cliente_producto_id" ON "public"."precios_cliente"("producto_id" ASC);

-- CreateIndex
CREATE INDEX "idx_precios_cliente_status" ON "public"."precios_cliente"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uk_precios_cliente" ON "public"."precios_cliente"("customer_id" ASC, "producto_id" ASC);

-- CreateIndex
CREATE INDEX "idx_presentaciones_nombre" ON "public"."presentaciones"("nombre" ASC);

-- CreateIndex
CREATE INDEX "idx_presentaciones_status" ON "public"."presentaciones"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_productos_codigo" ON "public"."productos"("codigo" ASC);

-- CreateIndex
CREATE INDEX "idx_productos_especie_id" ON "public"."productos"("especie_id" ASC);

-- CreateIndex
CREATE INDEX "idx_productos_medida_id" ON "public"."productos"("medida_id" ASC);

-- CreateIndex
CREATE INDEX "idx_productos_presentacion_id" ON "public"."productos"("presentacion_id" ASC);

-- CreateIndex
CREATE INDEX "idx_productos_status" ON "public"."productos"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_productos_visible_catalogo" ON "public"."productos"("visible_en_catalogo" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_key" ON "public"."productos"("codigo" ASC);

-- CreateIndex
CREATE INDEX "idx_roles_name" ON "public"."roles"("name" ASC);

-- CreateIndex
CREATE INDEX "idx_roles_status" ON "public"."roles"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "public"."roles"("name" ASC);

-- CreateIndex
CREATE INDEX "idx_roles_permissions_permission_id" ON "public"."roles_permissions"("permission_id" ASC);

-- CreateIndex
CREATE INDEX "idx_roles_permissions_role_id" ON "public"."roles_permissions"("role_id" ASC);

-- CreateIndex
CREATE INDEX "idx_roles_permissions_status" ON "public"."roles_permissions"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "uk_roles_permissions" ON "public"."roles_permissions"("role_id" ASC, "permission_id" ASC);

-- CreateIndex
CREATE INDEX "idx_rutas_config_branch_id" ON "public"."rutas_config"("branch_id" ASC);

-- CreateIndex
CREATE INDEX "idx_rutas_config_nombre" ON "public"."rutas_config"("nombre" ASC);

-- CreateIndex
CREATE INDEX "idx_rutas_config_status" ON "public"."rutas_config"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_rutas_diarias_chofer_id" ON "public"."rutas_diarias"("chofer_id" ASC);

-- CreateIndex
CREATE INDEX "idx_rutas_diarias_estado" ON "public"."rutas_diarias"("estado" ASC);

-- CreateIndex
CREATE INDEX "idx_rutas_diarias_fecha" ON "public"."rutas_diarias"("fecha" ASC);

-- CreateIndex
CREATE INDEX "idx_rutas_diarias_ruta_config_id" ON "public"."rutas_diarias"("ruta_config_id" ASC);

-- CreateIndex
CREATE INDEX "idx_rutas_diarias_status" ON "public"."rutas_diarias"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_user_sessions_expires_at" ON "public"."user_sessions"("expires_at" ASC);

-- CreateIndex
CREATE INDEX "idx_user_sessions_is_valid" ON "public"."user_sessions"("is_valid" ASC);

-- CreateIndex
CREATE INDEX "idx_user_sessions_status" ON "public"."user_sessions"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_user_sessions_token" ON "public"."user_sessions"("token" ASC);

-- CreateIndex
CREATE INDEX "idx_user_sessions_user_id" ON "public"."user_sessions"("user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_users_branch_id" ON "public"."users"("branch_id" ASC);

-- CreateIndex
CREATE INDEX "idx_users_email" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE INDEX "idx_users_is_active" ON "public"."users"("is_active" ASC);

-- CreateIndex
CREATE INDEX "idx_users_role_id" ON "public"."users"("role_id" ASC);

-- CreateIndex
CREATE INDEX "idx_users_status" ON "public"."users"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."comunicado_destinatarios" ADD CONSTRAINT "fk_comunicado_destinatarios_comunicado" FOREIGN KEY ("comunicado_id") REFERENCES "public"."comunicados"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."comunicado_lecturas" ADD CONSTRAINT "fk_comunicado_lecturas_comunicado" FOREIGN KEY ("comunicado_id") REFERENCES "public"."comunicados"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."customers" ADD CONSTRAINT "fk_customers_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."movimientos_credito" ADD CONSTRAINT "fk_movimientos_credito_pedido" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."pedido_detalles" ADD CONSTRAINT "fk_pedido_detalles_pedido" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."pedido_detalles" ADD CONSTRAINT "fk_pedido_detalles_producto" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."pedidos" ADD CONSTRAINT "fk_pedidos_ruta_diaria" FOREIGN KEY ("ruta_diaria_id") REFERENCES "public"."rutas_diarias"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."precios_cliente" ADD CONSTRAINT "fk_precios_cliente_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."precios_cliente" ADD CONSTRAINT "fk_precios_cliente_producto" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."productos" ADD CONSTRAINT "fk_productos_especie" FOREIGN KEY ("especie_id") REFERENCES "public"."especies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."productos" ADD CONSTRAINT "fk_productos_medida" FOREIGN KEY ("medida_id") REFERENCES "public"."medidas"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."productos" ADD CONSTRAINT "fk_productos_presentacion" FOREIGN KEY ("presentacion_id") REFERENCES "public"."presentaciones"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."roles_permissions" ADD CONSTRAINT "fk_roles_permissions_permission" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."roles_permissions" ADD CONSTRAINT "fk_roles_permissions_role" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."rutas_diarias" ADD CONSTRAINT "fk_rutas_diarias_ruta_config" FOREIGN KEY ("ruta_config_id") REFERENCES "public"."rutas_config"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."rutas_diarias" ADD CONSTRAINT "rutas_diarias_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "public"."choferes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."user_sessions" ADD CONSTRAINT "fk_user_sessions_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "fk_users_branch" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "fk_users_role" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

