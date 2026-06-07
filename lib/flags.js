'use strict';

/**
 * Maps each seed team name to its flag code (ISO 3166-1 alpha-2, or a GB
 * subdivision code for England/Scotland). Used to render flag images next to
 * team names. Images come from flagcdn.com (free, no key); England/Scotland use
 * flagcdn's `gb-eng` / `gb-sct` subdivision flags so they render everywhere
 * (unlike emoji flags, which degrade to letters on Windows/Android).
 */
const CODES = {
  Mexico: 'mx', 'South Korea': 'kr', 'South Africa': 'za', Czechia: 'cz',
  Canada: 'ca', Qatar: 'qa', Switzerland: 'ch', 'Bosnia and Herzegovina': 'ba',
  Brazil: 'br', Haiti: 'ht', Scotland: 'gb-sct', Morocco: 'ma',
  'United States': 'us', Paraguay: 'py', Australia: 'au', 'Türkiye': 'tr',
  Germany: 'de', "Côte d'Ivoire": 'ci', Ecuador: 'ec', 'Curaçao': 'cw',
  Netherlands: 'nl', Japan: 'jp', Tunisia: 'tn', Sweden: 'se',
  Iran: 'ir', Belgium: 'be', Egypt: 'eg', 'New Zealand': 'nz',
  Spain: 'es', 'Saudi Arabia': 'sa', Uruguay: 'uy', 'Cape Verde': 'cv',
  France: 'fr', Senegal: 'sn', Norway: 'no', Iraq: 'iq',
  Argentina: 'ar', Algeria: 'dz', Austria: 'at', Jordan: 'jo',
  Portugal: 'pt', Uzbekistan: 'uz', Colombia: 'co', 'DR Congo': 'cd',
  England: 'gb-eng', Ghana: 'gh', Panama: 'pa', Croatia: 'hr',
};

function flagCode(name) {
  return CODES[name] || null;
}

/** HTML for a team's flag image, or '' if unknown. Decorative (alt=""). */
function flagImg(name) {
  const code = flagCode(name);
  if (!code) return '';
  return `<img class="flag" src="https://flagcdn.com/24x18/${code}.png"`
    + ` srcset="https://flagcdn.com/48x36/${code}.png 2x"`
    + ` width="24" height="18" alt="" loading="lazy">`;
}

module.exports = { CODES, flagCode, flagImg };
