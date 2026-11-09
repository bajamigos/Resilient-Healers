/**
 * Resilient Healers: on-site messaging and reminder emails.
 *
 * Messaging (decided November 9, 2026):
 *  - Once someone has signed up for a walk, or is a walk leader, conversations happen on the site.
 *  - Emails only say a message is waiting, with a link. They never contain the message,
 *    so the full record stays in the "Chat" tab.
 *  - Walkers' email addresses and phone numbers are never shown to walk leaders.
 *  - Staff can read every conversation, and every message has a Report button.
 *
 * Conversations ("threads"), stored in the Chat tab's Thread column:
 *   group:<walkId>          walk leader -> everyone signed up (walkers read only)
 *   walker:<signup code>    one walker <-> their walk leader
 *   walker-staff:<code>     one walker <-> Resilient Healers staff
 *   leader-staff:<leaderId> one walk leader <-> Resilient Healers staff
 * Staff can write in any thread.
 *
 * Who is who: walkers use the private code from their sign-up email, walk leaders their
 * private walk leader link, staff the STAFF_CODE script property. Anyone with one of those
 * links can act as that person, which is fine for testing; real sign-in comes later.
 *
 * Reminders: an hourly trigger (installReminders) emails people who are "Going"
 * two days before the walk and on the morning of the walk.
 */

TABS['Chat'] = ['Message ID', 'Sent', 'Walk', 'Thread', 'From', 'From name', 'Text', 'Reported', 'Reported by', 'Report note'];
TABS['Sign-ups'] = TABS['Sign-ups'].concat(['Reminder 2 days', 'Reminder day of']);

/* ===================== links ===================== */

function inboxUrl_(code) { return siteUrl_() + '?inbox=' + encodeURIComponent(code) + '#inbox'; }
function leaderMessagesUrl_(code) { return siteUrl_() + '?leader=' + encodeURIComponent(code) + '#me-messages'; }
function staffCode_() {
  let c = props_().getProperty('STAFF_CODE');
  if (!c) { c = newCode_(); props_().setProperty('STAFF_CODE', c); }
  return c;
}
function staffUrl_() { return siteUrl_() + '?staff=' + encodeURIComponent(staffCode_()) + '#staff'; }

/** Run from the editor to email staff their private staff messages link. */
function sendStaffLink() {
  const to = staffEmail_();
  if (!to) throw new Error('Set STAFF_EMAIL or ORGANIZER_EMAIL first.');
  MailApp.sendEmail({ to: to, name: senderName_(), subject: 'Your Resilient Healers staff messages link',
    body: ['This private link opens the staff messages page, where you can read every conversation, see reported messages and reply:', '', staffUrl_(), '', "Don't share it."].join('\n') });
  Logger.log('Sent the staff link to ' + to);
}

/* ===================== who is asking ===================== */

// Returns { role, name, ... } or null.
function who_(b) {
  const code = cleanLine_(b && b.code, 80);
  if (!code) return null;
  if (b.as === 'staff') return code === staffCode_() ? { role: 'staff', name: 'Resilient Healers staff' } : null;
  if (b.as === 'leader') {
    const l = leaderByCode_(code);
    return l ? { role: 'leader', name: String(l['Name']), leader: l, id: String(l['Leader ID']) } : null;
  }
  if (b.as === 'walker') {
    const s = readTab_('Sign-ups').find(r => String(r['Cancel code']) === code && (r['Status'] === 'Going' || r['Status'] === 'Waitlist' || r['Status'] === 'Cancelled'));
    return s ? { role: 'walker', name: String(s['Name']), signup: s, code: code } : null;
  }
  return null;
}

/* ===================== which threads someone may see and write in ===================== */

function threadInfo_(thread) {
  const m = /^(group|walker|walker-staff|leader-staff):(.+)$/.exec(String(thread || ''));
  if (!m) return null;
  const info = { kind: m[1], key: m[2], thread: m[0] };
  if (info.kind === 'group') info.walk = readTab_('Walks').find(w => String(w['Walk ID']) === info.key) || null;
  if (info.kind === 'walker' || info.kind === 'walker-staff') {
    info.signup = readTab_('Sign-ups').find(r => String(r['Cancel code']) === info.key) || null;
    if (info.signup) info.walk = readTab_('Walks').find(w => String(w['Walk ID']) === String(info.signup['Walk'])) || null;
  }
  if (info.kind === 'leader-staff') info.leader = readTab_('Leaders').find(l => String(l['Leader ID']) === info.key) || null;
  return info;
}
function canSee_(me, t) {
  if (!me || !t) return false;
  if (me.role === 'staff') return true;
  if (me.role === 'walker') {
    if (t.kind === 'group') return String(t.key) === String(me.signup['Walk']);
    return (t.kind === 'walker' || t.kind === 'walker-staff') && t.key === me.code;
  }
  if (me.role === 'leader') {
    if (t.kind === 'leader-staff') return t.key === me.id;
    if (t.kind === 'group' || t.kind === 'walker') return !!t.walk && String(t.walk['Leader ID']) === me.id;
  }
  return false;
}
function canSend_(me, t) {
  if (!canSee_(me, t)) return false;
  if (me.role === 'staff') return true;
  if (me.role === 'walker') {
    if (t.kind === 'group') return false; // walkers read group updates; replies go one-to-one
    if (t.kind === 'walker') return me.signup['Status'] !== 'Cancelled';
    return true; // a walker can always reach staff
  }
  if (me.role === 'leader') return me.leader['Status'] === 'Approved';
  return false;
}

