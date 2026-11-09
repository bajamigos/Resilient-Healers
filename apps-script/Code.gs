/**
 * Resilient Healers: sign-up backend (Google Sheets + Apps Script).
 *
 * Setup (once):
 *  1. In the project Gmail account, create a Google Sheet named "Resilient Healers sign-ups".
 *  2. Create a standalone Apps Script project (script.google.com). Paste this file in as Code.gs and save.
 *  3. Project Settings > Script properties: add
 *       SHEET_ID         (the long id in the Sheet's address, between /d/ and /edit)
 *       SITE_URL         https://resilienthealers.github.io/
 *       ORGANIZER_EMAIL  (where contact-form messages go)
 *  4. Run setup() once from the editor and approve the permissions.
 *  5. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *     Copy the web app URL into the site's API_URL.
 *
 * The site sends POST bodies as text/plain JSON so browsers don't need a CORS preflight.
 */

const WALKS = {
  'lake-murray-2026-12-13': {
    title: 'December walk at Lake Murray',
    when: 'Sunday, December 13, 2026, 9:00 to 10:30 AM',
    where: 'Lake Murray, in front of the ranger station by the main parking lot (enter from Kiowa Drive)',
    capacity: 20
  }
};

const SIGNUP_HEADERS = ['Signed up', 'Walk', 'Status', 'Name', 'Email', 'Phone', 'Profession', 'Accommodation', 'Cancel code', 'Updated'];
const MESSAGE_HEADERS = ['Received', 'Name', 'Email', 'Message'];

function setup() {
  const ss = ss_();
  ensureSheet_(ss, 'Sign-ups', SIGNUP_HEADERS);
  ensureSheet_(ss, 'Messages', MESSAGE_HEADERS);
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}

function ss_() { return SpreadsheetApp.openById(props_().getProperty('SHEET_ID')); }
function props_() { return PropertiesService.getScriptProperties(); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function signupsSheet_() { return ss_().getSheetByName('Sign-ups'); }

function rows_() {
  const sh = signupsSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, SIGNUP_HEADERS.length).getValues().map((r, i) => ({
    row: i + 2, ts: r[0], walk: r[1], status: r[2], name: r[3], email: r[4], code: r[8]
  }));
}

function counts_(walkId) {
  const rs = rows_().filter(r => r.walk === walkId);
  return {
    going: rs.filter(r => r.status === 'Going').length,
    waitlist: rs.filter(r => r.status === 'Waitlist').length,
    capacity: (WALKS[walkId] || {}).capacity || 0
  };
}

/** GET ?action=count&walk=<id>  ->  {going, waitlist, capacity} */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'count' && WALKS[p.walk]) return json_({ ok: true, ...counts_(p.walk) });
  return json_({ ok: false, error: 'unknown_request' });
}

/** POST text/plain JSON: {action: 'signup'|'cancel'|'message', ...} */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  if (body.website) return json_({ ok: true }); // honeypot field: bots fill it, people never see it
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.action === 'signup') return json_(signup_(body));
    if (body.action === 'cancel') return json_(cancel_(body));
    if (body.action === 'message') return json_(message_(body));
    return json_({ ok: false, error: 'unknown_action' });
  } finally {
    lock.releaseLock();
  }
}

function clean_(s, max) { return String(s || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 300); }
function safeCell_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; } // stop formulas being injected into the Sheet

