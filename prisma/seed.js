const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed MINIMO para ERP Papas...\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   Este seed contiene SOLO los datos estructurales necesarios');
  console.log('   para que el sistema funcione desde cero.');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ============================================
  // 1. ROLES
  // Sistema RBAC - Sin roles no hay control de acceso
  // ============================================
  console.log('📋 Creando roles...');
  await prisma.roles.createMany({
    data: [
      {
        id: 1,
        name: 'ADMINISTRADOR',
        description: 'Administrador de sede con acceso completo a funciones administrativas',
        user_id_registration: 1
      },
      {
        id: 2,
        name: 'SUPERADMINISTRADOR',
        description: 'Super Administrador con acceso total al sistema y todas las sedes',
        user_id_registration: 1
      },
      {
        id: 3,
        name: 'COORDINADOR',
        description: 'Coordinador de operaciones con acceso a rutas, clientes y pagos',
        user_id_registration: 1
      },
      {
        id: 4,
        name: 'PRODUCCION',
        description: 'Usuario de produccion con acceso a vista de pedidos y produccion',
        user_id_registration: 1
      },
      {
        id: 5,
        name: 'CLIENTE',
        description: 'Cliente externo con acceso a catalogo y sus pedidos',
        user_id_registration: 1
      }
    ],
    skipDuplicates: true
  });
  console.log('✅ Roles creados (5)\n');

  // ============================================
  // 2. PERMISSIONS
  // Sistema RBAC - Define que puede hacer cada rol
  // ============================================
  console.log('🔐 Creando permisos...');
  await prisma.permissions.createMany({
    data: [
      // PERMISOS ADMINISTRADOR (1-27)
      { id: 1, name: 'administrador.dashboard', description: 'Acceso al dashboard de administrador', module: 'dashboard', user_id_registration: 1 },
      { id: 2, name: 'administrador.users.create', description: 'Crear usuarios', module: 'users', user_id_registration: 1 },
      { id: 3, name: 'administrador.users.read', description: 'Ver usuarios', module: 'users', user_id_registration: 1 },
      { id: 4, name: 'administrador.users.update', description: 'Actualizar usuarios', module: 'users', user_id_registration: 1 },
      { id: 5, name: 'administrador.users.delete', description: 'Eliminar usuarios', module: 'users', user_id_registration: 1 },
      { id: 6, name: 'administrador.clients.create', description: 'Crear clientes', module: 'clients', user_id_registration: 1 },
      { id: 7, name: 'administrador.clients.read', description: 'Ver clientes', module: 'clients', user_id_registration: 1 },
      { id: 8, name: 'administrador.clients.update', description: 'Actualizar clientes', module: 'clients', user_id_registration: 1 },
      { id: 9, name: 'administrador.clients.delete', description: 'Eliminar clientes', module: 'clients', user_id_registration: 1 },
      { id: 10, name: 'administrador.products.create', description: 'Crear productos', module: 'products', user_id_registration: 1 },
      { id: 11, name: 'administrador.products.read', description: 'Ver productos', module: 'products', user_id_registration: 1 },
      { id: 12, name: 'administrador.products.update', description: 'Actualizar productos', module: 'products', user_id_registration: 1 },
      { id: 13, name: 'administrador.products.delete', description: 'Eliminar productos', module: 'products', user_id_registration: 1 },
      { id: 14, name: 'administrador.prices.manage', description: 'Gestionar precios', module: 'prices', user_id_registration: 1 },
      { id: 15, name: 'administrador.orders.view_all', description: 'Ver todos los pedidos', module: 'orders', user_id_registration: 1 },
      { id: 16, name: 'administrador.routes.assign', description: 'Asignar rutas', module: 'routes', user_id_registration: 1 },
      { id: 17, name: 'administrador.credits.manage', description: 'Gestionar creditos', module: 'credits', user_id_registration: 1 },
      { id: 18, name: 'administrador.payments.register', description: 'Registrar pagos', module: 'payments', user_id_registration: 1 },
      { id: 19, name: 'administrador.reports.view', description: 'Ver reportes', module: 'reports', user_id_registration: 1 },
      { id: 20, name: 'administrador.export.pdf', description: 'Exportar PDF', module: 'export', user_id_registration: 1 },
      { id: 21, name: 'administrador.production.view', description: 'Ver produccion', module: 'production', user_id_registration: 1 },
      { id: 22, name: 'administrador.production.complete', description: 'Marcar como completado', module: 'production', user_id_registration: 1 },
      { id: 23, name: 'administrador.alerts.configure', description: 'Configurar alertas', module: 'alerts', user_id_registration: 1 },
      { id: 24, name: 'administrador.comments.orders', description: 'Comentar en pedidos', module: 'comments', user_id_registration: 1 },
      { id: 25, name: 'administrador.comments.routes', description: 'Comentar en rutas', module: 'comments', user_id_registration: 1 },
      { id: 26, name: 'administrador.comments.production', description: 'Comentar en produccion', module: 'comments', user_id_registration: 1 },
      { id: 27, name: 'administrador.comments.clients', description: 'Comentar en clientes', module: 'comments', user_id_registration: 1 },

      // PERMISOS SUPERADMINISTRADOR (28-56)
      { id: 28, name: 'superadministrador.dashboard', description: 'Acceso al dashboard de superadmin', module: 'dashboard', user_id_registration: 1 },
      { id: 29, name: 'superadministrador.branches.manage', description: 'Gestionar sedes', module: 'branches', user_id_registration: 1 },
      { id: 30, name: 'superadministrador.branches.view_all', description: 'Ver todas las sedes', module: 'branches', user_id_registration: 1 },
      { id: 31, name: 'superadministrador.users.create', description: 'Crear usuarios', module: 'users', user_id_registration: 1 },
      { id: 32, name: 'superadministrador.users.read', description: 'Ver usuarios', module: 'users', user_id_registration: 1 },
      { id: 33, name: 'superadministrador.users.update', description: 'Actualizar usuarios', module: 'users', user_id_registration: 1 },
      { id: 34, name: 'superadministrador.users.delete', description: 'Eliminar usuarios', module: 'users', user_id_registration: 1 },
      { id: 35, name: 'superadministrador.clients.create', description: 'Crear clientes', module: 'clients', user_id_registration: 1 },
      { id: 36, name: 'superadministrador.clients.read', description: 'Ver clientes', module: 'clients', user_id_registration: 1 },
      { id: 37, name: 'superadministrador.clients.update', description: 'Actualizar clientes', module: 'clients', user_id_registration: 1 },
      { id: 38, name: 'superadministrador.clients.delete', description: 'Eliminar clientes', module: 'clients', user_id_registration: 1 },
      { id: 39, name: 'superadministrador.products.create', description: 'Crear productos', module: 'products', user_id_registration: 1 },
      { id: 40, name: 'superadministrador.products.read', description: 'Ver productos', module: 'products', user_id_registration: 1 },
      { id: 41, name: 'superadministrador.products.update', description: 'Actualizar productos', module: 'products', user_id_registration: 1 },
      { id: 42, name: 'superadministrador.products.delete', description: 'Eliminar productos', module: 'products', user_id_registration: 1 },
      { id: 43, name: 'superadministrador.prices.manage', description: 'Gestionar precios', module: 'prices', user_id_registration: 1 },
      { id: 44, name: 'superadministrador.orders.view_all', description: 'Ver todos los pedidos', module: 'orders', user_id_registration: 1 },
      { id: 45, name: 'superadministrador.routes.assign', description: 'Asignar rutas', module: 'routes', user_id_registration: 1 },
      { id: 46, name: 'superadministrador.credits.manage', description: 'Gestionar creditos', module: 'credits', user_id_registration: 1 },
      { id: 47, name: 'superadministrador.payments.register', description: 'Registrar pagos', module: 'payments', user_id_registration: 1 },
      { id: 48, name: 'superadministrador.reports.view', description: 'Ver reportes', module: 'reports', user_id_registration: 1 },
      { id: 49, name: 'superadministrador.export.pdf', description: 'Exportar PDF', module: 'export', user_id_registration: 1 },
      { id: 50, name: 'superadministrador.production.view', description: 'Ver produccion', module: 'production', user_id_registration: 1 },
      { id: 51, name: 'superadministrador.production.complete', description: 'Marcar como completado', module: 'production', user_id_registration: 1 },
      { id: 52, name: 'superadministrador.alerts.configure', description: 'Configurar alertas', module: 'alerts', user_id_registration: 1 },
      { id: 53, name: 'superadministrador.comments.orders', description: 'Comentar en pedidos', module: 'comments', user_id_registration: 1 },
      { id: 54, name: 'superadministrador.comments.routes', description: 'Comentar en rutas', module: 'comments', user_id_registration: 1 },
      { id: 55, name: 'superadministrador.comments.production', description: 'Comentar en produccion', module: 'comments', user_id_registration: 1 },
      { id: 56, name: 'superadministrador.comments.clients', description: 'Comentar en clientes', module: 'comments', user_id_registration: 1 },

      // PERMISOS COORDINADOR (57-67)
      { id: 57, name: 'coordinador.dashboard', description: 'Acceso al dashboard de coordinador', module: 'dashboard', user_id_registration: 1 },
      { id: 58, name: 'coordinador.clients.create', description: 'Crear clientes', module: 'clients', user_id_registration: 1 },
      { id: 59, name: 'coordinador.clients.read', description: 'Ver clientes', module: 'clients', user_id_registration: 1 },
      { id: 60, name: 'coordinador.clients.update', description: 'Actualizar clientes', module: 'clients', user_id_registration: 1 },
      { id: 61, name: 'coordinador.orders.view_all', description: 'Ver todos los pedidos', module: 'orders', user_id_registration: 1 },
      { id: 62, name: 'coordinador.routes.assign', description: 'Asignar rutas', module: 'routes', user_id_registration: 1 },
      { id: 63, name: 'coordinador.credits.manage', description: 'Gestionar creditos', module: 'credits', user_id_registration: 1 },
      { id: 64, name: 'coordinador.payments.register', description: 'Registrar pagos', module: 'payments', user_id_registration: 1 },
      { id: 65, name: 'coordinador.export.pdf', description: 'Exportar PDF', module: 'export', user_id_registration: 1 },
      { id: 66, name: 'coordinador.comments.routes', description: 'Comentar en rutas', module: 'comments', user_id_registration: 1 },
      { id: 67, name: 'coordinador.comments.clients', description: 'Comentar en clientes', module: 'comments', user_id_registration: 1 },

      // PERMISOS PRODUCCION (68-73)
      { id: 68, name: 'produccion.dashboard', description: 'Acceso al dashboard de produccion', module: 'dashboard', user_id_registration: 1 },
      { id: 69, name: 'produccion.orders.view_all', description: 'Ver todos los pedidos', module: 'orders', user_id_registration: 1 },
      { id: 70, name: 'produccion.production.view', description: 'Ver produccion', module: 'production', user_id_registration: 1 },
      { id: 71, name: 'produccion.production.complete', description: 'Marcar como completado', module: 'production', user_id_registration: 1 },
      { id: 72, name: 'produccion.comments.orders', description: 'Comentar en pedidos', module: 'comments', user_id_registration: 1 },
      { id: 73, name: 'produccion.comments.production', description: 'Comentar en produccion', module: 'comments', user_id_registration: 1 },

      // PERMISOS CLIENTE (74-79)
      { id: 74, name: 'cliente.dashboard', description: 'Acceso al dashboard de cliente', module: 'dashboard', user_id_registration: 1 },
      { id: 75, name: 'cliente.catalog.view', description: 'Ver catalogo de productos', module: 'catalog', user_id_registration: 1 },
      { id: 76, name: 'cliente.orders.own', description: 'Ver sus propios pedidos', module: 'orders', user_id_registration: 1 },
      { id: 77, name: 'cliente.orders.create', description: 'Crear pedidos', module: 'orders', user_id_registration: 1 },
      { id: 78, name: 'cliente.credits.own', description: 'Ver su estado de credito', module: 'credits', user_id_registration: 1 },
      { id: 79, name: 'cliente.announcements.view', description: 'Ver comunicados', module: 'announcements', user_id_registration: 1 }
    ],
    skipDuplicates: true
  });
  console.log('✅ Permisos creados (79)\n');

  // ============================================
  // 3. BRANCHES (Sedes)
  // Minimo 1 sede para asignar usuarios
  // ============================================
  console.log('🏢 Creando sede principal...');
  await prisma.branches.createMany({
    data: [
      {
        id: 1,
        name: 'Sede Principal',
        code: 'MAIN',
        address: 'Direccion por configurar',
        phone: '000-000-0000',
        email: 'sede@empresa.com',
        manager: 'Por asignar',
        is_main: true,
        color: '#14B8A6',
        status: 'active',
        user_id_registration: 1
      }
    ],
    skipDuplicates: true
  });
  console.log('✅ Sede principal creada (1)\n');

  // ============================================
  // 4. ROLES_PERMISSIONS
  // Sistema RBAC - Mapeo rol<->permiso
  // ============================================
  console.log('🔗 Asignando permisos a roles...');

  const rolesPermissionsData = [];
  let rpId = 1;

  // ADMINISTRADOR (role_id: 1) - permisos 1-27
  for (let i = 1; i <= 27; i++) {
    rolesPermissionsData.push({ id: rpId++, role_id: 1, permission_id: i, status: 'active', user_id_registration: 1 });
  }

  // SUPERADMINISTRADOR (role_id: 2) - todos los permisos admin + super
  for (let i = 1; i <= 27; i++) {
    rolesPermissionsData.push({ id: rpId++, role_id: 2, permission_id: i, status: 'active', user_id_registration: 1 });
  }
  for (let i = 28; i <= 56; i++) {
    rolesPermissionsData.push({ id: rpId++, role_id: 2, permission_id: i, status: 'active', user_id_registration: 1 });
  }

  // COORDINADOR (role_id: 3) - permisos 57-67
  for (let i = 57; i <= 67; i++) {
    rolesPermissionsData.push({ id: rpId++, role_id: 3, permission_id: i, status: 'active', user_id_registration: 1 });
  }

  // PRODUCCION (role_id: 4) - permisos 68-73
  for (let i = 68; i <= 73; i++) {
    rolesPermissionsData.push({ id: rpId++, role_id: 4, permission_id: i, status: 'active', user_id_registration: 1 });
  }

  // CLIENTE (role_id: 5) - permisos 74-79
  for (let i = 74; i <= 79; i++) {
    rolesPermissionsData.push({ id: rpId++, role_id: 5, permission_id: i, status: 'active', user_id_registration: 1 });
  }

  await prisma.roles_permissions.createMany({
    data: rolesPermissionsData,
    skipDuplicates: true
  });
  console.log('✅ Permisos asignados a roles (106)\n');

  // ============================================
  // 5. USERS
  // Minimo 1 SuperAdmin para acceder al sistema
  // ============================================
  console.log('👤 Creando usuario SuperAdministrador...');

  const passwordHash = await bcrypt.hash('123456', 10);

  await prisma.users.createMany({
    data: [
      {
        id: 1,
        name: 'Super Administrador',
        email: 'super@admin.com',
        password: passwordHash,
        role_id: 2,
        phone: '999999999',
        is_active: true,
        branch_id: null,
        status: 'active',
        user_id_registration: 1
      }
    ],
    skipDuplicates: true
  });
  console.log('✅ Usuario SuperAdmin creado (1)\n');

  // ============================================
  // 6. CONFIGURACION_SISTEMA
  // Parametros del sistema (WhatsApp, creditos, empresa)
  // ============================================
  console.log('⚙️ Creando configuracion del sistema...');
  await prisma.configuracion_sistema.createMany({
    data: [
      // Modulo: creditos (3 registros)
      { id: 1, clave: 'credito_alerta_dias_vencimiento', valor: '7', tipo_dato: 'integer', descripcion: 'Dias antes del vencimiento para enviar alerta', modulo: 'creditos', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 2, clave: 'credito_monto_alto_global', valor: '1000', tipo_dato: 'decimal', descripcion: 'Monto de deuda que dispara alerta (no bloquea pedidos, solo notifica)', modulo: 'creditos', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 3, clave: 'credito_interes_mora', valor: '0', tipo_dato: 'decimal', descripcion: 'Porcentaje de interes por mora', modulo: 'creditos', es_editable: true, status: 'active', user_id_registration: 1 },
      // Modulo: general (14 registros)
      { id: 4, clave: 'empresa_nombre', valor: 'Mi Empresa S.A.C.', tipo_dato: 'string', descripcion: 'Nombre de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 5, clave: 'empresa_razon_social', valor: '', tipo_dato: 'string', descripcion: 'Razon social de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 6, clave: 'empresa_nombre_comercial', valor: '', tipo_dato: 'string', descripcion: 'Nombre comercial de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 7, clave: 'empresa_ruc', valor: '00000000000', tipo_dato: 'string', descripcion: 'RUC de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 8, clave: 'empresa_direccion', valor: '', tipo_dato: 'string', descripcion: 'Direccion de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 9, clave: 'empresa_telefono', valor: '', tipo_dato: 'string', descripcion: 'Telefono de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 10, clave: 'empresa_celular', valor: '', tipo_dato: 'string', descripcion: 'Celular de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 11, clave: 'empresa_email', valor: '', tipo_dato: 'string', descripcion: 'Email de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 12, clave: 'empresa_registro_sanitario', valor: '', tipo_dato: 'string', descripcion: 'Registro sanitario de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 13, clave: 'empresa_logo_url', valor: '/logoPapas.png', tipo_dato: 'string', descripcion: 'URL del logo de la empresa', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 14, clave: 'horario_fin', valor: '18:00', tipo_dato: 'string', descripcion: 'Hora de fin de operaciones', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 15, clave: 'horario_inicio', valor: '06:00', tipo_dato: 'string', descripcion: 'Hora de inicio de operaciones', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 16, clave: 'igv_porcentaje', valor: '18', tipo_dato: 'integer', descripcion: 'Porcentaje de IGV', modulo: 'general', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 17, clave: 'moneda_simbolo', valor: 'S/', tipo_dato: 'string', descripcion: 'Simbolo de moneda', modulo: 'general', es_editable: false, status: 'active', user_id_registration: 1 },
      // Modulo: social (3 registros)
      { id: 18, clave: 'social_facebook', valor: '', tipo_dato: 'string', descripcion: 'URL de Facebook', modulo: 'social', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 19, clave: 'social_instagram', valor: '', tipo_dato: 'string', descripcion: 'URL de Instagram', modulo: 'social', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 20, clave: 'social_tiktok', valor: '', tipo_dato: 'string', descripcion: 'URL de TikTok', modulo: 'social', es_editable: true, status: 'active', user_id_registration: 1 },
      // Modulo: whatsapp (6 registros)
      { id: 21, clave: 'whatsapp_habilitado', valor: 'true', tipo_dato: 'boolean', descripcion: 'Habilitar envio de mensajes por WhatsApp', modulo: 'whatsapp', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 22, clave: 'whatsapp_mensaje_header', valor: 'Estimado cliente, le enviamos la siguiente informacion:', tipo_dato: 'string', descripcion: 'Encabezado de mensajes de WhatsApp', modulo: 'whatsapp', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 23, clave: 'whatsapp_mensaje_modificaciones', valor: 'Su pedido #{numero_pedido} ha sido modificado. Nuevo total: S/ {total}', tipo_dato: 'string', descripcion: 'Plantilla de mensaje para notificar modificaciones de pedido', modulo: 'whatsapp', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 24, clave: 'whatsapp_mensaje_pedido', valor: 'Hola! Gracias por tu pedido #{numero_pedido}. Total: S/ {total}. Entrega estimada: {fecha_entrega}', tipo_dato: 'string', descripcion: 'Plantilla de mensaje para confirmacion de pedido', modulo: 'whatsapp', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 25, clave: 'whatsapp_mensaje_ruta_salida', valor: 'Su pedido #{numero_pedido} salio en ruta. Chofer: {chofer}. Ruta: {ruta}', tipo_dato: 'string', descripcion: 'Plantilla de mensaje cuando el pedido sale en ruta', modulo: 'whatsapp', es_editable: true, status: 'active', user_id_registration: 1 },
      { id: 26, clave: 'whatsapp_numero_empresa', valor: '', tipo_dato: 'string', descripcion: 'Numero de WhatsApp de la empresa', modulo: 'whatsapp', es_editable: true, status: 'active', user_id_registration: 1 }
    ],
    skipDuplicates: true
  });
  console.log('✅ Configuracion del sistema creada (26)\n');

  // ============================================
  // SINCRONIZAR SECUENCIAS
  // ============================================
  console.log('🔄 Sincronizando secuencias de IDs...');
  const tablesToSync = [
    'roles', 'permissions', 'roles_permissions', 'branches', 'users', 'configuracion_sistema'
  ];

  for (const table of tablesToSync) {
    try {
      await prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('${table}', 'id'),
          COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1,
          false
        )
      `);
    } catch (e) {
      // Ignorar errores si la tabla no tiene secuencia
    }
  }
  console.log('✅ Secuencias sincronizadas\n');

  // ============================================
  // RESUMEN FINAL
  // ============================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎉 SEED MINIMO EJECUTADO EXITOSAMENTE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('📊 Resumen de datos creados:');
  console.log('   ┌────────────────────────────────┬───────────┐');
  console.log('   │ Tabla                          │ Registros │');
  console.log('   ├────────────────────────────────┼───────────┤');
  console.log('   │ roles                          │     5     │');
  console.log('   │ permissions                    │    79     │');
  console.log('   │ roles_permissions              │   106     │');
  console.log('   │ branches                       │     1     │');
  console.log('   │ users                          │     1     │');
  console.log('   │ configuracion_sistema          │    26     │');
  console.log('   ├────────────────────────────────┼───────────┤');
  console.log('   │ TOTAL                          │   218     │');
  console.log('   └────────────────────────────────┴───────────┘\n');

  console.log('🔑 CREDENCIALES DE ACCESO INICIAL:');
  console.log('   ┌──────────────────────┬────────────────────────────────┐');
  console.log('   │ Campo                │ Valor                          │');
  console.log('   ├──────────────────────┼────────────────────────────────┤');
  console.log('   │ Email                │ super@admin.com                │');
  console.log('   │ Password             │ 123456                         │');
  console.log('   │ Rol                  │ SUPERADMINISTRADOR             │');
  console.log('   └──────────────────────┴────────────────────────────────┘\n');

  console.log('📝 SIGUIENTES PASOS:');
  console.log('   1. Iniciar sesion con las credenciales de SuperAdmin');
  console.log('   2. Configurar datos de la empresa en Configuracion');
  console.log('   3. Crear sedes adicionales si es necesario');
  console.log('   4. Crear usuarios para cada sede');
  console.log('   5. Configurar especies, medidas y presentaciones');
  console.log('   6. Crear productos');
  console.log('   7. Configurar rutas');
  console.log('   8. Registrar clientes');
  console.log('   9. ¡Listo para operar!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error en el seeder:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
