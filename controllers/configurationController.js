/**
 * Configuration Controller
 * Controlador para gestionar configuraciones del sistema
 */
const {
  getAllConfigurations,
  getConfigurationsByModule,
  getConfigurationByKey,
  updateConfiguration,
  updateMultipleConfigurations
} = require('../models/configurationModel');

/**
 * GET /api/v1/configurations
 * Listar todas las configuraciones
 */
const list = async (req, res) => {
  try {
    const configurations = await getAllConfigurations();

    res.json({
      success: true,
      data: configurations
    });

  } catch (error) {
    console.error('Error listando configuraciones:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * GET /api/v1/configurations/module/:modulo
 * Listar configuraciones por modulo
 */
const listByModule = async (req, res) => {
  try {
    const { modulo } = req.params;

    if (!modulo || modulo.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'El parametro modulo es requerido'
      });
    }

    const configurations = await getConfigurationsByModule(modulo);

    res.json({
      success: true,
      data: configurations
    });

  } catch (error) {
    console.error('Error listando configuraciones por modulo:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * GET /api/v1/configurations/:clave
 * Obtener una configuracion especifica
 */
const getOne = async (req, res) => {
  try {
    const { clave } = req.params;

    if (!clave || clave.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'El parametro clave es requerido'
      });
    }

    const configuration = await getConfigurationByKey(clave);

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Configuracion no encontrada'
      });
    }

    res.json({
      success: true,
      data: configuration
    });

  } catch (error) {
    console.error('Error obteniendo configuracion:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * PUT /api/v1/configurations/:clave
 * Actualizar una configuracion
 */
const update = async (req, res) => {
  try {
    const { clave } = req.params;
    const { valor } = req.body;

    if (!clave || clave.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'El parametro clave es requerido'
      });
    }

    if (valor === undefined || valor === null) {
      return res.status(400).json({
        success: false,
        error: 'El campo valor es requerido'
      });
    }

    // Obtener userId del token (desde middleware verificarToken)
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const configuration = await updateConfiguration(clave, valor, userId);

    res.json({
      success: true,
      data: configuration
    });

  } catch (error) {
    console.error('Error actualizando configuracion:', error);

    if (error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('no es editable')) {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * PUT /api/v1/configurations/batch
 * Actualizar multiples configuraciones
 */
const updateBatch = async (req, res) => {
  try {
    const { configurations } = req.body;

    if (!configurations || !Array.isArray(configurations)) {
      return res.status(400).json({
        success: false,
        error: 'El campo configurations debe ser un array'
      });
    }

    if (configurations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'El array configurations no puede estar vacio'
      });
    }

    // Validar estructura de cada configuracion
    for (const config of configurations) {
      if (!config.clave || config.valor === undefined) {
        return res.status(400).json({
          success: false,
          error: 'Cada configuracion debe tener clave y valor'
        });
      }
    }

    // Obtener userId del token (desde middleware verificarToken)
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const updated = await updateMultipleConfigurations(configurations, userId);

    res.json({
      success: true,
      data: updated
    });

  } catch (error) {
    console.error('Error actualizando configuraciones en lote:', error);

    if (error.message.includes('no encontrada')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('no es editable')) {
      return res.status(403).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

/**
 * GET /api/v1/configurations/public/social
 * Obtener configuracion de redes sociales (publico, sin autenticacion)
 * Para mostrar iconos en la pagina de login
 */
const getPublicSocialConfig = async (req, res) => {
  try {
    const configurations = await getConfigurationsByModule('social');

    // Mapear a formato simple {facebook: url, instagram: url, tiktok: url}
    const socialConfig = {
      facebook: '',
      instagram: '',
      tiktok: ''
    };

    configurations.forEach(config => {
      if (config.clave === 'social_facebook') {
        socialConfig.facebook = config.valor || '';
      } else if (config.clave === 'social_instagram') {
        socialConfig.instagram = config.valor || '';
      } else if (config.clave === 'social_tiktok') {
        socialConfig.tiktok = config.valor || '';
      }
    });

    res.json({
      success: true,
      data: socialConfig
    });

  } catch (error) {
    console.error('Error obteniendo configuracion social publica:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

module.exports = {
  list,
  listByModule,
  getOne,
  update,
  updateBatch,
  getPublicSocialConfig
};