/* ===================== reading ===================== */

function msgOut_(r) {
  return { id: String(r['Message ID']), sent: r['Sent'] instanceof Date ? r['Sent'].toISOString() : String(r['Sent']), thread: String(r['Thread']),
    from: String(r['From']), fromName: String(r['From name']), text: String(r['Text']), reported: !!r['Reported'],
    reportedBy: r['Reported by'] ? String(r['Reported by']) : '', reportNote: r['Report note'] ? String(r['Report note']) : '' };
}

function inbox_(b) {
  const me = who_(b);
  if (!me) return { ok: false, error: 'not_found' };
  const chat = readTab_('Chat');
  const byThread = {};
  chat.forEach(r => { (byThread[String(r['Thread'])] = byThread[String(r['Thread'])] || []).push(r); });
  // Only staff, and the person who reported it, can see that a message was reported.
  const msgs = (thread) => (byThread[thread] || []).map(msgOut_).map(m => (me.role === 'staff' ? m :
    Object.assign(m, { reported: m.reported && m.reportedBy === me.role + ': ' + me.name, reportedBy: '', reportNote: '' })));
  const walks = readTab_('Walks'), signups = readTab_('Sign-ups'), leaders = readTab_('Leaders');
  const walkShort = (w) => w ? { id: String(w['Walk ID']), title: w['Title'], dateText: walkOut_(w).dateText, timeText: walkOut_(w).timeText, place: w['Place'] } : null;

  if (me.role === 'walker') {
    const s = me.signup, w = walks.find(x => String(x['Walk ID']) === String(s['Walk']));
    const l = w ? leaders.find(x => String(x['Leader ID']) === String(w['Leader ID'])) : null;
    return { ok: true, role: 'walker', name: me.name, status: s['Status'], walk: walkShort(w), leaderName: l ? l['Name'] : '',
      threads: [
        { thread: 'group:' + s['Walk'], kind: 'group', title: 'Updates from your walk leader', canSend: false, messages: msgs('group:' + s['Walk']) },
        { thread: 'walker:' + me.code, kind: 'walker', title: 'You and your walk leader', canSend: s['Status'] !== 'Cancelled', messages: msgs('walker:' + me.code) },
        { thread: 'walker-staff:' + me.code, kind: 'walker-staff', title: 'You and Resilient Healers staff', canSend: true, messages: msgs('walker-staff:' + me.code) }
      ] };
  }

  if (me.role === 'leader') {
    const mine = walks.filter(w => String(w['Leader ID']) === me.id && w['Status'] === 'Live');
    const canSend = me.leader['Status'] === 'Approved';
    return { ok: true, role: 'leader', name: me.name, canSend: canSend,
      staff: { thread: 'leader-staff:' + me.id, kind: 'leader-staff', title: 'You and Resilient Healers staff', canSend: true, messages: msgs('leader-staff:' + me.id) },
      walks: mine.map(w => {
        const people = signups.filter(r => String(r['Walk']) === String(w['Walk ID']) &&
          (r['Status'] === 'Going' || r['Status'] === 'Waitlist' || byThread['walker:' + r['Cancel code']]));
        return { walk: walkShort(w),
          group: { thread: 'group:' + w['Walk ID'], kind: 'group', title: 'Message everyone signed up', canSend: canSend, messages: msgs('group:' + w['Walk ID']) },
          people: people.map(r => ({ thread: 'walker:' + r['Cancel code'], kind: 'walker', title: String(r['Name']), status: r['Status'],
            canSend: canSend && r['Status'] !== 'Cancelled', messages: msgs('walker:' + r['Cancel code']) })) };
      }) };
  }

  // staff: every thread that has messages, newest activity first, reported messages listed on their own.
  const threads = Object.keys(byThread).map(th => {
    const t = threadInfo_(th);
    let title = th, walkTitle = '';
    if (t) {
      const w = t.walk;
      walkTitle = w ? w['Title'] + ', ' + walkOut_(w).dateText : '';
      const leader = w ? leaders.find(x => String(x['Leader ID']) === String(w['Leader ID'])) : t.leader;
      if (t.kind === 'group') title = 'Group updates from ' + (leader ? leader['Name'] : 'the walk leader');
      if (t.kind === 'walker') title = (t.signup ? t.signup['Name'] : 'Walker') + ' and ' + (leader ? leader['Name'] : 'the walk leader');
      if (t.kind === 'walker-staff') title = (t.signup ? t.signup['Name'] : 'Walker') + ' and staff';
      if (t.kind === 'leader-staff') title = (t.leader ? t.leader['Name'] : 'Walk leader') + ' and staff';
    }
    const m = msgs(th);
    return { thread: th, kind: t ? t.kind : '', title: title, walkTitle: walkTitle, canSend: !!t, messages: m, last: m.length ? m[m.length - 1].sent : '' };
  }).sort((a, b) => String(b.last).localeCompare(String(a.last)));
  const reported = chat.filter(r => r['Reported']).map(msgOut_).reverse();
  return { ok: true, role: 'staff', threads: threads, reported: reported };
}

