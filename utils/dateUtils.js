/**
 * Date utilities for Vietnam timezone (UTC+7)
 */

const VIETNAM_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Convert a date to Vietnam timezone
 * @param {Date|string} date - Date to convert
 * @returns {Date} - Date adjusted for Vietnam timezone
 */
const toVietnamTime = (date) => {
  const d = new Date(date);
  // Get UTC time and add 7 hours for Vietnam
  const utcTime = d.getTime() + (d.getTimezoneOffset() * 60000);
  return new Date(utcTime + (7 * 60 * 60 * 1000));
};

/**
 * Format date to Vietnam locale string
 * @param {Date|string} date - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} - Formatted date string
 */
const formatVietnamDate = (date, options = {}) => {
  const defaultOptions = {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options,
  };
  
  return new Intl.DateTimeFormat('vi-VN', defaultOptions).format(new Date(date));
};

/**
 * Format date and time to Vietnam locale string
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted datetime string
 */
const formatVietnamDateTime = (date) => {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VIETNAM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(date));
};

/**
 * Get current date in Vietnam timezone
 * @returns {Date}
 */
const getVietnamNow = () => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: VIETNAM_TIMEZONE }));
};

/**
 * Create a date at start of day in Vietnam timezone
 * @param {Date|string} date - Base date
 * @returns {Date}
 */
const startOfDayVietnam = (date) => {
  const d = new Date(date);
  const vnDate = new Date(d.toLocaleString('en-US', { timeZone: VIETNAM_TIMEZONE }));
  vnDate.setHours(0, 0, 0, 0);
  return vnDate;
};

/**
 * Create a date at end of day in Vietnam timezone
 * @param {Date|string} date - Base date
 * @returns {Date}
 */
const endOfDayVietnam = (date) => {
  const d = new Date(date);
  const vnDate = new Date(d.toLocaleString('en-US', { timeZone: VIETNAM_TIMEZONE }));
  vnDate.setHours(23, 59, 59, 999);
  return vnDate;
};

/**
 * Get day of week in Vietnam timezone (0=Sunday, 1=Monday, ...)
 * @param {Date|string} date
 * @returns {number}
 */
const getDayOfWeekVietnam = (date) => {
  const vnDate = new Date(new Date(date).toLocaleString('en-US', { timeZone: VIETNAM_TIMEZONE }));
  return vnDate.getDay();
};

/**
 * Parse date string assuming Vietnam timezone and return UTC Date
 * @param {string} dateStr - Date string (e.g., "2025-12-22")
 * @returns {Date}
 */
const parseVietnamDate = (dateStr) => {
  // If it's already a date object, return it
  if (dateStr instanceof Date) return dateStr;
  
  // Parse as Vietnam local time
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  // Create date in UTC, adjusting for Vietnam timezone offset
  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  // Subtract 7 hours to convert Vietnam midnight to UTC
  return new Date(utcDate.getTime() - (7 * 60 * 60 * 1000));
};

module.exports = {
  VIETNAM_TIMEZONE,
  toVietnamTime,
  formatVietnamDate,
  formatVietnamDateTime,
  getVietnamNow,
  startOfDayVietnam,
  endOfDayVietnam,
  getDayOfWeekVietnam,
  parseVietnamDate,
};
