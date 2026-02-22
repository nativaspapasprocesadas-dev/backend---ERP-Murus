/**
 * Comments Controller
 * Sistema polimórfico de comentarios
 *
 * APIs creadas para ELM-015 (ComentariosSection)
 * Tabla: comentarios (TBL-020)
 *
 * Roles_permitidos: Según configuración por entidad
 * Requiere_autenticacion: true
 */
const {
  listByEntity,
  getById,
  create,
  update,
  softDelete
} = require('../models/commentsModel');
const jwt = require('jsonwebtoken');
const { emitToBranch } = require('../socket/socketManager');

/**
 * Decodificar token JWT y extraer datos del usuario
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
 * Verificar roles permitidos (case-insensitive)
 */
const checkRoles = (decoded, allowedRoles) => {
  if (!decoded || !decoded.role_name) return false;
  const userRole = decoded.role_name.toLowerCase();
  const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());
  return normalizedAllowedRoles.includes(userRole);
};

/**
 * Configuración de permisos por entidad
 * Define qué roles pueden comentar en cada tipo de entidad
 */
const PERMISOS_POR_ENTIDAD = {
  'PEDIDO': ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'PRODUCCION'],
  'RUTA': ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'],
  'PRODUCCION': ['SUPERADMINISTRADOR', 'ADMINISTRADOR'],
  'CLIENTE': ['SUPERADMINISTRADOR', 'ADMINISTRADOR', 'COORDINADOR'],
  // Default: solo superadministradores y administradores
  'DEFAULT': ['SUPERADMINISTRADOR', 'ADMINISTRADOR']
};

/**
 * Obtener roles permitidos para una entidad
 */
const getRolesPermitidos = (entidadTipo) => {
  return PERMISOS_POR_ENTIDAD[entidadTipo] || PERMISOS_POR_ENTIDAD['DEFAULT'];
};

/**
 * GET /api/v1/comments/:entidadTipo/:entidadId
 * Listar comentarios de una entidad
 *
 * Path params:
 *   - entidadTipo: string (PEDIDO, PRODUCCION, CLIENTE, RUTA)
 *   - entidadId: string/number
 *
 * Response:
 *   - success: boolean
 *   - data: array de comentarios ordenados por fecha DESC
 */