function signup_(b) {
  const walk = WALKS[b.walk];
  if (!walk) return { ok: false, error: 'unknown_walk' };
  const d = {
    name: clean_(b.name, 120), email: clean_(b.email, 200).toLowerCase(), phone: clean_(b.phone, 40),
    profession: clean_(b.profession, 120), accommodation: clean_(b.accommodation, 500)
  };
  if (!d.name || !/^\S+@\S+\.\S+$/.test(d.email) || d.phone.replace(/\D/g, '').length < 7 || !d.profession || b.hcw !== true) {
    return { ok: false, error: 'missing_fields' };
  }
  const already = rows_().find(r => r.walk === b.walk && r.email === d.email && (r.status === 'Going' || r.status === 'Waitlist'));
  if (already) return { ok: true, status: already.status === 'Going' ? 'going' : 'waitlist', duplicate: true, ...counts_(b.walk) };

  const c = counts_(b.walk);
  const status = c.going < walk.capacity ? 'Going' : 'Waitlist';
  const code = Utilities.getUuid();
  const now = new Date();
  signupsSheet_().appendRow([now, b.walk, status, safeCell_(d.name), safeCell_(d.email), safeCell_(d.phone), safeCell_(d.profession), safeCell_(d.accommodation), code, now]);

  const cancelUrl = (props_().getProperty('SITE_URL') || '') + '?cancel=' + encodeURIComponent(code) + '#walk';
  const first = d.name.split(' ')[0];
  const subject = status === 'Going' ? "You're signed up: " + walk.title : "You're on the waitlist: " + walk.title;
  const lines = status === 'Going'
    ? ['Hi ' + first + ',', '', "You're signed up for the Resilient Healers walk.", '', 'When: ' + walk.when, 'Where: ' + walk.where, '', 'Bring a water bottle.', '', "Can't make it? Cancel here so someone on the waitlist can take your spot:", cancelUrl, '', 'See you there,', 'Resilient Healers']
    : ['Hi ' + first + ',', '', 'The walk is full right now, so you are on the waitlist. If a spot opens, you will move up automatically and we will email you.', '', 'When: ' + walk.when, 'Where: ' + walk.where, '', 'To leave the waitlist:', cancelUrl, '', 'Resilient Healers'];
  MailApp.sendEmail({ to: d.email, subject: subject, body: lines.join('\n'), name: 'Resilient Healers' });

  return { ok: true, status: status === 'Going' ? 'going' : 'waitlist', ...counts_(b.walk) };
}

function cancel_(b) {
  const code = clean_(b.code, 80);
  if (!code) return { ok: false, error: 'missing_code' };
  const rs = rows_();
  const r = rs.find(x => x.code === code);
  if (!r) return { ok: false, error: 'not_found' };
  if (r.status === 'Cancelled') return { ok: true, already: true, ...counts_(r.walk) };
  const sh = signupsSheet_();
  const wasGoing = r.status === 'Going';
  sh.getRange(r.row, 3).setValue('Cancelled');
  sh.getRange(r.row, 10).setValue(new Date());

  if (wasGoing) {
    const walk = WALKS[r.walk];
    const next = rs.filter(x => x.walk === r.walk && x.status === 'Waitlist').sort((a, c) => a.ts - c.ts)[0];
    if (next && walk) {
      sh.getRange(next.row, 3).setValue('Going');
      sh.getRange(next.row, 10).setValue(new Date());
      const cancelUrl = (props_().getProperty('SITE_URL') || '') + '?cancel=' + encodeURIComponent(next.code) + '#walk';
      MailApp.sendEmail({
        to: next.email, name: 'Resilient Healers',
        subject: "A spot opened up: you're in for " + walk.title,
        body: ['Hi ' + String(next.name).split(' ')[0] + ',', '', 'Good news: a spot opened up and you are now signed up.', '', 'When: ' + walk.when, 'Where: ' + walk.where, '', "Can't make it? Cancel here:", cancelUrl, '', 'Resilient Healers'].join('\n')
      });
    }
  }
  return { ok: true, ...counts_(r.walk) };
}

function message_(b) {
  const m = { name: clean_(b.name, 120), email: clean_(b.email, 200), message: String(b.message || '').trim().slice(0, 4000) };
  if (!m.name || !/^\S+@\S+\.\S+$/.test(m.email) || !m.message) return { ok: false, error: 'missing_fields' };
  ss_().getSheetByName('Messages').appendRow([new Date(), safeCell_(m.name), safeCell_(m.email), safeCell_(m.message)]);
  const to = props_().getProperty('ORGANIZER_EMAIL');
  if (to) {
    MailApp.sendEmail({ to: to, replyTo: m.email, name: 'Resilient Healers website', subject: 'New message from ' + m.name, body: m.name + ' (' + m.email + ') wrote:\n\n' + m.message });
  }
  return { ok: true };
}
