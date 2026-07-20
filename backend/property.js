/**
 * Venue-specific access and notification configuration.
 *
 * A single backend serves multiple venue-specific frontend deployments.
 */

const PROPERTY_NAME = 'Function Booking';

function allowedUsersFromEnv(variableName) {
  const raw = String(process.env[variableName] || '').trim();
  if (!raw) return Object.freeze({});
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${variableName} must be a valid JSON object.`);
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${variableName} must be a JSON object of username/password pairs.`);
  }
  const users = {};
  for (const [username, password] of Object.entries(parsed)) {
    const normalizedUsername = String(username).trim().toLowerCase();
    if (normalizedUsername && String(password)) users[normalizedUsername] = String(password);
  }
  return Object.freeze(users);
}

const AMRAVATI_ALLOWED_USERS = allowedUsersFromEnv('AMRAVATI_ALLOWED_USERS');
const AMRAVATI_NOTIFY_EMAILS = Object.freeze([
  'cfo@cpgh.in',
  'sales2.nagpur@cpgh.in',
  'exechef.nagpur@cpgh.in',
  'accounts@centrepointnagpur.com',
  'fnbcontroller.nagpur@cpgh.in',
  'fnb.nagpur@cpgh.in',
  'gm.nagpur@cpgh.in',
  'angadh.arora@cpgh.in',
  'arjun.arora@cpgh.in',
  'do@cpgh.in',
  'ea@cpgh.in',
  'digital@cpgh.in',
]);

const CP_ALLOWED_USERS = allowedUsersFromEnv('NAGPUR_ALLOWED_USERS');
const CP_NOTIFY_EMAILS = Object.freeze([
  'cfo@cpgh.in',
  'sales2.nagpur@cpgh.in',
  'exechef.nagpur@cpgh.in',
  'accounts@centrepointnagpur.com',
  'fnbcontroller.nagpur@cpgh.in',
  'fnb.nagpur@cpgh.in',
  'gm.nagpur@cpgh.in',
  'angadh.arora@cpgh.in',
  'arjun.arora@cpgh.in',
  'do@cpgh.in',
  'ea@cpgh.in',
]);

const DALI_ALLOWED_USERS = allowedUsersFromEnv('DALI_ALLOWED_USERS');
const DALI_NOTIFY_EMAILS = Object.freeze([
  'dali@cpgh.in',
  'natasha.arora@cpgh.in',
  'accounts.dali@cpgh.in',
  'fo.units1@cpgh.in',
  'angadh.arora@cpgh.in',
  'arjun.arora@cpgh.in',
  'fnbcontroller.nagpur@cpgh.in',
  'digital@cpgh.in',
]);

const NAVI_MUMBAI_ALLOWED_USERS = allowedUsersFromEnv('NAVI_MUMBAI_ALLOWED_USERS');
const NAVI_MUMBAI_NOTIFY_EMAILS = Object.freeze([
  'gm.navimumbai@cpgh.in',
  'fnb.navimumbai@cpgh.in',
  'exe.navimumbai@cpgh.in',
  'accounts.navimumbai@cpgh.in',
  'fo.units1@cpgh.in',
  'angadh.arora@cpgh.in',
  'arjun.arora@cpgh.in',
  'fnbcontroller.nagpur@cpgh.in',
  'digital@cpgh.in',
]);

const PABLO_ALLOWED_USERS = allowedUsersFromEnv('PABLO_ALLOWED_USERS');
const PABLO_NOTIFY_EMAILS = Object.freeze([
  'rm.pablo@cpgh.in',
  'chef.ufo@cpgh.in',
  'accounts.ufo@cpgh.in',
  'fo.units1@cpgh.in',
  'angadh.arora@cpgh.in',
  'arjun.arora@cpgh.in',
  'fnbcontroller.nagpur@cpgh.in',
  'digital@cpgh.in',
]);

const PROPERTY_PROFILES = Object.freeze({
  centre_point_amravati: Object.freeze({
    displayName: 'Centre Point Amravati',
    allowedUsers: AMRAVATI_ALLOWED_USERS,
    notifyEmails: AMRAVATI_NOTIFY_EMAILS,
  }),
  centre_point_nagpur: Object.freeze({
    displayName: 'Centre Point Nagpur',
    allowedUsers: CP_ALLOWED_USERS,
    notifyEmails: CP_NOTIFY_EMAILS,
  }),
  dali: Object.freeze({
    displayName: 'Dali',
    allowedUsers: DALI_ALLOWED_USERS,
    notifyEmails: DALI_NOTIFY_EMAILS,
  }),
  centre_point_navi_mumbai: Object.freeze({
    displayName: 'Centre Point Navi Mumbai',
    allowedUsers: NAVI_MUMBAI_ALLOWED_USERS,
    notifyEmails: NAVI_MUMBAI_NOTIFY_EMAILS,
  }),
  pablo: Object.freeze({
    displayName: 'Pablo The Art Cafe',
    allowedUsers: PABLO_ALLOWED_USERS,
    notifyEmails: PABLO_NOTIFY_EMAILS,
  }),
});

function inferPropertyCode(name) {
  const normalized = String(name || '').toLowerCase();
  if (/\bpablo\b/.test(normalized)) return 'pablo';
  if (/\bdali\b/.test(normalized)) return 'dali';
  if (/\bnavi\s+mumbai\b/.test(normalized)) return 'centre_point_navi_mumbai';
  if (/\bcentre\s+point\b/.test(normalized) && /\bamra(?:vati|vti)\b/.test(normalized)) {
    return 'centre_point_amravati';
  }
  if (/\bcentre\s+point\b/.test(normalized) && /\bnagpur\b/.test(normalized)) {
    return 'centre_point_nagpur';
  }
  return '';
}

function getPropertyProfile(code) {
  return PROPERTY_PROFILES[String(code || '').trim().toLowerCase()] || null;
}

module.exports = {
  PROPERTY_NAME,
  PROPERTY_PROFILES,
  getPropertyProfile,
  inferPropertyCode,
  AMRAVATI_ALLOWED_USERS,
  AMRAVATI_NOTIFY_EMAILS,
  CP_ALLOWED_USERS,
  CP_NOTIFY_EMAILS,
  DALI_ALLOWED_USERS,
  DALI_NOTIFY_EMAILS,
  NAVI_MUMBAI_ALLOWED_USERS,
  NAVI_MUMBAI_NOTIFY_EMAILS,
  PABLO_ALLOWED_USERS,
  PABLO_NOTIFY_EMAILS,
};
