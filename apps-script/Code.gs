/**
 * Resilient Healers: backend (Google Sheets + Apps Script).
 *
 * Tabs in the "Resilient Healers sign-ups" Sheet (created automatically):
 *   Sign-ups  - one row per person per walk
 *   Messages  - contact-form messages
 *   Leaders   - walk leader profiles
 *   Walks     - walks (Pending review / Live / Changes requested)
 *   Reviews   - each thing staff need to approve, with its private review link
 *   Chat      - on-site messages (see Messaging.gs)
 *
 * Script properties:
 *   SHEET_ID         id of the Sheet (between /d/ and /edit in its address)
 *   SITE_URL         https://resilienthealers.github.io/
 *   ORGANIZER_EMAIL  where contact-form messages go
 *   STAFF_EMAIL      where approval requests go (falls back to ORGANIZER_EMAIL)
 *
 * Deploy as a web app: Execute as Me, access Anyone. The site sends POST bodies as
 * text/plain JSON so browsers don't need a CORS preflight.
 *
 * Private links (leader page, review page, cancel) are "anyone with the link".
 * That's fine for testing; revisit before real use.
 */

/* ===================== sheet layout ===================== */

const TABS = {
  'Sign-ups': ['Signed up', 'Walk', 'Status', 'Name', 'Email', 'Phone', 'Profession', 'Accommodation', 'Cancel code', 'Updated'],
  'Messages': ['Received', 'Name', 'Email', 'Message'],
  'Leaders': ['Leader ID', 'Status', 'Name', 'Email', 'Phone', 'City', 'Background', 'Bio', 'Photo', 'Private link code', 'Staff note', 'Pending edit', 'Created', 'Updated', 'Sample'],
  'Walks': ['Walk ID', 'Leader ID', 'Status', 'Title', 'Date', 'Start', 'End', 'Repeats', 'Place', 'Address', 'Lat', 'Lng', 'How to find the spot', 'Parking', 'Spots', 'Shorter route', 'Description', 'Staff note', 'Pending edit', 'Created', 'Updated', 'Photo', 'Photo credit', 'Photo source', 'Sample', 'City', 'Takes over'],
  'Reviews': ['Review code', 'Type', 'Leader ID', 'Walk ID', 'Status', 'Created', 'Decided', 'Staff note'],
  // What walkers say about a walk leader. Only "Published" rows show on the site; "Sample" marks demo content.
  'Walker reviews': ['Review ID', 'Leader ID', 'Walk ID', 'Name', 'Role', 'Rating', 'Text', 'Date', 'Status', 'Sample']
};

const SEED_LEADER = {
  id: 'L-priya', status: 'Approved', name: 'Priya Reddy, PMHNP-BC, FNP-C', email: '', phone: '', city: 'San Diego, CA',
  background: 'Psychiatric mental health and family nurse practitioner',
  bio: 'Priya is a dual board-certified psychiatric mental health and family nurse practitioner. After years in a busy community clinic, she experienced burnout firsthand and found her way back through coaching, meditation and yoga. She started Resilient Healers so healthcare workers have a place to walk, connect with colleagues and recharge together.',
  photo: ''
};
const SEED_WALK = {
  id: 'lake-murray-2026-12-13', leaderId: 'L-priya', status: 'Live', title: 'December walk at Lake Murray',
  date: '2026-12-13', start: '09:00', end: '10:30', repeats: 'Monthly, second Sunday',
  place: 'Lake Murray, by the ranger station', address: 'Lake Murray Recreation Area, 5650 Kiowa Dr, La Mesa, CA 91942',
  lat: 32.78509, lng: -117.04161,
  find: 'Meet at the side of the main parking lot at the park entrance, in front of the ranger station. Enter from Kiowa Drive.',
  parking: '', spots: 20,
  shorter: 'Available. Tell us when you sign up.',
  description: 'Healthcare work can be deeply meaningful, but it can also take a toll on our physical and emotional well-being. Join us for a free monthly walking group created especially for healthcare workers to connect with colleagues, share experiences, and nurture their own resilience.'
};

/* ===================== two sites, one backend =====================
 * The real site (resilienthealers.github.io) and the demo site (resilienthealers.github.io/demo/)
 * share this code but never share data: each has its own Google Sheet. Requests from the demo
 * page carry site: "demo"; everything in that request then reads and writes the demo Sheet,
 * builds links to the demo site, and sends email as "Resilient Healers (demo)".
 */
const DEMO = {
  sheetId: '1vEFLlaO86thywpGbCgtsL7_kCzjuP-5mBd2C_-PtgMA',   // "Resilient Healers DEMO data"
  siteUrl: 'https://resilienthealers.github.io/demo/'
};
let SITE_ = 'real';
function useSite_(p) { SITE_ = p && p.site === 'demo' ? 'demo' : 'real'; _ss = null; }
function isDemo_() { return SITE_ === 'demo'; }

function props_() { return PropertiesService.getScriptProperties(); }
let _ss = null;
function ss_() { return _ss || (_ss = SpreadsheetApp.openById(isDemo_() ? DEMO.sheetId : props_().getProperty('SHEET_ID'))); }
function sheet_(name) { return ss_().getSheetByName(name); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function siteUrl_() { return isDemo_() ? DEMO.siteUrl : (props_().getProperty('SITE_URL') || ''); }
// Sender name on every email: the demo's emails say "(demo)" so they're easy to tell apart.
function senderName_() { return isDemo_() ? 'Resilient Healers (demo)' : 'Resilient Healers'; }
function staffEmail_() { return props_().getProperty('STAFF_EMAIL') || props_().getProperty('ORGANIZER_EMAIL'); }
// Script properties that differ per site (like the staff code) get a DEMO_ prefix for the demo.
function siteProp_(key) { return props_().getProperty(isDemo_() ? 'DEMO_' + key : key); }
function setSiteProp_(key, v) { props_().setProperty(isDemo_() ? 'DEMO_' + key : key, v); }

/** Run once from the editor (also runs automatically on first request). */
function setup() {
  const ss = ss_();
  Object.keys(TABS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(TABS[name]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, TABS[name].length).setFontWeight('bold');
    } else if (sh.getLastColumn() < TABS[name].length) {
      // New columns added in a later version: add their headers.
      sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
    }
  });
  if (sheet_('Leaders').getLastRow() < 2) {
    const l = SEED_LEADER, now = new Date();
    sheet_('Leaders').appendRow([l.id, l.status, l.name, l.email, l.phone, l.city, l.background, l.bio, l.photo, newCode_(), '', '', now, now]);
  }
  if (sheet_('Walks').getLastRow() < 2) {
    // Leading apostrophes keep dates and times as plain text, so Sheets doesn't convert them.
    appendObj_('Walks', walkRow_(SEED_WALK.id, SEED_WALK.leaderId, SEED_WALK.status, SEED_WALK));
  }
  getPhotoFolder_();
  if (!siteProp_('STAFF_CODE')) { staffCode_(); try { sendStaffLink(); } catch (e) {} }
  CacheService.getScriptCache().put('setup-v9-' + SITE_, '1', 21600);
}
function ensureSetup_() {
  if (CacheService.getScriptCache().get('setup-v9-' + SITE_)) return;
  setup();
}

/* ===================== row helpers ===================== */

function readTab_(name) {
  const sh = sheet_(name), headers = TABS[name], last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, headers.length).getValues().map((r, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, j) => { o[h] = r[j]; });
    return o;
  });
}
function writeCells_(name, row, values) {
  const sh = sheet_(name), headers = TABS[name];
  Object.keys(values).forEach(h => {
    const col = headers.indexOf(h);
    if (col >= 0) sh.getRange(row, col + 1).setValue(values[h]);
  });
}
function appendObj_(name, obj) {
  sheet_(name).appendRow(TABS[name].map(h => (obj[h] === undefined ? '' : obj[h])));
}
function newCode_() { return Utilities.getUuid().replace(/-/g, ''); }
function newId_(prefix) { return prefix + '-' + Utilities.getUuid().slice(0, 8); }

