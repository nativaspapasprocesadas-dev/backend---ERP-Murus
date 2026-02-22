/**
 * Socket Manager - Modulo central de Socket.IO
 *
 * Gestiona la instancia de Socket.IO y la hace accesible
 * desde cualquier controller o modelo del backend.
 *
 * Eventos emitidos:
 *   - pedido:creado       -> Cuando se crea un pedido nuevo
 *   - pedido:actualizado  -> Cuando se modifica un pedido
 *   - pedido:cancelado    -> Cuando se cancela un pedido
 *   - pedido:entregado    -> Cuando se marca un pedido como entregado
 *   - pedido:ruta-asignada -> Cuando se asigna ruta a un pedido
 *   - produccion:item-listo -> Cuando se marca/desmarca un item como listo
 */

const { Server } = require('socket.io');

let io = null;

/**
 * Inicializar Socket.IO con el servidor HTTP
 * @param {http.Server} httpServer - Servidor HTTP de Node
 * @returns {Server} Instancia de Socket.IO
 */
const init = (httpServer) => {
  // C6: CORS configurable via env var (default: '*' para compatibilidad)
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : '*';

  io = new Server(httpServer, {
    cors: {
      origin: corsOrigins,
      methods: ['GET', 'POST']
    },
    // C1: polling primero para Railway proxy - evita timeout en WebSocket upgrade
    transports: ['polling', 'websocket'],
    // C5: Ping agresivo para mantener conexion viva en Railway
    pingInterval: 10000,
    pingTimeout: 5000
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Cliente conectado: ${socket.id}`);

    // Unirse a sala por branchId para filtrar eventos por sede
    socket.on('join-branch', (branchId) => {
      if (branchId) {
        socket.join(`branch-${branchId}`);
        console.log(`[Socket.IO] ${socket.id} se unio a sala branch-${branchId}`);
      }
    });

    // Unirse a sala global (para SUPERADMINISTRADOR que ve todas las sedes)
    socket.on('join-global', () => {
      socket.join('global');
      console.log(`[Socket.IO] ${socket.id} se unio a sala global`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Cliente desconectado: ${socket.id} (${reason})`);
    });
  });

  console.log('[Socket.IO] Inicializado correctamente');
  return io;
};

/**
 * Obtener la instancia de Socket.IO
 * @returns {Server|null}
 */
const getIO = () => {
  return io;
};

/**
 * Emitir evento a una sede especifica y a la sala global
 * @param {string} event - Nombre del evento
 * @param {object} data - Datos del evento
 * @param {number|null} branchId - ID de sede (null = broadcast a todos)
 */
const emitToBranch = (event, data, branchId) => {
  if (!io) return;

  if (branchId) {
    // Emitir a la sala de la sede + sala global
    io.to(`branch-${branchId}`).to('global').emit(event, data);
  } else {
    // Sin branchId (SUPERADMIN): broadcast a TODOS los sockets conectados
    io.emit(event, data);
  }
};

module.exports = { init, getIO, emitToBranch };
