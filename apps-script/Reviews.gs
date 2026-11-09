/**
 * Resilient Healers: reviews from walkers.
 *
 * Decided November 9, 2026:
 *  - The day after a walk, people who were signed up ("Going") get one email asking how it went,
 *    with a private link to leave a review (?rate=<their sign-up code>#rate).
 *  - Every review waits for staff approval (a "walker-review" item on the staff review page).
 *    Approved reviews are Published: they show on the walk leader's profile, and one shows as a card
 *    (like the sponsor card) when someone searches a city nearby. Not on walk pages, which are busy enough.
 *  - Walk leaders don't reply to reviews publicly.
 *  - Reviews show only the first name and role the walker chooses, never their email.
 */

TABS['Sign-ups'] = TABS['Sign-ups'].concat(['Review request']);
TABS['Reviews'] = TABS['Reviews'].concat(['Item ID']);
TABS['Walker reviews'] = TABS['Walker reviews'].concat(['Sign-up code', 'Submitted']);

function rateUrl_(code) { return siteUrl_() + '?rate=' + encodeURIComponent(code) + '#rate'; }
function todayPT_() { return Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd'); }

// The sign-up behind a review link, with its walk and walk leader. Only people who were Going can review.
function rateContext_(code) {
  code = cleanLine_(code, 80);
  if (!code) return null;
  const s = readTab_('Sign-ups').find(r => String(r['Cancel code']) === code);
  if (!s) return null;
  const w = readTab_('Walks').find(x => String(x['Walk ID']) === String(s['Walk']));
  const l = w ? readTab_('Leaders').find(x => String(x['Leader ID']) === String(w['Leader ID'])) : null;
  const existing = readTab_('Walker reviews').find(r => String(r['Sign-up code']) === code) || null;
  return { s: s, w: w, l: l, existing: existing, code: code };
}

function rateInfo_(b) {
  const c = rateContext_(b.code);
  if (!c || !c.w) return { ok: false, error: 'not_found' };
  const out = walkOut_(c.w);
  const walked = out.date && out.date <= todayPT_();
  return {
    ok: true, walk: { title: out.title, dateText: out.dateText, place: out.place }, leaderName: c.l ? c.l['Name'] : '',
    firstName: String(c.s['Name']).split(' ')[0], role: String(c.s['Profession'] || ''),
    canReview: c.s['Status'] === 'Going' && !!walked, notYet: !walked,
    existing: c.existing ? { rating: Number(c.existing['Rating']), text: String(c.existing['Text']), status: c.existing['Status'] } : null
  };
}

function submitReview_(b) {
  const c = rateContext_(b.code);
  if (!c || !c.w || !c.l) return { ok: false, error: 'not_found' };
  const out = walkOut_(c.w);
  if (c.s['Status'] !== 'Going' || !out.date || out.date > todayPT_()) return { ok: false, error: 'not_allowed' };
  const rating = Math.round(Number(b.rating));
  const text = clean_(String(b.text || '').replace(/\r/g, ''), 1500);
  const name = cleanLine_(b.name, 40), role = cleanLine_(b.role, 80);
  if (!(rating >= 1 && rating <= 5) || text.length < 10 || !name || b.consent !== true) return { ok: false, error: 'missing_fields' };
  const cells = { 'Rating': rating, 'Text': safeCell_(text), 'Name': safeCell_(name), 'Role': safeCell_(role), 'Submitted': new Date() };
  if (c.existing) {
    if (c.existing['Status'] !== 'Pending') return { ok: false, error: 'already_reviewed' };
    writeCells_('Walker reviews', c.existing._row, cells);  // still waiting for staff: update it in place
    return { ok: true, updated: true };
  }
  const id = newId_('R');
  appendObj_('Walker reviews', Object.assign({ 'Review ID': id, 'Leader ID': String(c.w['Leader ID']), 'Walk ID': String(c.w['Walk ID']),
    'Date': "'" + out.date.slice(0, 7), 'Status': 'Pending', 'Sample': '', 'Sign-up code': c.code }, cells));
  const reviewCode = openReview_('walker-review', String(c.w['Leader ID']), String(c.w['Walk ID']));
  const rr = readTab_('Reviews').find(x => String(x['Review code']) === reviewCode);
  if (rr) writeCells_('Reviews', rr._row, { 'Item ID': id });
  return { ok: true };
}

// Called from decideLocked_ for "walker-review" items. Returns the message for staff.
function decideWalkerReview_(r, approve, note) {
  const wr = readTab_('Walker reviews').find(x => String(x['Review ID']) === String(r['Item ID']));
  if (wr) writeCells_('Walker reviews', wr._row, { 'Status': approve ? 'Published' : 'Declined' });
  writeCells_('Reviews', r._row, { 'Status': approve ? 'Approved' : 'Declined', 'Decided': new Date(), 'Staff note': note });
  return approve ? 'Published. It now shows on the walk leader\'s profile and can appear as a review card when people search nearby.' : 'Not published. Nothing was sent to the walker or the walk leader.';
}
function walkerReviewData_(r) {
  const wr = readTab_('Walker reviews').find(x => String(x['Review ID']) === String(r['Item ID']));
  return wr ? { rating: Number(wr['Rating']), text: String(wr['Text']), name: String(wr['Name']), role: String(wr['Role']) } : null;
}

// Part of the hourly job: the day after a walk (from 10 AM Pacific), ask people who were Going how it went.
function sendReviewRequests_() {
  const now = new Date();
  if (+Utilities.formatDate(now, 'America/Los_Angeles', 'H') < 10) return 0;
  const walks = readTab_('Walks').filter(w => w['Status'] === 'Live' && dateText_(w['Date']));
  const signups = readTab_('Sign-ups');
  const leaders = readTab_('Leaders');
  let sent = 0;
  walks.forEach(w => {
    const out = walkOut_(w);
    if (daysUntil_(out.date, now) !== -1) return;
    const l = leaders.find(x => String(x['Leader ID']) === String(w['Leader ID']));
    signups.filter(r => String(r['Walk']) === String(w['Walk ID']) && r['Status'] === 'Going' && !r['Review request']).forEach(r => {
      try {
        MailApp.sendEmail({ to: String(r['Email']), name: senderName_(), subject: 'How was your walk?',
          body: ['Hi ' + String(r['Name']).split(' ')[0] + ',', '', 'Thanks for joining "' + w['Title'] + '"' + (l ? ' with ' + l['Name'] : '') + ' yesterday.', '',
            'Would you share how it went? A few sentences help other healthcare workers decide to come, and help your walk leader.', '',
            'Leave a review here (it takes a minute):', rateUrl_(r['Cancel code']), '',
            'Only your first name and role are shown with your review, never your email. Our team reads every review before it is published.', '', 'Resilient Healers'].join('\n') });
        writeCells_('Sign-ups', r._row, { 'Review request': new Date() });
        sent++;
      } catch (e) { /* daily email limit: try again next hour */ }
    });
  });
  return sent;
}
