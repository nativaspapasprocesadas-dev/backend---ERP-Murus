const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {
  findUserByEmail,
  findUserByName,
  findCustomerByUserId,
  createUserSession,
  invalidateSession,
  validateSession
} = require('../models/authModel');

/**
 * Login de usuario
 * Soporta login por email o por nombre del negocio (para clientes)
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  // Validacion de campos requeridos
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email y password son requeridos'
    });
  }

  try {
    // Buscar usuario por email primero
    let user = await findUserByEmail(email);

    // Si no se encuentra por email, intentar por nombre (para clientes)
    if (!user) {
      user = await findUserByName(email);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado o inactivo'
      });
    }

    // Comparar passwords con bcrypt
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales incorrectas'
      });
    }

    // Generar token JWT
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role_id: user.role_id,
      role_name: user.role_name,
      branch_id: user.branch_id
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    // Calcular fecha de expiracion
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 4);

    // Crear sesion en la base de datos
    await createUserSession({
      user_id: user.id,
      token: token,
      ip_address: req.ip || req.connection.remoteAddress || null,
      user_agent: req.headers['user-agent'] || null,
      expires_at: expiresAt
    });

    // Si es cliente, obtener datos adicionales
    let customerData = null;
    if (user.role_name === 'cliente') {
      customerData = await findCustomerByUserId(user.id);
    }

    // Responder con datos del usuario + permisos
    // Campos segun diseño API-001 en 04_apis_lista.md
    res.json({
      success: true,
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role_name,
        branchId: user.branch_id,
        // Campos adicionales para compatibilidad interna
        phone: user.phone,
        role_id: user.role_id,
        branch_name: user.branch_name,
        branch_code: user.branch_code,
        permissions: user.permissions,
        customer: customerData
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * Logout de usuario
 * Invalida la sesion actual
 */
const logout = async (req, res) => {
  try {
    // Obtener token del header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(400).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }

    const token = authHeader.split(' ')[1];

    // Invalidar sesion
    const invalidated = await invalidateSession(token);

    if (!invalidated) {
      return res.status(404).json({
        success: false,
        error: 'Sesion no encontrada'
      });
    }

    res.json({
      success: true,
      message: 'Logout exitoso'
    });

  } catch (error) {
    console.error('Error en logout:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * Verificar sesion actual
 * Retorna datos del usuario si la sesion es valida
 */
const verifySession = async (req, res) => {
  try {
    // Obtener token del header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }

    const token = authHeader.split(' ')[1];

    // Validar sesion en DB
    const session = await validateSession(token);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesion invalida o expirada'
      });
    }

    // Verificar token JWT
    try {
      jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      // Si el JWT expiro, invalidar la sesion
      await invalidateSession(token);
      return res.status(401).json({
        success: false,
        error: 'Token expirado'
      });
    }

    // Response segun API-003 en 04_apis_lista.md
    res.json({
      success: true,
      message: 'Sesion valida',
      id: session.user_id,
      name: session.name,
      email: session.email,
      role: session.role_name,
      branch: session.branch_name,
      permissions: session.permissions,
      // Campos adicionales para compatibilidad interna
      user: {
        id: session.user_id,
        name: session.name,
        email: session.email,
        role: session.role_name,
        branch: session.branch_name,
        permissions: session.permissions
      }
    });

  } catch (error) {
    console.error('Error verificando sesion:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * Refrescar token
 * Genera un nuevo token si el actual es valido
 */
const refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }

    const oldToken = authHeader.split(' ')[1];

    // Validar sesion actual
    const session = await validateSession(oldToken);

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Sesion invalida o expirada'
      });
    }

    // Invalidar token anterior
    await invalidateSession(oldToken);

    // Generar nuevo token
    const tokenPayload = {
      id: session.user_id,
      email: session.email,
      role_id: session.role_id,
      role_name: session.role_name,
      branch_id: session.branch_id
    };

    const newToken = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    // Calcular nueva fecha de expiracion
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 4);

    // Crear nueva sesion
    await createUserSession({
      user_id: session.user_id,
      token: newToken,
      ip_address: req.ip || req.connection.remoteAddress || null,
      user_agent: req.headers['user-agent'] || null,
      expires_at: expiresAt
    });

    res.json({
      success: true,
      message: 'Token renovado exitosamente',
      token: newToken
    });

  } catch (error) {
    console.error('Error refrescando token:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

module.exports = {
  login,
  logout,
  verifySession,
  refreshToken
};
