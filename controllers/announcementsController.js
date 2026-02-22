/**
 * Announcements Controller - API-005, API-027, API-028, API-029, API-030, API-031
 * Segun diseno en 04_apis_lista.md lineas 246-300, 1819-2062
 * Integrado con Wasabi S3 para almacenamiento de imagenes
 */
const {
  getUnreadAnnouncements,
  markAnnouncementAsRead,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement
} = require('../models/announcementsModel');
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const { uploadComunicationImage, deleteFile } = require('../services/wasabiService');

/**
 * GET /api/v1/announcements/unread
 * Obtener comunicados no leidos
 */
const getUnread = async (req, res) => {
  try {
    // Obtener token y decodificar usuario
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Token invalido o expirado'
      });
    }

    // Obtener comunicados no leidos
    const announcements = await getUnreadAnnouncements(decoded.id);

    // Response segun diseno API-005: lista de AnnouncementDTO
    res.json({
      success: true,
      data: announcements.map(a => ({
        id: a.id,
        title: a.title,
        message: a.message,
        priority: a.priority,
        imageUrl: a.imageUrl || null,
        createdAt: a.createdAt
      }))
    });

  } catch (error) {
    console.error('Error obteniendo comunicados no leidos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * POST /api/v1/announcements/{id}/read
 * API-031: Marcar comunicado como leido
 * Linea diseno: 2064
 */
const markAsRead = async (req, res) => {
  try {
    // Obtener token y decodificar usuario
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: 'Token invalido o expirado'
      });
    }

    const { id } = req.params;

    // Validar que id sea un entero valido
    const comunicadoId = parseInt(id);
    if (isNaN(comunicadoId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de comunicado invalido'
      });
    }

    // Obtener customer_id del usuario - solo clientes pueden marcar como leído
    const customerQuery = `
      SELECT id FROM customers WHERE user_id = $1 AND status = 'active'
    `;
    const customerResult = await pool.query(customerQuery, [decoded.id]);

    // Si no es cliente, no puede marcar comunicados como leídos
    if (customerResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Solo los clientes pueden marcar comunicados como leídos'
      });
    }

    const customerId = customerResult.rows[0].id;

    // Marcar como leido
    const result = await markAnnouncementAsRead(comunicadoId, customerId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    // Response segun diseno API-031: ReadResponseDTO
    res.json({
      success: true
    });

  } catch (error) {
    console.error('Error marcando comunicado como leido:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * Decodificar token JWT (helper)
 */
const decodeToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split(' ')[1];
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

/**
 * GET /api/v1/announcements - API-027
 * Listar comunicados
 * Roles: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR, CLIENTE
 */
const list = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { page, pageSize, priority } = req.query;

    const result = await listAnnouncements({
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
      priority
    }, {
      id: decoded.id,
      role_name: decoded.role_name,
      branch_id: decoded.branch_id
    });

    // Response segun diseno API-027
    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Error listando comunicados:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/announcements - API-028
 * Crear comunicado
 * Roles: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const create = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para crear comunicados' });
    }

    // Obtener datos del body (pueden venir como FormData o JSON)
    let title, message, priority, recipientIds;

    if (req.is('multipart/form-data')) {
      // Datos vienen de FormData
      title = req.body.title;
      message = req.body.message;
      priority = req.body.priority;
      // recipientIds viene como string JSON desde FormData
      recipientIds = req.body.recipientIds ? JSON.parse(req.body.recipientIds) : [];
    } else {
      // Datos vienen como JSON
      title = req.body.title;
      message = req.body.message;
      priority = req.body.priority;
      recipientIds = req.body.recipientIds;
    }

    // Subir imagen a Wasabi S3 si se proporciono
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await uploadComunicationImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      imageUrl = uploadResult.url;
    }

    // Validaciones segun diseno API-028
    if (!title || title.length > 200) {
      return res.status(400).json({ success: false, error: 'title es requerido y debe tener maximo 200 caracteres' });
    }
    if (!message) {
      return res.status(400).json({ success: false, error: 'message es requerido' });
    }
    if (!priority || !['ALTA', 'MEDIA', 'BAJA'].includes(priority)) {
      return res.status(400).json({ success: false, error: 'priority debe ser ALTA, MEDIA o BAJA' });
    }
    if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({ success: false, error: 'recipientIds es requerido y debe ser un array no vacio' });
    }

    const result = await createAnnouncement({
      title,
      message,
      priority,
      imageUrl,
      recipientIds,
      branchId: decoded.branch_id
    }, decoded.id);

    // Response segun diseno API-028
    res.status(201).json({
      success: true,
      id: result.id,
      recipientCount: result.recipientCount
    });

  } catch (error) {
    console.error('Error creando comunicado:', error);
    if (error.message.includes('requerido') || error.message.includes('maximo')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/v1/announcements/:id - API-029
 * Actualizar comunicado
 * Roles: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const update = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para actualizar comunicados' });
    }

    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de comunicado invalido' });
    }

    // Obtener datos del body (pueden venir como FormData o JSON)
    let title, message, priority, removeImage;

    if (req.is('multipart/form-data')) {
      title = req.body.title;
      message = req.body.message;
      priority = req.body.priority;
      removeImage = req.body.removeImage === 'true';
    } else {
      title = req.body.title;
      message = req.body.message;
      priority = req.body.priority;
      removeImage = req.body.removeImage === true;
    }

    // Subir imagen a Wasabi S3 si se proporciono
    let imageUrl = undefined; // undefined = no cambiar
    if (req.file) {
      const uploadResult = await uploadComunicationImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );
      imageUrl = uploadResult.url;
    } else if (removeImage) {
      imageUrl = null; // Eliminar imagen
    }

    const result = await updateAnnouncement(parseInt(id), { title, message, priority, imageUrl }, decoded.id);

    // Response segun diseno API-029
    res.json({
      success: true,
      id: result.id
    });

  } catch (error) {
    console.error('Error actualizando comunicado:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/v1/announcements/:id - API-030
 * Eliminar comunicado
 * Roles: SUPERADMINISTRADOR, ADMINISTRADOR, COORDINADOR
 */
const remove = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    // Verificar rol permitido (case-insensitive)
    const allowedRoles = ['superadministrador', 'administrador', 'coordinador'];
    if (!allowedRoles.includes(decoded.role_name?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'No tiene permisos para eliminar comunicados' });
    }

    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ success: false, error: 'ID de comunicado invalido' });
    }

    await deleteAnnouncement(parseInt(id), decoded.id);

    // Response segun diseno API-030
    res.json({
      success: true
    });

  } catch (error) {
    console.error('Error eliminando comunicado:', error);
    if (error.message.includes('no encontrado')) {
      return res.status(404).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  getUnread,
  markAsRead,
  list,
  create,
  update,
  remove
};
