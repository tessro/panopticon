/** Gravitational parameter of the Sun in AU^3/yr^2 */
export const GM_SUN_AU = 4 * Math.PI * Math.PI; // ~39.478

/** Gravitational parameter of the Sun in km^3/s^2 */
export const GM_SUN_KM = 1.32712440018e11;

/** km per AU */
export const AU_KM = 149597870.7;

/** Degrees to radians */
export const DEG_RAD = Math.PI / 180;

/** Standard gravity in m/s^2 */
export const STANDARD_GRAVITY_MPS2 = 9.80665;

/** Seconds per Julian year */
export const SECONDS_PER_YEAR = 365.25 * 86400;

/** Seconds per day */
export const SECONDS_PER_DAY = 86400;

/** Days per Julian year */
export const DAYS_PER_YEAR = 365.25;

/** J2000 epoch as Date */
export const J2000_DATE = new Date("2000-01-01T12:00:00Z");

/** Convert a Date to Julian years since J2000 */
export function dateToJY(date: Date): number {
  const ms = date.getTime() - J2000_DATE.getTime();
  return ms / (DAYS_PER_YEAR * 86400000);
}

/** Convert Julian years since J2000 to a Date */
export function jyToDate(jy: number): Date {
  const ms = jy * DAYS_PER_YEAR * 86400000;
  return new Date(J2000_DATE.getTime() + ms);
}

/** Convert days to Julian years */
export function daysToJY(days: number): number {
  return days / DAYS_PER_YEAR;
}

/** Default low parking orbit altitude in km for bodies without explicit altitude */
export const DEFAULT_PARKING_ALTITUDE_KM = 200;
