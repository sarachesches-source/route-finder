// Display units. Everything inside the app works in metres; this file only converts what
// people see and type: "metric" = km and m, "imperial" = miles and feet (US).

export const M_PER_MI = 1609.344;
export const FT_PER_M = 3.28084;
export const UNITS = ['metric', 'imperial'];

/** Imperial for browsers set to US (and the two other countries that use miles). */
export function defaultUnits(locale = '') {
  return /[-_](US|LR|MM)\b/i.test(locale) ? 'imperial' : 'metric';
}

export const distUnit = (units) => (units === 'imperial' ? 'mi' : 'km');
export const elevUnit = (units) => (units === 'imperial' ? 'ft' : 'm');

/** Metres -> number in km or miles. */
export const distValue = (m, units) => (units === 'imperial' ? m / M_PER_MI : m / 1000);
/** Metres -> number in m or feet. */
export const elevValue = (m, units) => (units === 'imperial' ? m * FT_PER_M : m);

/** "15.1 km" / "9.4 mi" */
export function dist(m, units, digits = 1) {
  return `${distValue(m, units).toFixed(digits)} ${distUnit(units)}`;
}
/** "504 m" / "1,654 ft" */
export function elev(m, units) {
  return `${Math.round(elevValue(m, units)).toLocaleString('en-US')} ${elevUnit(units)}`;
}
/** A position along the route: "km 8.4" / "mile 5.2" */
export function at(m, units) {
  return `${units === 'imperial' ? 'mile' : 'km'} ${distValue(m, units).toFixed(1)}`;
}

/** Typed distance (km or mi) -> metres. */
export const distToM = (value, units) => (units === 'imperial' ? value * M_PER_MI : value * 1000);
/** Typed climbing (m or ft) -> metres. */
export const elevToM = (value, units) => (units === 'imperial' ? value / FT_PER_M : value);

/** Climbing rate: "44 m per km" / "232 ft per mile" */
export function rate(mPerKm, units) {
  return units === 'imperial'
    ? `${Math.round(mPerKm * FT_PER_M * (M_PER_MI / 1000))} ft per mile`
    : `${Math.round(mPerKm)} m per km`;
}