const listByEntityHandler = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { entidadTipo, entidadId } = req.params;

    // Validar que el tipo de entidad sea válido
    const entidadTipoUpper = entidadTipo.toUpperCase();
    if (!['PEDIDO', 'PRODUCCION', 'CLIENTE', 'RUTA'].includes(entidadTipoUpper)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de entidad invalido. Valores permitidos: PEDIDO, PRODUCCION, CLIENTE, RUTA'
      });
    }

    const comentarios = await listByEntity(entidadTipoUpper, entidadId);

    res.json({
      success: true,
      data: comentarios
    });

  } catch (error) {
    console.error('Error listando comentarios:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * POST /api/v1/comments
 * Crear nuevo comentario
 *
 * Body:
 *   - entidadTipo: string (PEDIDO, PRODUCCION, CLIENTE, RUTA)
 *   - entidadId: string/number
 *   - texto: string (max 1000 caracteres)
 *
 * Response:
 *   - success: boolean
 *   - data: comentario creado con datos del usuario
 */
const createHandler = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { entidadTipo, entidadId, texto } = req.body;

    // Validaciones
    if (!entidadTipo || !entidadId || !texto) {
      return res.status(400).json({
        success: false,
        error: 'Campos requeridos: entidadTipo, entidadId, texto'
      });
    }

    const entidadTipoUpper = entidadTipo.toUpperCase();
    if (!['PEDIDO', 'PRODUCCION', 'CLIENTE', 'RUTA'].includes(entidadTipoUpper)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de entidad invalido. Valores permitidos: PEDIDO, PRODUCCION, CLIENTE, RUTA'
      });
    }

    const textoTrim = texto.trim();
    if (textoTrim.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El comentario no puede estar vacio'
      });
    }

    if (textoTrim.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'El comentario no puede exceder los 1000 caracteres'
      });
    }

    // Verificar permisos según tipo de entidad
    const rolesPermitidos = getRolesPermitidos(entidadTipoUpper);
    if (!checkRoles(decoded, rolesPermitidos)) {
      return res.status(403).json({
        success: false,
        error: `No tiene permisos para comentar en ${entidadTipoUpper}. Roles permitidos: ${rolesPermitidos.join(', ')}`
      });
    }

    const comentario = await create({
      entidadTipo: entidadTipoUpper,
      entidadId,
      usuarioId: decoded.id,
      texto: textoTrim
    });

    // Emitir evento Socket.IO para actualizar comentarios en tiempo real
    emitToBranch('comentario:creado', {
      entidadTipo: entidadTipoUpper,
      entidadId,
      comentario,
      timestamp: new Date().toISOString()
    }, decoded.branch_id);

    res.status(201).json({
      success: true,
      message: 'Comentario creado exitosamente',
      data: comentario
    });

  } catch (error) {
    console.error('Error creando comentario:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * PUT /api/v1/comments/:id
 * Actualizar comentario (solo el autor puede editar)
 *
 * Path params:
 *   - id: number
 *
 * Body:
 *   - texto: string (max 1000 caracteres)
 *
 * Response:
 *   - success: boolean
 *   - data: comentario actualizado
 */
const updateHandler = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;
    const { texto } = req.body;

    // Validaciones
    if (!texto) {
      return res.status(400).json({
        success: false,
        error: 'Campo requerido: texto'
      });
    }

    const textoTrim = texto.trim();
    if (textoTrim.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El comentario no puede estar vacio'
      });
    }

    if (textoTrim.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'El comentario no puede exceder los 1000 caracteres'
      });
    }

    // Verificar que el comentario existe
    const comentarioExistente = await getById(parseInt(id));
    if (!comentarioExistente) {
      return res.status(404).json({
        success: false,
        error: 'Comentario no encontrado'
      });
    }

    // Verificar que el usuario actual es el autor
    if (comentarioExistente.usuarioId !== decoded.id) {
      return res.status(403).json({
        success: false,
        error: 'Solo puedes editar tus propios comentarios'
      });
    }

    const comentarioActualizado = await update(parseInt(id), { texto: textoTrim });

    // Emitir evento Socket.IO
    emitToBranch('comentario:actualizado', {
      entidadTipo: comentarioExistente.entidadTipo,
      entidadId: comentarioExistente.entidadId,
      comentarioId: parseInt(id),
      timestamp: new Date().toISOString()
    }, decoded.branch_id);

    res.json({
      success: true,
      message: 'Comentario actualizado exitosamente',
      data: comentarioActualizado
    });

  } catch (error) {
    console.error('Error actualizando comentario:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * DELETE /api/v1/comments/:id
 * Eliminar comentario (soft delete, solo el autor puede eliminar)
 *
 * Path params:
 *   - id: number
 *
 * Response:
 *   - success: boolean
 *   - message: string
 */
const deleteHandler = async (req, res) => {
  try {
    const decoded = decodeToken(req);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Token invalido o expirado' });
    }

    const { id } = req.params;

    // Verificar que el comentario existe
    const comentarioExistente = await getById(parseInt(id));
    if (!comentarioExistente) {
      return res.status(404).json({
        success: false,
        error: 'Comentario no encontrado'
      });
    }

    // Verificar que el usuario actual es el autor
    if (comentarioExistente.usuarioId !== decoded.id) {
      return res.status(403).json({
        success: false,
        error: 'Solo puedes eliminar tus propios comentarios'
      });
    }

    const eliminado = await softDelete(parseInt(id));

    if (!eliminado) {
      return res.status(404).json({
        success: false,
        error: 'Comentario no encontrado o ya eliminado'
      });
    }

    // Emitir evento Socket.IO
    emitToBranch('comentario:eliminado', {
      entidadTipo: comentarioExistente.entidadTipo,
      entidadId: comentarioExistente.entidadId,
      comentarioId: parseInt(id),
      timestamp: new Date().toISOString()
    }, decoded.branch_id);

    res.json({
      success: true,
      message: 'Comentario eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando comentario:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

module.exports = {
  listByEntityHandler,
  createHandler,
  updateHandler,
  deleteHandler
};