/* ===================== writing ===================== */

function send_(b) {
  const me = who_(b);
  if (!me) return { ok: false, error: 'not_found' };
  const t = threadInfo_(b.thread);
  if (!canSend_(me, t)) return { ok: false, error: 'not_allowed' };
  const text = clean_(String(b.text || '').replace(/\r/g, ''), 4000);
  if (!text) return { ok: false, error: 'empty' };
  const walkId = t.walk ? String(t.walk['Walk ID']) : '';
  appendObj_('Chat', { 'Message ID': newId_('M'), 'Sent': new Date(), 'Walk': walkId, 'Thread': t.thread, 'From': me.role,
    'From name': safeCell_(me.name), 'Text': safeCell_(text) });
  notify_(me, t);
  return { ok: true };
}

function report_(b) {
  const me = who_(b);
  if (!me) return { ok: false, error: 'not_found' };
  const r = readTab_('Chat').find(x => String(x['Message ID']) === cleanLine_(b.id, 40));
  if (!r || !canSee_(me, threadInfo_(r['Thread']))) return { ok: false, error: 'not_found' };
  const note = clean_(b.note, 1000);
  writeCells_('Chat', r._row, { 'Reported': new Date(), 'Reported by': safeCell_(me.role + ': ' + me.name), 'Report note': safeCell_(note) });
  const to = staffEmail_();
  if (to) MailApp.sendEmail({ to: to, name: senderName_(), subject: 'A message was reported',
    body: [me.name + ' (' + me.role + ') reported a message from ' + r['From name'] + '.', note ? 'Their note: ' + note : '', '',
      'Read it, and the whole conversation, on the staff messages page:', staffUrl_()].join('\n') });
  return { ok: true };
}

// Email notices never include the message. At most one notice per person per conversation every 15 minutes.
function notify_(me, t) {
  const cache = CacheService.getScriptCache();
  const tell = (email, name, link, about) => {
    if (!email) return;
    const key = 'n:' + t.thread + ':' + String(email).toLowerCase();
    if (cache.get(key)) return;
    cache.put(key, '1', 900);
    try {
      MailApp.sendEmail({ to: String(email), name: senderName_(), subject: 'New message: ' + about,
        body: ['Hi ' + String(name || '').split(' ')[0] + ',', '', 'You have a new message from ' + (me.role === 'staff' ? 'Resilient Healers staff' : me.name) + ' about ' + about + '.', '',
          'Read it and reply here:', link, '', 'For everyone\'s privacy, messages stay on the Resilient Healers site, and replying to this email does not reach them.', '', 'Resilient Healers'].join('\n') });
    } catch (e) { /* daily email limit: the message is still on the site */ }
  };
  const w = t.walk, about = w ? '"' + w['Title'] + '"' : 'Resilient Healers';
  const leader = w ? readTab_('Leaders').find(l => String(l['Leader ID']) === String(w['Leader ID'])) : t.leader;
  const staffTo = staffEmail_();
  if (t.kind === 'group') {
    readTab_('Sign-ups').filter(r => String(r['Walk']) === t.key && (r['Status'] === 'Going' || r['Status'] === 'Waitlist'))
      .forEach(r => tell(r['Email'], r['Name'], inboxUrl_(r['Cancel code']), about));
  } else if (t.kind === 'walker') {
    if (me.role !== 'leader' && leader) tell(leader['Email'], leader['Name'], leaderMessagesUrl_(leader['Private link code']), about);
    if (me.role !== 'walker' && t.signup) tell(t.signup['Email'], t.signup['Name'], inboxUrl_(t.key), about);
  } else if (t.kind === 'walker-staff') {
    if (me.role !== 'staff') tell(staffTo, 'Resilient Healers', staffUrl_(), about);
    else if (t.signup) tell(t.signup['Email'], t.signup['Name'], inboxUrl_(t.key), about);
  } else if (t.kind === 'leader-staff') {
    if (me.role !== 'staff') tell(staffTo, 'Resilient Healers', staffUrl_(), 'a walk leader');
    else if (t.leader) tell(t.leader['Email'], t.leader['Name'], leaderMessagesUrl_(t.leader['Private link code']), 'your walks');
  }
}

