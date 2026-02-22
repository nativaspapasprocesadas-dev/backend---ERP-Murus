/**
 * Utilidades de fecha para backend
 * Garantiza consistencia con timezone America/Lima
 *
 * IMPORTANTE: Estas funciones evitan el problema de toISOString() que convierte
 * a UTC, lo cual puede cambiar el día cuando el servidor está en UTC pero
 * los usuarios están en Perú (UTC-5).
 */

/**
 * Obtiene fecha actual en formato YYYY-MM-DD usando hora de Perú
 * @returns {string} Fecha en formato "YYYY-MM-DD"
 */
const getPeruDateString = () => {
  const now = new Date();
  const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const year = peruTime.getFullYear();
  const month = String(peruTime.getMonth() + 1).padStart(2, '0');
  const day = String(peruTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Obtiene hora actual en formato HH:MM usando hora de Perú
 * @returns {string} Hora en formato "HH:MM"
 */
const getPeruTimeString = () => {
  const now = new Date();
  const peruTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
  const hours = String(peruTime.getHours()).padStart(2, '0');
  const minutes = String(peruTime.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * Obtiene Date object en hora de Perú
 * @returns {Date} Objeto Date con hora de Perú
 */
const getPeruDate = () => {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
};

/**
 * Obtiene fecha de mañana en formato YYYY-MM-DD usando hora de Perú
 * @returns {string} Fecha de mañana en formato "YYYY-MM-DD"
 */
const getPeruDateTomorrow = () => {
  const peruDate = getPeruDate();
  peruDate.setDate(peruDate.getDate() + 1);
  const year = peruDate.getFullYear();
  const month = String(peruDate.getMonth() + 1).padStart(2, '0');
  const day = String(peruDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Obtiene fecha de hace N días en formato YYYY-MM-DD usando hora de Perú
 * @param {number} days - Número de días hacia atrás
 * @returns {string} Fecha en formato "YYYY-MM-DD"
 */
const getPeruDateDaysAgo = (days) => {
  const peruDate = getPeruDate();
  peruDate.setDate(peruDate.getDate() - days);
  const year = peruDate.getFullYear();
  const month = String(peruDate.getMonth() + 1).padStart(2, '0');
  const day = String(peruDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Convierte un objeto Date de PostgreSQL a string YYYY-MM-DD sin problemas de timezone
 * Usa toLocaleDateString con locale 'sv-SE' que da formato ISO directamente
 * @param {Date} date - Objeto Date de la base de datos
 * @returns {string|null} Fecha en formato "YYYY-MM-DD" o null
 */
const formatDateFromDB = (date) => {
  if (!date) return null;
  // sv-SE locale devuelve formato YYYY-MM-DD directamente
  return date.toLocaleDateString('sv-SE');
};

/**
 * Obtiene fecha y hora actual en formato ISO pero usando hora de Perú
 * @returns {string} Fecha y hora en formato "YYYY-MM-DDTHH:mm:ss"
 */
const getPeruDateTime = () => {
  const peruDate = getPeruDate();
  const year = peruDate.getFullYear();
  const month = String(peruDate.getMonth() + 1).padStart(2, '0');
  const day = String(peruDate.getDate()).padStart(2, '0');
  const hours = String(peruDate.getHours()).padStart(2, '0');
  const minutes = String(peruDate.getMinutes()).padStart(2, '0');
  const seconds = String(peruDate.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

module.exports = {
  getPeruDateString,
  getPeruTimeString,
  getPeruDate,
  getPeruDateTomorrow,
  getPeruDateDaysAgo,
  formatDateFromDB,
  getPeruDateTime
};