function clean_(s, max) { return String(s == null ? '' : s).replace(/[\r\t]+/g, ' ').trim().slice(0, max || 300); }
function cleanLine_(s, max) { return clean_(s, max).replace(/\n+/g, ' '); }
function safeCell_(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }

function dateText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Los_Angeles', 'yyyy-MM-dd');
  return String(v || '');
}
function timeText_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Los_Angeles', 'HH:mm');
  return String(v || '');
}
function niceTime_(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return hhmm || '';
  let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return h + ':' + m[2] + ' ' + ap;
}
function niceDate_(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return ymd || '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Utilities.formatDate(d, 'America/Los_Angeles', 'EEEE, MMMM d, yyyy');
}

/* ===================== shapes sent to the site ===================== */

function walkOut_(w, extra) {
  const out = {
    id: String(w['Walk ID']), leaderId: String(w['Leader ID']), status: w['Status'], title: w['Title'],
    date: dateText_(w['Date']), start: timeText_(w['Start']), end: timeText_(w['End']), repeats: w['Repeats'],
    place: w['Place'], address: w['Address'], lat: Number(w['Lat']), lng: Number(w['Lng']),
    find: w['How to find the spot'], parking: w['Parking'], spots: Number(w['Spots']) || 0,
    shorter: w['Shorter route'], description: w['Description']
  };
  out.photo = w['Photo'] || ''; out.photoCredit = w['Photo credit'] || ''; out.photoSource = w['Photo source'] || '';
  out.city = w['City'] || ''; out.sample = !!w['Sample'];
  out.comingSoon = !out.date;
  out.dateText = out.comingSoon ? 'Coming soon' : niceDate_(out.date);
  out.timeText = out.comingSoon ? '' : niceTime_(out.start) + (out.end ? ' to ' + niceTime_(out.end) : '');
  return Object.assign(out, extra || {});
}
function leaderPublic_(l) {
  return { id: String(l['Leader ID']), name: l['Name'], city: l['City'], background: l['Background'], bio: l['Bio'], photo: l['Photo'], sample: !!l['Sample'] };
}
// Published walker reviews, grouped by walk leader.
function reviewsByLeader_() {
  const out = {};
  readTab_('Walker reviews').filter(r => r['Status'] === 'Published').forEach(r => {
    const d = r['Date'] instanceof Date ? Utilities.formatDate(r['Date'], 'America/Los_Angeles', 'yyyy-MM') : String(r['Date'] || '');
    (out[String(r['Leader ID'])] = out[String(r['Leader ID'])] || []).push({
      name: String(r['Name']), role: String(r['Role']), rating: Number(r['Rating']) || 0, text: String(r['Text']), date: d, sample: !!r['Sample'] });
  });
  return out;
}