/* A walker who lost their email can ask for their messages link again. Same answer either way. */
function walkerLink_(b) {
  const email = cleanLine_(b.email, 200).toLowerCase();
  const s = readTab_('Sign-ups').find(r => String(r['Walk']) === String(b.walk) && String(r['Email']).toLowerCase() === email && (r['Status'] === 'Going' || r['Status'] === 'Waitlist'));
  if (s) {
    const w = liveWalk_(b.walk);
    MailApp.sendEmail({ to: email, name: senderName_(), subject: 'Your messages link: ' + (w ? w['Title'] : 'your walk'),
      body: ['Hi ' + String(s['Name']).split(' ')[0] + ',', '', 'Here is your private link to message your walk leader and read their updates:', inboxUrl_(s['Cancel code']), '', "Don't share it.", '', 'Resilient Healers'].join('\n') });
  }
  return { ok: true };
}

/* ===================== reminders ===================== */

/** Run once from the editor. Checks every hour whether any reminders are due. */
function installReminders() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendReminders').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendReminders').timeBased().everyHours(1).create();
  Logger.log('Reminders will be checked every hour.');
}

// Days from today (Pacific time) to a yyyy-mm-dd date.
function daysUntil_(ymd, now) {
  const today = Utilities.formatDate(now, 'America/Los_Angeles', 'yyyy-MM-dd');
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

function sendReminders() {
  ensureSetup_();
  const now = new Date();
  const hour = +Utilities.formatDate(now, 'America/Los_Angeles', 'H');
  const walks = readTab_('Walks').filter(w => w['Status'] === 'Live' && dateText_(w['Date']));
  const signups = readTab_('Sign-ups');
  let sent = 0;
  walks.forEach(w => {
    const out = walkOut_(w), days = daysUntil_(out.date, now);
    // Two days before (from 9 AM), and the morning of the walk (from 6 AM, until it starts). Pacific time.
    const which = days === 2 && hour >= 9 ? 'Reminder 2 days' : days === 0 && hour >= 6 && Utilities.formatDate(now, 'America/Los_Angeles', 'HH:mm') < (out.start || '23:59') ? 'Reminder day of' : '';
    if (!which) return;
    signups.filter(r => String(r['Walk']) === String(w['Walk ID']) && r['Status'] === 'Going' && !r[which]).forEach(r => {
      try {
        MailApp.sendEmail({ to: String(r['Email']), name: senderName_(),
          subject: (which === 'Reminder day of' ? 'Today: ' : 'Coming up ' + out.dateText.split(',')[0] + ': ') + w['Title'],
          body: reminderBody_(w, out, r, which).join('\n') });
        writeCells_('Sign-ups', r._row, { [which]: new Date() });
        sent++;
      } catch (e) { /* daily email limit: try again next hour */ }
    });
  });
  const asked = sendReviewRequests_();
  Logger.log('Sent ' + sent + ' reminder(s) and ' + asked + ' review request(s).');
}

function reminderBody_(w, out, r, which) {
  const first = String(r['Name']).split(' ')[0];
  const dir = 'https://www.google.com/maps/dir/?api=1&destination=' + out.lat + ',' + out.lng;
  const cancel = siteUrl_() + '?walk=' + encodeURIComponent(out.id) + '&cancel=' + encodeURIComponent(r['Cancel code']) + '#walk';
  const lines = ['Hi ' + first + ',', '', which === 'Reminder day of' ? 'See you this morning.' : 'A reminder that your Resilient Healers walk is coming up.', '',
    'When: ' + out.dateText + ', ' + out.timeText, 'Where: ' + out.place];
  if (out.find) lines.push('Finding the group: ' + out.find);
  if (out.parking) lines.push('Parking: ' + out.parking);
  lines.push('Directions: ' + dir, '', 'Bring a water bottle.', '',
    'Updates and messages from your walk leader:', inboxUrl_(r['Cancel code']), '',
    "Can't make it? Please cancel so someone on the waitlist can come:", cancel, '', 'Resilient Healers');
  return lines;
}