/* ===================== GET ===================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  useSite_(p);
  ensureSetup_();
  // Hourly "tick" from the GitHub Actions schedule (.github/workflows/hourly.yml): sends any reminders and
  // review requests that are due, for both sites. Safe to call anytime; it runs at most every 20 minutes,
  // and each email is only ever sent once.
  if (p.action === 'tick') {
    const cache = CacheService.getScriptCache();
    if (cache.get('tick')) return json_({ ok: true, skipped: true });
    cache.put('tick', '1', 1200);
    sendReminders();
    return json_({ ok: true });
  }
  if (p.action === 'walks') return json_(listWalks_());
  if (p.action === 'count') return json_(countOut_(p.walk));
  if (p.action === 'leader') return json_(leaderPage_(p.code));
  if (p.action === 'review') return reviewPage_(p.code);
  if (p.action === 'reviewData') return json_(reviewData_(p.code));
  return json_({ ok: false, error: 'unknown_request' });
}

function counts_(walkId) {
  const rs = readTab_('Sign-ups').filter(r => String(r['Walk']) === String(walkId));
  return { going: rs.filter(r => r['Status'] === 'Going').length, waitlist: rs.filter(r => r['Status'] === 'Waitlist').length, interested: rs.filter(r => r['Status'] === 'Interested').length };
}
function countOut_(walkId) {
  const w = readTab_('Walks').find(x => String(x['Walk ID']) === String(walkId) && x['Status'] === 'Live');
  if (!w) return { ok: false, error: 'unknown_walk' };
  return Object.assign({ ok: true, capacity: Number(w['Spots']) || 0 }, counts_(walkId));
}

function listWalks_() {
  const leaders = {};
  readTab_('Leaders').filter(l => l['Status'] === 'Approved' || l['Status'] === 'Changes requested' || l['Status'] === 'Pending review')
    .forEach(l => { leaders[String(l['Leader ID'])] = leaderPublic_(l); });
  const reviews = reviewsByLeader_();
  Object.keys(leaders).forEach(id => {
    const rs = reviews[id] || [];
    leaders[id].reviews = rs;
    leaders[id].rating = rs.length ? Math.round(rs.reduce((a, r) => a + r.rating, 0) / rs.length * 10) / 10 : null;
  });
  const signups = readTab_('Sign-ups');
  // Walks whose date has passed drop off the site (coming-soon walks have no date and stay).
  const today = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  const walks = readTab_('Walks').filter(w => w['Status'] === 'Live' && (!dateText_(w['Date']) || dateText_(w['Date']) >= today)).map(w => {
    const rs = signups.filter(r => String(r['Walk']) === String(w['Walk ID']));
    return walkOut_(w, {
      going: rs.filter(r => r['Status'] === 'Going').length,
      waitlist: rs.filter(r => r['Status'] === 'Waitlist').length,
      interested: rs.filter(r => r['Status'] === 'Interested').length,
      leader: leaders[String(w['Leader ID'])] || null
    });
  });
  return { ok: true, walks: walks };
}

function leaderByCode_(code) {
  code = cleanLine_(code, 80);
  if (!code) return null;
  return readTab_('Leaders').find(l => String(l['Private link code']) === code) || null;
}
function leaderPage_(code) {
  const l = leaderByCode_(code);
  if (!l) return { ok: false, error: 'not_found' };
  const id = String(l['Leader ID']);
  const signups = readTab_('Sign-ups');
  const walks = readTab_('Walks').filter(w => String(w['Leader ID']) === id).map(w => {
    const rs = signups.filter(r => String(r['Walk']) === String(w['Walk ID']) && (r['Status'] === 'Going' || r['Status'] === 'Waitlist'));
    return walkOut_(w, {
      staffNote: w['Staff note'], pendingEdit: !!w['Pending edit'],
      // Walkers' email and phone are never sent to walk leaders.
      roster: rs.map(r => ({ status: r['Status'], name: r['Name'], profession: r['Profession'], accommodation: r['Accommodation'] }))
    });
  });
  return {
    ok: true,
    leader: Object.assign(leaderPublic_(l), { status: l['Status'], email: l['Email'], phone: l['Phone'], staffNote: l['Staff note'], pendingEdit: !!l['Pending edit'] }),
    walks: walks
  };
}

/* ===================== POST ===================== */

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  if (body.website) return json_({ ok: true }); // honeypot: bots fill it, people never see it
  useSite_(body);
  ensureSetup_();
  // Reading messages changes nothing, so it doesn't wait for the write lock.
  if (body.action === 'inbox') {
    try { return json_(inbox_(body)); } catch (err) { return json_({ ok: false, error: 'server_error', detail: String(err && err.message || err) }); }
  }
  // The web app runs as its owner, so the owner's user lock lets one change happen at a time.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'busy' });
  try {
    switch (body.action) {
      case 'signup': return json_(signup_(body));
      case 'cancel': return json_(cancel_(body));
      case 'interest': return json_(interest_(body));
      case 'message': return json_(message_(body));
      case 'apply': return json_(apply_(body));
      case 'propose': return json_(propose_(body));
      case 'editWalk': return json_(editWalk_(body));
      case 'editProfile': return json_(editProfile_(body));
      case 'sendLink': return json_(sendLink_(body));
      case 'decide': return json_(decideApi_(body));
      case 'inbox': return json_(inbox_(body));
      case 'send': return json_(send_(body));
      case 'report': return json_(report_(body));
      case 'walkerLink': return json_(walkerLink_(body));
      case 'rateInfo': return json_(rateInfo_(body));
      case 'submitReview': return json_(submitReview_(body));
      // Staff-only maintenance through the website (needs that site's staff code), for when the editor can't run functions.
      case 'admin':
        if (cleanLine_(body.code, 80) !== staffCode_()) return json_({ ok: false, error: 'not_allowed' });
        if (body.op === 'loadSamples') { loadSamples(); return json_({ ok: true }); }
        if (body.op === 'removeSamples') { removeSamples(); return json_({ ok: true }); }
        if (body.op === 'rollRecurring') return json_({ ok: true, added: rollRecurringWalks_() });
        if (body.op === 'removeTestData') { removeTestData(); return json_({ ok: true }); }
        return json_({ ok: false, error: 'unknown_op' });
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    // Send the error back as JSON (a raw Google error page would just look like "failed to fetch" in the browser).
    return json_({ ok: false, error: 'server_error', detail: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- validation ---------- */

function readProfile_(p) {
  p = p || {};
  const out = {
    name: cleanLine_(p.name, 120), email: cleanLine_(p.email, 200).toLowerCase(), phone: cleanLine_(p.phone, 40),
    city: cleanLine_(p.city, 120), background: cleanLine_(p.background, 200), bio: clean_(p.bio, 1500)
  };
  const missing = [];
  if (!out.name) missing.push('name');
  if (!/^\S+@\S+\.\S+$/.test(out.email)) missing.push('email');
  if (out.phone.replace(/\D/g, '').length < 7) missing.push('phone');
  if (!out.city) missing.push('city');
  if (!out.background) missing.push('background');
  if (out.bio.length < 20) missing.push('bio');
  return { data: out, missing: missing };
}
function readWalk_(w) {
  w = w || {};
  const out = {
    title: cleanLine_(w.title, 120), date: cleanLine_(w.date, 10), start: cleanLine_(w.start, 5), end: cleanLine_(w.end, 5),
    repeats: normalizeRepeats_(cleanLine_(w.repeats, 80), cleanLine_(w.date, 10)), place: cleanLine_(w.place, 160), address: cleanLine_(w.address, 200),
    lat: Number(w.lat), lng: Number(w.lng), find: clean_(w.find, 600), parking: clean_(w.parking, 400),
    spots: Math.round(Number(w.spots)), shorter: clean_(w.shorter, 400), description: clean_(w.description, 1500)
  };
  const missing = [];
  if (!out.title) missing.push('title');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.date)) missing.push('date');
  if (!/^\d{2}:\d{2}$/.test(out.start)) missing.push('start time');
  if (out.end && !/^\d{2}:\d{2}$/.test(out.end)) missing.push('end time');
  if (!out.place) missing.push('place');
  if (!isFinite(out.lat) || !isFinite(out.lng) || Math.abs(out.lat) > 90 || Math.abs(out.lng) > 180) missing.push('map pin');
  if (!out.find) missing.push('how to find the spot');
  if (!(out.spots >= 2 && out.spots <= 50)) missing.push('number of spots (2 to 50)');
  if (out.description.length < 20) missing.push('description');
  // An uploaded walk photo arrives as a data URL; it's saved to Drive separately, never stored in a cell.
  const photoData = typeof w.photo === 'string' && /^data:image\/(jpeg|png);base64,/.test(w.photo) ? w.photo : '';
  return { data: out, missing: missing, photoData: photoData };
}
// Saves a walk leader's uploaded walk photo and returns the Walks cells for it (or {} if none).
function walkPhotoCells_(photoData, walkId) {
  if (!photoData) return {};
  const url = savePhoto_(photoData, 'walk-' + walkId, 1400);
  return url ? { 'Photo': url, 'Photo credit': 'the walk leader', 'Photo source': '' } : {};
}
function walkRow_(id, leaderId, status, w) {
  const now = new Date();
  return {
    'Walk ID': id, 'Leader ID': leaderId, 'Status': status, 'Title': safeCell_(w.title), 'Date': "'" + w.date, 'Start': "'" + w.start, 'End': w.end ? "'" + w.end : '',
    'Repeats': safeCell_(w.repeats), 'Place': safeCell_(w.place), 'Address': safeCell_(w.address), 'Lat': w.lat, 'Lng': w.lng,
    'How to find the spot': safeCell_(w.find), 'Parking': safeCell_(w.parking), 'Spots': w.spots, 'Shorter route': safeCell_(w.shorter),
    'Description': safeCell_(w.description), 'Staff note': '', 'Pending edit': '', 'Created': now, 'Updated': now
  };
}
function walkCells_(w) {
  const photo = w.photo ? { 'Photo': w.photo, 'Photo credit': w.photoCredit || 'the walk leader', 'Photo source': '' } : {};
  return Object.assign(photo, {
    'Title': safeCell_(w.title), 'Date': "'" + w.date, 'Start': "'" + w.start, 'End': w.end ? "'" + w.end : '', 'Repeats': safeCell_(w.repeats),
    'Place': safeCell_(w.place), 'Address': safeCell_(w.address), 'Lat': w.lat, 'Lng': w.lng, 'How to find the spot': safeCell_(w.find),
    'Parking': safeCell_(w.parking), 'Spots': w.spots, 'Shorter route': safeCell_(w.shorter), 'Description': safeCell_(w.description), 'Updated': new Date()
  });
}
function profileCells_(p) {
  const c = { 'Name': safeCell_(p.name), 'Phone': safeCell_(p.phone), 'City': safeCell_(p.city), 'Background': safeCell_(p.background), 'Bio': safeCell_(p.bio), 'Updated': new Date() };
  if (p.photo !== undefined) c['Photo'] = p.photo;
  return c;
}

/* ---------- photos ---------- */

function getPhotoFolder_() {
  const name = 'Resilient Healers walk leader photos';
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}
function savePhoto_(dataUrl, leaderId, width) {
  const m = /^data:(image\/(jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const bytes = Utilities.base64Decode(m[3]);
  if (bytes.length > 1500000) return null;
  const blob = Utilities.newBlob(bytes, m[1], leaderId + (m[2] === 'png' ? '.png' : '.jpg'));
  const file = getPhotoFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w' + (width || 600);
}

/* ---------- reviews ---------- */

function openReview_(type, leaderId, walkId) {
  const code = newCode_();
  appendObj_('Reviews', { 'Review code': code, 'Type': type, 'Leader ID': leaderId, 'Walk ID': walkId || '', 'Status': 'Open', 'Created': new Date() });
  const reviewUrl = siteUrl_() + '?review=' + code + '#review';
  const labels = { application: 'New walk leader application', walk: 'New walk proposal', 'walk-edit': 'Changes to a live walk', 'profile-edit': 'Walk leader profile changes', 'walker-review': 'New review from a walker' };
  const leader = readTab_('Leaders').find(l => String(l['Leader ID']) === String(leaderId));
  const walk = walkId ? readTab_('Walks').find(w => String(w['Walk ID']) === String(walkId)) : null;
  const to = staffEmail_();
  if (to) {
    MailApp.sendEmail({
      to: to, name: senderName_(),
      subject: (labels[type] || 'Review needed') + ': ' + (leader ? leader['Name'] : '') + (walk ? ' · ' + walk['Title'] : ''),
      body: [labels[type] || 'Something needs review.', '', 'Walk leader: ' + (leader ? leader['Name'] + ' (' + leader['Email'] + ')' : ''),
        walk ? 'Walk: ' + walk['Title'] + ', ' + niceDate_(dateText_(walk['Date'])) : '', '',
        'Review it and approve or request changes here:', reviewUrl].join('\n')
    });
  }
  return code;
}

function closeOpenReviews_(leaderId, walkId, types) {
  readTab_('Reviews').forEach(r => {
    if (r['Status'] === 'Open' && String(r['Leader ID']) === String(leaderId) && String(r['Walk ID'] || '') === String(walkId || '') && types.indexOf(r['Type']) >= 0) {
      writeCells_('Reviews', r._row, { 'Status': 'Replaced', 'Decided': new Date() });
    }
  });
}

/* ---------- apply: profile + first walk ---------- */

function apply_(b) {
  const p = readProfile_(b.profile), w = readWalk_(b.walk);
  const missing = p.missing.concat(w.missing);
  if (missing.length) return { ok: false, error: 'missing_fields', missing: missing };
  const existing = readTab_('Leaders').find(l => String(l['Email']).toLowerCase() === p.data.email);
  if (existing) {
    sendLinkEmail_(existing, takeoverTarget_(b.forWalk) ? String(b.forWalk) : '');
    return { ok: true, existing: true };
  }
  const leaderId = newId_('L'), code = newCode_(), now = new Date();
  const photo = b.profile && b.profile.photo ? savePhoto_(b.profile.photo, leaderId) : '';
  appendObj_('Leaders', {
    'Leader ID': leaderId, 'Status': 'Pending review', 'Name': safeCell_(p.data.name), 'Email': safeCell_(p.data.email), 'Phone': safeCell_(p.data.phone),
    'City': safeCell_(p.data.city), 'Background': safeCell_(p.data.background), 'Bio': safeCell_(p.data.bio), 'Photo': photo || '',
    'Private link code': code, 'Created': now, 'Updated': now
  });
  const walkId = newId_('W');
  appendObj_('Walks', Object.assign(walkRow_(walkId, leaderId, 'Pending review', w.data), takeoverCells_(b.forWalk), walkPhotoCells_(w.photoData, walkId)));
  openReview_('application', leaderId, walkId);
  MailApp.sendEmail({
    to: p.data.email, name: senderName_(),
    subject: 'We got your application to lead a walk',
    body: ['Hi ' + p.data.name.split(' ')[0] + ',', '', 'Thanks for applying to lead a Resilient Healers walk. Our team will review your profile and your first walk, "' + w.data.title + '", and email you.', '',
      'You can check its status, or make changes, from your walk leader page:', leaderLink_(code), '', 'Keep this email: that link is your private way back to your walk leader page.', '', 'Resilient Healers'].join('\n')
  });
  return { ok: true, leaderLink: leaderLink_(code) };
}

function leaderLink_(code) { return siteUrl_() + '?leader=' + encodeURIComponent(code) + '#my-walks'; }

/* ---------- approved leaders: propose a walk ---------- */

function propose_(b) {
  const l = leaderByCode_(b.code);
  if (!l) return { ok: false, error: 'not_found' };
  if (l['Status'] !== 'Approved') return { ok: false, error: 'not_approved' };
  const w = readWalk_(b.walk);
  if (w.missing.length) return { ok: false, error: 'missing_fields', missing: w.missing };
  const walkId = newId_('W');
  appendObj_('Walks', Object.assign(walkRow_(walkId, String(l['Leader ID']), 'Pending review', w.data), takeoverCells_(b.forWalk), walkPhotoCells_(w.photoData, walkId)));
  openReview_('walk', String(l['Leader ID']), walkId);
  return { ok: true, walkId: walkId };
}

/* ---------- edit or resubmit a walk ---------- */

function editWalk_(b) {
  const l = leaderByCode_(b.code);
  if (!l) return { ok: false, error: 'not_found' };
  const walk = readTab_('Walks').find(x => String(x['Walk ID']) === String(b.walkId) && String(x['Leader ID']) === String(l['Leader ID']));
  if (!walk) return { ok: false, error: 'not_found' };
  const w = readWalk_(b.walk);
  if (w.missing.length) return { ok: false, error: 'missing_fields', missing: w.missing };
  const leaderId = String(l['Leader ID']), walkId = String(walk['Walk ID']);
  const photo = walkPhotoCells_(w.photoData, walkId);
  if (photo['Photo']) { w.data.photo = photo['Photo']; w.data.photoCredit = photo['Photo credit']; }
  if (walk['Status'] === 'Live') {
    // Live walk: keep it live with its current details (and photo) until staff approve the edit.
    writeCells_('Walks', walk._row, { 'Pending edit': JSON.stringify(w.data), 'Staff note': '', 'Updated': new Date() });
    closeOpenReviews_(leaderId, walkId, ['walk-edit']);
    openReview_('walk-edit', leaderId, walkId);
    return { ok: true, status: 'Live', pendingEdit: true };
  }
  // Pending review or Changes requested: update in place and (re)send for review.
  const cells = walkCells_(w.data);
  cells['Status'] = 'Pending review'; cells['Staff note'] = '';
  writeCells_('Walks', walk._row, cells);
  if (walk['Status'] === 'Changes requested') {
    if (l['Status'] === 'Approved') openReview_('walk', leaderId, walkId);
    else resubmitApplication_(l, walkId);
  }
  return { ok: true, status: 'Pending review' };
}

/* ---------- edit or resubmit the profile ---------- */

function editProfile_(b) {
  const l = leaderByCode_(b.code);
  if (!l) return { ok: false, error: 'not_found' };
  const p = readProfile_(Object.assign({}, b.profile, { email: l['Email'] }));
  if (p.missing.length) return { ok: false, error: 'missing_fields', missing: p.missing };
  const leaderId = String(l['Leader ID']);
  if (b.profile && b.profile.photo) {
    const url = savePhoto_(b.profile.photo, leaderId);
    if (url) p.data.photo = url;
  }
  if (l['Status'] === 'Approved') {
    writeCells_('Leaders', l._row, { 'Pending edit': JSON.stringify(p.data), 'Staff note': '', 'Updated': new Date() });
    closeOpenReviews_(leaderId, '', ['profile-edit']);
    openReview_('profile-edit', leaderId, '');
    return { ok: true, status: 'Approved', pendingEdit: true };
  }
  const cells = profileCells_(p.data);
  cells['Status'] = 'Pending review'; cells['Staff note'] = '';
  writeCells_('Leaders', l._row, cells);
  if (l['Status'] === 'Changes requested') {
    const first = readTab_('Walks').find(w => String(w['Leader ID']) === leaderId && w['Status'] !== 'Live');
    resubmitApplication_(l, first ? String(first['Walk ID']) : '');
  }
  return { ok: true, status: 'Pending review' };
}

function resubmitApplication_(l, walkId) {
  const leaderId = String(l['Leader ID']);
  writeCells_('Leaders', l._row, { 'Status': 'Pending review', 'Staff note': '' });
  if (walkId) {
    const w = readTab_('Walks').find(x => String(x['Walk ID']) === String(walkId));
    if (w) writeCells_('Walks', w._row, { 'Status': 'Pending review', 'Staff note': '' });
  }
  closeOpenReviews_(leaderId, walkId, ['application']);
  openReview_('application', leaderId, walkId);
}

/* ---------- lost link ---------- */

function sendLink_(b) {
  const email = cleanLine_(b.email, 200).toLowerCase();
  const l = readTab_('Leaders').find(x => String(x['Email']).toLowerCase() === email);
  if (l) sendLinkEmail_(l);
  return { ok: true }; // same answer either way, so nobody can test which emails are leaders
}
function sendLinkEmail_(l, leadWalkId) {
  if (!l['Email']) return;
  const link = leaderLink_(l['Private link code']).replace('#my-walks', (leadWalkId ? '&lead=' + encodeURIComponent(leadWalkId) : '') + '#my-walks');
  MailApp.sendEmail({
    to: String(l['Email']), name: senderName_(), subject: 'Your Resilient Healers walk leader link',
    body: ['Hi ' + String(l['Name']).split(' ')[0] + ',', '', (leadWalkId ? 'Here is your private link to your walk leader page. It opens with the walk you asked to lead filled in, ready to propose:' : 'Here is your private link to your walk leader page:'), link, '', 'Resilient Healers'].join('\n')
  });
}

/* ===================== staff review page ===================== */

function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function reviewPage_(code) {
  const r = readTab_('Reviews').find(x => String(x['Review code']) === cleanLine_(code, 80));
  const head = '<meta name="viewport" content="width=device-width, initial-scale=1"><style>' +
    'body{font-family:"Nunito Sans",Avenir,"Segoe UI",system-ui,sans-serif;background:#f8f4f1;color:#411e06;margin:0;padding:24px 16px;line-height:1.55;font-size:17px}' +
    '.w{max-width:44rem;margin:0 auto;display:flex;flex-direction:column;gap:18px}h1,h2{font-family:Georgia,serif;margin:0}h1{font-size:30px}h2{font-size:22px}' +
    '.card{background:#fff;border:1px solid #e2d6cd;border-radius:14px;padding:16px 18px}dl{display:grid;grid-template-columns:10rem 1fr;gap:6px 12px;margin:0}dt{font-weight:700;color:#6f5441}dd{margin:0;white-space:pre-wrap}' +
    '.chip{display:inline-block;background:#f1e1f4;color:#7c360c;border-radius:999px;padding:2px 10px;font-weight:700;font-size:14px}' +
    'button{font:inherit;font-weight:700;border-radius:999px;padding:10px 20px;border:2px solid #a05222;cursor:pointer;min-height:46px}.ok{background:#a05222;color:#fff}.no{background:#fff;color:#7c360c;border-color:#7c360c}' +
    'textarea{font:inherit;width:100%;box-sizing:border-box;min-height:6rem;border:2px solid #e2d6cd;border-radius:10px;padding:10px}.row{display:flex;flex-wrap:wrap;gap:10px}img{max-width:160px;border-radius:12px}' +
    '@media(max-width:30rem){dl{grid-template-columns:1fr}}</style>';
  if (!r) return HtmlService.createHtmlOutput(head + '<div class="w"><h1>Review not found</h1><p>This review link isn\'t valid.</p></div>').setTitle('Resilient Healers review');
  const l = readTab_('Leaders').find(x => String(x['Leader ID']) === String(r['Leader ID']));
  const w = r['Walk ID'] ? readTab_('Walks').find(x => String(x['Walk ID']) === String(r['Walk ID'])) : null;
  const labels = { application: 'New walk leader application', walk: 'New walk proposal', 'walk-edit': 'Changes to a live walk', 'profile-edit': 'Walk leader profile changes' };

  let profile = l ? {
    Name: l['Name'], Email: l['Email'], Phone: l['Phone'], City: l['City'], Background: l['Background'], Bio: l['Bio']
  } : {};
  let photo = l ? l['Photo'] : '';
  if (r['Type'] === 'profile-edit' && l && l['Pending edit']) {
    const pe = JSON.parse(l['Pending edit']);
    profile = { Name: pe.name, Email: l['Email'], Phone: pe.phone, City: pe.city, Background: pe.background, Bio: pe.bio };
    if (pe.photo) photo = pe.photo;
  }
  let walk = null;
  if (w) {
    const src = (r['Type'] === 'walk-edit' && w['Pending edit']) ? JSON.parse(w['Pending edit']) : walkOut_(w);
    walk = {
      Title: src.title, Date: niceDate_(src.date), Time: niceTime_(src.start) + (src.end ? ' to ' + niceTime_(src.end) : ''), Repeats: src.repeats,
      Place: src.place, Address: src.address, Pin: src.lat + ', ' + src.lng, 'How to find the spot': src.find, Parking: src.parking,
      Spots: src.spots, 'Shorter route': src.shorter, Description: src.description
    };
  }
  const dl = o => '<dl>' + Object.keys(o).map(k => '<dt>' + esc_(k) + '</dt><dd>' + esc_(o[k]) + '</dd>').join('') + '</dl>';
  const showProfile = r['Type'] === 'application' || r['Type'] === 'profile-edit';
  const showWalk = !!walk && r['Type'] !== 'profile-edit';
  const decided = r['Status'] !== 'Open';
  const html = head + '<div class="w">' +
    '<p class="chip">' + esc_(labels[r['Type']] || r['Type']) + '</p><h1>' + esc_(l ? l['Name'] : '') + '</h1>' +
    (showProfile ? '<div class="card"><h2>Walk leader profile</h2>' + (photo ? '<p><img alt="Photo of ' + esc_(profile.Name) + '" src="' + esc_(photo) + '"></p>' : '') + dl(profile) + '</div>' : '') +
    (showWalk ? '<div class="card"><h2>Walk</h2>' + dl(walk) + '<p><a target="_blank" href="https://www.google.com/maps/search/?api=1&query=' + esc_(walk.Pin.replace(' ', '')) + '">Check the pin in Google Maps</a></p></div>' : '') +
    (decided
      ? '<div class="card"><h2>Already decided</h2><p>' + esc_(r['Status']) + (r['Staff note'] ? ': ' + esc_(r['Staff note']) : '') + '</p></div>'
      : '<div class="card" id="act"><h2>Your decision</h2><div class="row"><button class="ok" id="approve">Approve</button></div>' +
        '<p><label for="note"><strong>Or request changes.</strong> Tell the walk leader what to fix:</label></p><textarea id="note"></textarea>' +
        '<div class="row"><button class="no" id="changes">Request changes</button></div><p id="msg" role="status"></p></div>') +
    '</div><script>' +
    'function go(d){var n=document.getElementById("note").value.trim();if(d==="changes"&&!n){document.getElementById("msg").textContent="Add a note so the walk leader knows what to change.";return;}' +
    'document.querySelectorAll("button").forEach(function(b){b.disabled=true});document.getElementById("msg").textContent="Saving…";' +
    'google.script.run.withSuccessHandler(function(t){document.getElementById("act").innerHTML="<h2>Done</h2><p>"+t+"</p>"}).withFailureHandler(function(e){document.getElementById("msg").textContent="That didn\'t save: "+e.message;document.querySelectorAll("button").forEach(function(b){b.disabled=false})}).decide(' + JSON.stringify(String(r['Review code'])) + ',d,n)}' +
    'var a=document.getElementById("approve");if(a){a.onclick=function(){go("approve")};document.getElementById("changes").onclick=function(){go("changes")}}' +
    '</script>';
  return HtmlService.createHtmlOutput(html).setTitle('Resilient Healers review').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Called from the review page. */
function decide(code, decision, note) {
  const lock = LockService.getUserLock();
  lock.waitLock(25000);
  try { return decideLocked_(code, decision, note); } finally { lock.releaseLock(); }
}

/** The decision itself. Callers must already hold the script lock. */
function decideLocked_(code, decision, note) {
  {
    const r = readTab_('Reviews').find(x => String(x['Review code']) === String(code));
    if (!r) throw new Error('Review not found.');
    if (r['Status'] !== 'Open') return 'This was already decided (' + r['Status'] + ').';
    note = clean_(note, 1500);
    const l = readTab_('Leaders').find(x => String(x['Leader ID']) === String(r['Leader ID']));
    const w = r['Walk ID'] ? readTab_('Walks').find(x => String(x['Walk ID']) === String(r['Walk ID'])) : null;
    const approve = decision === 'approve';
    const t = r['Type'];
    if (t === 'walker-review') return decideWalkerReview_(r, approve, note);

    if (t === 'application') {
      writeCells_('Leaders', l._row, { 'Status': approve ? 'Approved' : 'Changes requested', 'Staff note': approve ? '' : note, 'Updated': new Date() });
      if (w) writeCells_('Walks', w._row, { 'Status': approve ? 'Live' : 'Changes requested', 'Staff note': approve ? '' : note, 'Updated': new Date() });
    } else if (t === 'walk') {
      writeCells_('Walks', w._row, { 'Status': approve ? 'Live' : 'Changes requested', 'Staff note': approve ? '' : note, 'Updated': new Date() });
    } else if (t === 'walk-edit') {
      if (approve && w['Pending edit']) {
        const cells = walkCells_(JSON.parse(w['Pending edit']));
        cells['Pending edit'] = ''; cells['Staff note'] = '';
        writeCells_('Walks', w._row, cells);
      } else {
        writeCells_('Walks', w._row, { 'Pending edit': '', 'Staff note': note, 'Updated': new Date() });
      }
    } else if (t === 'profile-edit') {
      if (approve && l['Pending edit']) {
        const cells = profileCells_(JSON.parse(l['Pending edit']));
        cells['Pending edit'] = ''; cells['Staff note'] = '';
        writeCells_('Leaders', l._row, cells);
      } else {
        writeCells_('Leaders', l._row, { 'Pending edit': '', 'Staff note': note, 'Updated': new Date() });
      }
    }
    writeCells_('Reviews', r._row, { 'Status': approve ? 'Approved' : 'Changes requested', 'Decided': new Date(), 'Staff note': note });
    let takeoverMsg = '';
    if (approve && w && (t === 'application' || t === 'walk') && w['Takes over']) takeoverMsg = takeOver_(w, l);

    // Tell the walk leader.
    const first = String(l['Name']).split(' ')[0];
    const what = { application: 'your application and first walk', walk: 'your walk "' + (w ? w['Title'] : '') + '"', 'walk-edit': 'your changes to "' + (w ? w['Title'] : '') + '"', 'profile-edit': 'your profile changes' }[t];
    const lines = approve
      ? ['Hi ' + first + ',', '', 'Good news: we approved ' + what + '.' + (t === 'application' || t === 'walk' ? ' It is now live on the Resilient Healers map, and people can sign up.' : ''), '',
         'Your walk leader page, where you can see sign-ups and propose new walks:', leaderLink_(l['Private link code']), '', 'Resilient Healers']
      : ['Hi ' + first + ',', '', 'Thanks for ' + what.replace(/^your /, 'your ') + '. Before it goes live, we have a request:', '', note, '',
         'Make the changes and resubmit from your walk leader page:', leaderLink_(l['Private link code']), '', 'Resilient Healers'];
    if (l['Email']) MailApp.sendEmail({ to: String(l['Email']), name: senderName_(), subject: approve ? 'Approved: ' + what.replace(/^your /, '') : 'Changes requested: ' + what.replace(/^your /, ''), body: lines.join('\n') });
    return approve ? 'Approved. We emailed the walk leader.' + takeoverMsg : 'Changes requested. We emailed the walk leader your note.';
  }
}


/* ===================== staff review: data for the website's review page ===================== */

function reviewData_(code) {
  const r = readTab_('Reviews').find(x => String(x['Review code']) === cleanLine_(code, 80));
  if (!r) return { ok: false, error: 'not_found' };
  const l = readTab_('Leaders').find(x => String(x['Leader ID']) === String(r['Leader ID']));
  const w = r['Walk ID'] ? readTab_('Walks').find(x => String(x['Walk ID']) === String(r['Walk ID'])) : null;
  let profile = l ? { name: l['Name'], email: l['Email'], phone: l['Phone'], city: l['City'], background: l['Background'], bio: l['Bio'], photo: l['Photo'] } : null;
  if (r['Type'] === 'profile-edit' && l && l['Pending edit']) {
    const pe = JSON.parse(l['Pending edit']);
    profile = Object.assign({}, profile, { name: pe.name, phone: pe.phone, city: pe.city, background: pe.background, bio: pe.bio }, pe.photo ? { photo: pe.photo } : {});
  }
  let walk = null;
  if (w) {
    const src = (r['Type'] === 'walk-edit' && w['Pending edit']) ? JSON.parse(w['Pending edit']) : walkOut_(w);
    walk = Object.assign({}, src, { dateText: niceDate_(src.date), timeText: niceTime_(src.start) + (src.end ? ' to ' + niceTime_(src.end) : '') });
  }
  let takesOver = null;
  const target = w && w['Takes over'] ? takeoverTarget_(w['Takes over']) : null;
  if (target) takesOver = { title: target['Title'], city: target['City'], interested: counts_(target['Walk ID']).interested };
  const walkerReview = r['Type'] === 'walker-review' ? walkerReviewData_(r) : null;
  return { ok: true, type: r['Type'], status: r['Status'], note: r['Staff note'], profile: profile, walk: walk, takesOver: takesOver, walkerReview: walkerReview };
}

function decideApi_(b) {
  const decision = b.decision === 'approve' ? 'approve' : 'changes';
  const note = clean_(b.note, 1500);
  if (decision === 'changes' && !note) return { ok: false, error: 'missing_note' };
  try { return { ok: true, message: decideLocked_(cleanLine_(b.code, 80), decision, note) }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}

/* ===================== demo data (run from the editor) ===================== */

/** Removes the "Test Leader" test data: their leader row, walks, reviews, test sign-ups and test chat messages. */
function removeTestData() {
  const leaders = readTab_('Leaders').filter(l => l['Name'] === 'Test Leader');
  const ids = leaders.map(l => String(l['Leader ID']));
  const walkIds = readTab_('Walks').filter(w => ids.indexOf(String(w['Leader ID'])) >= 0).map(w => String(w['Walk ID']));
  deleteRows_('Sign-ups', r => walkIds.indexOf(String(r['Walk'])) >= 0 || /^Test /.test(String(r['Name'])));
  // Put back any coming-soon walk a test walk took over.
  readTab_('Walks').filter(w => w['Status'] === 'Replaced' && walkIds.some(id => String(w['Staff note']) === 'Replaced by ' + id))
    .forEach(w => writeCells_('Walks', w._row, { 'Status': 'Live', 'Staff note': '', 'Updated': new Date() }));
  deleteRows_('Reviews', r => ids.indexOf(String(r['Leader ID'])) >= 0);
  deleteRows_('Chat', r => walkIds.indexOf(String(r['Walk'])) >= 0 || /^Test /.test(String(r['From name'])));
  deleteRows_('Walker reviews', r => ids.indexOf(String(r['Leader ID'])) >= 0);
  deleteRows_('Walks', r => walkIds.indexOf(String(r['Walk ID'])) >= 0);
  deleteRows_('Leaders', r => ids.indexOf(String(r['Leader ID'])) >= 0);
  Logger.log('Removed ' + ids.length + ' test leader(s) and ' + walkIds.length + ' walk(s).');
}
function deleteRows_(tab, match) {
  const rows = readTab_(tab).filter(match).map(r => r._row).sort((a, b) => b - a);
  rows.forEach(n => sheet_(tab).deleteRow(n));
}

/** Loads the sample walks in SAMPLE_DATA (replacing earlier samples) and sets photos on existing walks. */
function loadSamples() {
  setup();
  deleteRows_('Walks', r => String(r['Sample']) === 'Sample');
  deleteRows_('Leaders', r => String(r['Sample']) === 'Sample');
  deleteRows_('Walker reviews', r => String(r['Sample']) === 'Sample');
  const now = new Date();
  (SAMPLE_DATA.leaders || []).forEach(l => appendObj_('Leaders', {
    'Leader ID': l.id, 'Status': 'Approved', 'Name': safeCell_(l.name), 'Email': '', 'Phone': '', 'City': safeCell_(l.city),
    'Background': safeCell_(l.background), 'Bio': safeCell_(l.bio), 'Photo': '', 'Private link code': newCode_(), 'Created': now, 'Updated': now, 'Sample': 'Sample' }));
  (SAMPLE_DATA.reviews || []).forEach(r => appendObj_('Walker reviews', {
    'Review ID': r.id, 'Leader ID': r.leaderId, 'Walk ID': r.walkId, 'Name': safeCell_(r.name), 'Role': safeCell_(r.role), 'Rating': r.rating,
    'Text': safeCell_(r.text), 'Date': "'" + r.date, 'Status': 'Published', 'Sample': 'Sample' }));
  const rows = SAMPLE_DATA.walks.map(s => {
    const row = walkRow_(s.id, s.leaderId || '', 'Live', {
      title: s.title, date: s.date || '', start: s.start || '', end: s.end || '', repeats: s.repeats || '', place: s.place, address: s.address || '',
      lat: s.lat, lng: s.lng, find: s.find || '', parking: s.parking || '', spots: s.spots || 20, shorter: s.shorter || '', description: s.description
    });
    if (!s.date) { row['Date'] = ''; row['Start'] = ''; row['End'] = ''; }
    if (!s.repeats) row['Repeats'] = s.date ? 'One time' : '';
    row['Photo'] = s.photo || ''; row['Photo credit'] = safeCell_(s.photoCredit || ''); row['Photo source'] = s.photoSource || '';
    row['Sample'] = 'Sample'; row['City'] = s.city || ''; row['Created'] = now; row['Updated'] = now;
    return TABS['Walks'].map(h => (row[h] === undefined ? '' : row[h]));
  });
  if (rows.length) {
    const sh = sheet_('Walks');
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, TABS['Walks'].length).setValues(rows);
  }
  (SAMPLE_DATA.photos || []).forEach(p => {
    const w = readTab_('Walks').find(x => String(x['Walk ID']) === p.walkId);
    if (w) writeCells_('Walks', w._row, { 'Photo': p.photo, 'Photo credit': safeCell_(p.photoCredit), 'Photo source': p.photoSource, 'City': p.city || '' });
  });
  Logger.log('Loaded ' + SAMPLE_DATA.walks.length + ' sample walks.');
}

/** Run from the editor: sets up the demo Sheet's tabs and loads the sample walks, leaders and reviews into it. */
function setupDemo() {
  useSite_({ site: 'demo' });
  setup(); loadSamples();
  Logger.log('Demo Sheet is set up. Its staff messages link was emailed to staff.');
  useSite_({});
}

/** Removes every sample walk. */
function removeSamples() {
  deleteRows_('Walks', r => String(r['Sample']) === 'Sample');
  deleteRows_('Leaders', r => String(r['Sample']) === 'Sample');
  deleteRows_('Walker reviews', r => String(r['Sample']) === 'Sample');
}

/* ===================== walkers: sign-up, cancel, contact ===================== */

function liveWalk_(walkId) {
  return readTab_('Walks').find(w => String(w['Walk ID']) === String(walkId) && w['Status'] === 'Live') || null;
}
function walkWhen_(w) { const o = walkOut_(w); return o.dateText + ', ' + o.timeText; }
function walkWhere_(w) { return w['Place'] + (w['How to find the spot'] ? '. ' + w['How to find the spot'] : ''); }

function signup_(b) {
  const walk = liveWalk_(b.walk);
  if (!walk) return { ok: false, error: 'unknown_walk' };
  if (!dateText_(walk['Date'])) return { ok: false, error: 'coming_soon' };
  const capacity = Number(walk['Spots']) || 0;
  const d = {
    name: cleanLine_(b.name, 120), email: cleanLine_(b.email, 200).toLowerCase(), phone: cleanLine_(b.phone, 40),
    profession: cleanLine_(b.profession, 120), accommodation: cleanLine_(b.accommodation, 500)
  };
  if (!d.name || !/^\S+@\S+\.\S+$/.test(d.email) || d.phone.replace(/\D/g, '').length < 7 || !d.profession || b.hcw !== true) {
    return { ok: false, error: 'missing_fields' };
  }
  const rows = readTab_('Sign-ups');
  const already = rows.find(r => String(r['Walk']) === String(b.walk) && String(r['Email']).toLowerCase() === d.email && (r['Status'] === 'Going' || r['Status'] === 'Waitlist'));
  if (already) return Object.assign({ ok: true, status: already['Status'] === 'Going' ? 'going' : 'waitlist', duplicate: true, capacity: capacity }, counts_(b.walk));

  const c = counts_(b.walk);
  const status = c.going < capacity ? 'Going' : 'Waitlist';
  const code = Utilities.getUuid();
  const now = new Date();
  appendObj_('Sign-ups', {
    'Signed up': now, 'Walk': String(b.walk), 'Status': status, 'Name': safeCell_(d.name), 'Email': safeCell_(d.email), 'Phone': safeCell_(d.phone),
    'Profession': safeCell_(d.profession), 'Accommodation': safeCell_(d.accommodation), 'Cancel code': code, 'Updated': now
  });

  const cancelUrl = siteUrl_() + '?walk=' + encodeURIComponent(b.walk) + '&cancel=' + encodeURIComponent(code) + '#walk';
  const first = d.name.split(' ')[0];
  const subject = status === 'Going' ? "You're signed up: " + walk['Title'] : "You're on the waitlist: " + walk['Title'];
  const lines = status === 'Going'
    ? ['Hi ' + first + ',', '', "You're signed up for the Resilient Healers walk.", '', 'When: ' + walkWhen_(walk), 'Where: ' + walkWhere_(walk), '', 'Bring a water bottle. We will email you a reminder two days before and on the morning of the walk.', '',
       'Message your walk leader, and read their updates, here:', inboxUrl_(code), '', "Can't make it? Cancel here so someone on the waitlist can take your spot:", cancelUrl, '', 'Keep this email: its links are private to you.', '', 'See you there,', 'Resilient Healers']
    : ['Hi ' + first + ',', '', 'The walk is full right now, so you are on the waitlist. If a spot opens, you will move up automatically and we will email you.', '', 'When: ' + walkWhen_(walk), 'Where: ' + walkWhere_(walk), '',
       'Message your walk leader, and read their updates, here:', inboxUrl_(code), '', 'To leave the waitlist:', cancelUrl, '', 'Resilient Healers'];
  MailApp.sendEmail({ to: d.email, subject: subject, body: lines.join('\n'), name: senderName_() });

  // The code goes back only to the browser that just signed up, so its walk page can open their messages.
  return Object.assign({ ok: true, status: status === 'Going' ? 'going' : 'waitlist', capacity: capacity, code: code }, counts_(b.walk));
}

/* Interest list for "coming soon" walks (no leader or date yet).
   People join with status "Interested". Nobody is promised a spot; when a walk leader
   sets the date, staff (later: the site) email this list so they can sign up. */
function interest_(b) {
  const walk = liveWalk_(b.walk);
  if (!walk) return { ok: false, error: 'unknown_walk' };
  if (dateText_(walk['Date'])) return { ok: false, error: 'already_scheduled' };
  const d = { name: cleanLine_(b.name, 120), email: cleanLine_(b.email, 200).toLowerCase(), profession: cleanLine_(b.profession, 120) };
  if (!d.name || !/^\S+@\S+\.\S+$/.test(d.email) || !d.profession || b.hcw !== true) return { ok: false, error: 'missing_fields' };
  const rows = readTab_('Sign-ups');
  const already = rows.find(r => String(r['Walk']) === String(b.walk) && String(r['Email']).toLowerCase() === d.email && r['Status'] === 'Interested');
  if (already) return Object.assign({ ok: true, duplicate: true }, counts_(b.walk));

  const code = Utilities.getUuid();
  const now = new Date();
  appendObj_('Sign-ups', {
    'Signed up': now, 'Walk': String(b.walk), 'Status': 'Interested', 'Name': safeCell_(d.name), 'Email': safeCell_(d.email), 'Phone': '',
    'Profession': safeCell_(d.profession), 'Accommodation': '', 'Cancel code': code, 'Updated': now
  });
  const leaveUrl = siteUrl_() + '?walk=' + encodeURIComponent(b.walk) + '&cancel=' + encodeURIComponent(code) + '#walk';
  const place = walk['Place'] + (walk['City'] ? ', ' + walk['City'] : '');
  MailApp.sendEmail({
    to: d.email, name: senderName_(), subject: "You're on the interest list: " + walk['Title'],
    body: ['Hi ' + d.name.split(' ')[0] + ',', '', 'Thanks for your interest in a Resilient Healers walk at ' + place + '.', '',
      "This walk doesn't have a walk leader or a date yet. When it does, we'll email you so you can sign up. Joining this list doesn't reserve a spot.", '',
      'Know someone who might lead it? Send them to ' + siteUrl_() + '#lead', '',
      'To leave the list:', leaveUrl, '', 'Resilient Healers'].join('\n')
  });
  return Object.assign({ ok: true }, counts_(b.walk));
}

/* ---------- a walk leader takes over a coming-soon walk ---------- */

// The coming-soon walk being taken over: live, with no date yet.
function takeoverTarget_(walkId) {
  if (!walkId) return null;
  const t = readTab_('Walks').find(x => String(x['Walk ID']) === String(walkId));
  return t && t['Status'] === 'Live' && !dateText_(t['Date']) ? t : null;
}
function takeoverCells_(walkId) {
  const t = takeoverTarget_(walkId);
  if (!t) return {};
  // The new walk keeps the coming-soon walk's photo and city.
  return { 'Takes over': String(t['Walk ID']), 'Photo': t['Photo'] || '', 'Photo credit': t['Photo credit'] || '', 'Photo source': t['Photo source'] || '', 'City': t['City'] || '' };
}
// Runs when staff approve a walk that takes over a coming-soon walk: the coming-soon walk
// comes off the map, and everyone on its interest list is emailed the new walk.
function takeOver_(newWalk, leader) {
  const t = takeoverTarget_(newWalk['Takes over']);
  if (!t) return '';
  writeCells_('Walks', t._row, { 'Status': 'Replaced', 'Staff note': 'Replaced by ' + newWalk['Walk ID'], 'Updated': new Date() });
  const people = readTab_('Sign-ups').filter(r => String(r['Walk']) === String(t['Walk ID']) && r['Status'] === 'Interested');
  const url = siteUrl_() + '?walk=' + encodeURIComponent(newWalk['Walk ID']) + '#walk';
  const w = walkOut_(newWalk);
  let sent = 0;
  people.forEach(p => {
    try {
      MailApp.sendEmail({
        to: String(p['Email']), name: senderName_(), subject: 'The walk you were waiting for has a date: ' + newWalk['Title'],
        body: ['Hi ' + String(p['Name']).split(' ')[0] + ',', '', 'Good news. The Resilient Healers walk at ' + t['Place'] + ' now has a walk leader and a date:', '',
          newWalk['Title'], w.dateText + ', ' + w.timeText, newWalk['Place'], 'Walk leader: ' + (leader ? leader['Name'] : ''), '',
          'Spots are first come, first served. Sign up here:', url, '', "You're getting this because you joined the interest list. This was the only email about it.", '', 'Resilient Healers'].join('\n')
      });
      writeCells_('Sign-ups', p._row, { 'Status': 'Notified', 'Updated': new Date() });
      sent++;
    } catch (e) { /* daily email limit reached: they stay "Interested" so staff can follow up */ }
  });
  const left = people.length - sent;
  return ' The coming-soon walk it replaces is off the map, and we emailed ' + sent + ' interested ' + (sent === 1 ? 'person' : 'people') + '.' +
    (left ? ' ' + left + " couldn't be emailed today (daily email limit); they're still marked Interested in the Sheet." : '');
}

function cancel_(b) {
  const code = cleanLine_(b.code, 80);
  if (!code) return { ok: false, error: 'missing_code' };
  const rows = readTab_('Sign-ups');
  const r = rows.find(x => String(x['Cancel code']) === code);
  if (!r) return { ok: false, error: 'not_found' };
  const walkId = String(r['Walk']);
  const walk = readTab_('Walks').find(w => String(w['Walk ID']) === walkId);
  const capacity = walk ? Number(walk['Spots']) || 0 : 0;
  if (r['Status'] === 'Cancelled') return Object.assign({ ok: true, already: true, capacity: capacity }, counts_(walkId));
  const wasGoing = r['Status'] === 'Going';
  writeCells_('Sign-ups', r._row, { 'Status': 'Cancelled', 'Updated': new Date() });

  if (wasGoing && walk) {
    const next = rows.filter(x => String(x['Walk']) === walkId && x['Status'] === 'Waitlist').sort((a, c) => a['Signed up'] - c['Signed up'])[0];
    if (next) {
      writeCells_('Sign-ups', next._row, { 'Status': 'Going', 'Updated': new Date() });
      const cancelUrl = siteUrl_() + '?walk=' + encodeURIComponent(walkId) + '&cancel=' + encodeURIComponent(next['Cancel code']) + '#walk';
      MailApp.sendEmail({
        to: String(next['Email']), name: senderName_(),
        subject: "A spot opened up: you're in for " + walk['Title'],
        body: ['Hi ' + String(next['Name']).split(' ')[0] + ',', '', 'Good news: a spot opened up and you are now signed up.', '', 'When: ' + walkWhen_(walk), 'Where: ' + walkWhere_(walk), '', 'Messages from your walk leader:', inboxUrl_(next['Cancel code']), '', "Can't make it? Cancel here:", cancelUrl, '', 'Resilient Healers'].join('\n')
      });
    }
  }
  return Object.assign({ ok: true, capacity: capacity }, counts_(walkId));
}

function message_(b) {
  const m = { name: cleanLine_(b.name, 120), email: cleanLine_(b.email, 200), message: String(b.message || '').trim().slice(0, 4000) };
  if (!m.name || !/^\S+@\S+\.\S+$/.test(m.email) || !m.message) return { ok: false, error: 'missing_fields' };
  appendObj_('Messages', { 'Received': new Date(), 'Name': safeCell_(m.name), 'Email': safeCell_(m.email), 'Message': safeCell_(m.message) });
  const to = props_().getProperty('ORGANIZER_EMAIL');
  if (to) {
    MailApp.sendEmail({ to: to, replyTo: m.email, name: 'Resilient Healers website', subject: 'New message from ' + m.name, body: m.name + ' (' + m.email + ') wrote:\n\n' + m.message });
  }
  return { ok: true };
}
