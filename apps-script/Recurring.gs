/**
 * Resilient Healers: repeating walks.
 *
 * A walk's "Repeats" says how often it happens, for example:
 *   "One time"
 *   "Weekly, Sundays"
 *   "Every 2 weeks, Saturdays"
 *   "Monthly, second Sunday"   (first, second, third, fourth or last)
 * Walk leaders pick Weekly, Every 2 weeks or Monthly in the walk form; the site stores it in this
 * spelled-out form, worked out from the walk's date (see normalizeRepeats_).
 *
 * When a repeating walk's date has passed, the hourly job (sendReminders) adds the next one as a new
 * walk with its own ID and an empty sign-up list, copying everything else (details, pin, photo,
 * walk leader, Sample flag). The old walk keeps its sign-ups, messages and reviews, and its
 * "Next walk" column points to the new one so it's never copied twice.
 *
 * Also here (decided November 9, 2026):
 *  - The walk page shows the next few dates of a repeating walk.
 *  - Walk leaders can skip a single future date (a holiday, say) or end the series, from their walk leader page.
 *    Both take effect right away, without staff review, since they only remove dates.
 *  - The "How was your walk?" email offers to save a spot on the next date (?again=<sign-up code>#again).
 */

TABS['Walks'] = TABS['Walks'].concat(['Next walk', 'Skip dates']);   // Skip dates: comma-separated yyyy-mm-dd

const NTH_ = ['first', 'second', 'third', 'fourth'];
const DAYS_ = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ymdToDate_(ymd) { return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10))); }
function dateToYmd_(d) { return d.toISOString().slice(0, 10); }
function isLastWeekdayOfMonth_(d) { const n = new Date(d.getTime() + 7 * 86400000); return n.getUTCMonth() !== d.getUTCMonth(); }

// Turns the form's choice into the spelled-out pattern, from the walk's date.
function normalizeRepeats_(choice, ymd) {
  choice = String(choice || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return choice;
  const d = ymdToDate_(ymd), day = DAYS_[d.getUTCDay()];
  if (/^weekly/i.test(choice)) return 'Weekly, ' + day + 's';
  if (/^every 2 weeks/i.test(choice)) return 'Every 2 weeks, ' + day + 's';
  if (/^monthly/i.test(choice)) {
    if (/(first|second|third|fourth|last) \w+day/i.test(choice)) return choice;   // already spelled out
    const n = Math.floor((d.getUTCDate() - 1) / 7);
    return 'Monthly, ' + (n >= 4 ? 'last' : NTH_[n]) + ' ' + day;   // a 5th weekday becomes "last"
  }
  return choice || 'One time';
}

// The next date after ymd for this pattern, or '' if it doesn't repeat.
function nextOccurrence_(ymd, repeats) {
  const r = String(repeats || '');
  const d = ymdToDate_(ymd);
  if (/^weekly/i.test(r)) return dateToYmd_(new Date(d.getTime() + 7 * 86400000));
  if (/^every 2 weeks/i.test(r)) return dateToYmd_(new Date(d.getTime() + 14 * 86400000));
  if (/^monthly/i.test(r)) {
    const m = /(first|second|third|fourth|last) (\w+day)/i.exec(r);
    const dayIdx = m ? DAYS_.findIndex(x => x.toLowerCase() === m[2].toLowerCase()) : d.getUTCDay();
    const which = m ? m[1].toLowerCase() : NTH_[Math.min(3, Math.floor((d.getUTCDate() - 1) / 7))];
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + 1;           // next month
    const first = new Date(Date.UTC(y, mo, 1));
    const offset = (dayIdx - first.getUTCDay() + 7) % 7;
    if (which === 'last') {
      const lastDay = new Date(Date.UTC(y, mo + 1, 0));
      const back = (lastDay.getUTCDay() - dayIdx + 7) % 7;
      return dateToYmd_(new Date(lastDay.getTime() - back * 86400000));
    }
    return dateToYmd_(new Date(first.getTime() + (offset + 7 * NTH_.indexOf(which)) * 86400000));
  }
  return '';
}

// Part of the hourly job: add the next date of every repeating walk whose date has passed.
function rollRecurringWalks_() {
  const today = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  const walks = readTab_('Walks');
  const ids = {}; walks.forEach(w => { ids[String(w['Walk ID'])] = true; });
  let added = 0;
  walks.forEach(w => {
    const date = dateText_(w['Date']);
    if (w['Status'] !== 'Live' || !date || date >= today || w['Next walk']) return;
    const skips = skipList_(w);
    let next = nextOccurrence_(date, w['Repeats']);
    if (!next) return;
    // Skip dates missed while nobody checked, and dates the walk leader skipped.
    while (next < today || skips.indexOf(next) >= 0) next = nextOccurrence_(next, w['Repeats']);
    const base = String(w['Walk ID']).replace(/-\d{4}-\d{2}-\d{2}$/, '');
    let id = base + '-' + next;
    if (ids[id]) id = newId_('W');
    const row = {};
    TABS['Walks'].forEach(h => { row[h] = w[h]; });
    Object.assign(row, { 'Walk ID': id, 'Date': "'" + next, 'Start': "'" + timeText_(w['Start']), 'End': w['End'] ? "'" + timeText_(w['End']) : '',
      'Staff note': '', 'Pending edit': '', 'Takes over': '', 'Next walk': '', 'Skip dates': skipCell_(skips.filter(d => d > next)), 'Created': new Date(), 'Updated': new Date() });
    appendObj_('Walks', row);
    writeCells_('Walks', w._row, { 'Next walk': id });
    ids[id] = true; added++;
  });
  return added;
}

/* ---------- upcoming dates, skipping and ending a series ---------- */

function isRepeating_(w) { return /^(weekly|every 2 weeks|monthly)/i.test(String(w['Repeats'] || '')); }
// Written with a leading apostrophe so Sheets keeps it as text (a single date would otherwise turn into a date cell).
function skipCell_(list) { return list.length ? "'" + list.join(',') : ''; }
function skipList_(w) {
  const v = w['Skip dates'];
  if (v instanceof Date) return [Utilities.formatDate(v, 'America/Los_Angeles', 'yyyy-MM-dd')];
  return String(v || '').split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)); }

// The next n dates after this walk's own date, with skipped ones marked.
function seriesDates_(w, n) {
  const date = dateText_(w['Date']);
  if (!date || !isRepeating_(w) || w['Next walk']) return [];
  const skips = skipList_(w), out = [];
  let d = date;
  for (let i = 0; i < n; i++) {
    d = nextOccurrence_(d, w['Repeats']);
    if (!d) break;
    out.push({ date: d, text: niceDate_(d), skipped: skips.indexOf(d) >= 0 });
  }
  return out;
}
// For the public walk page: the next few dates that will happen.
function nextDates_(w) { return seriesDates_(w, 8).filter(x => !x.skipped).slice(0, 3).map(x => ({ date: x.date, text: x.text })); }

function leaderSeriesWalk_(b) {
  const l = leaderByCode_(b.code);
  if (!l) return null;
  const w = readTab_('Walks').find(x => String(x['Walk ID']) === String(b.walkId) && String(x['Leader ID']) === String(l['Leader ID']));
  if (!w || w['Status'] !== 'Live' || !isRepeating_(w) || w['Next walk']) return null;
  return w;
}
// Walk leader skips (or un-skips) one future date of their repeating walk.
function skipDate_(b) {
  const w = leaderSeriesWalk_(b);
  if (!w) return { ok: false, error: 'not_found' };
  const date = cleanLine_(b.date, 10);
  if (!seriesDates_(w, 6).some(x => x.date === date)) return { ok: false, error: 'bad_date' };
  let skips = skipList_(w).filter(d => d !== date);
  if (b.skip !== false) skips.push(date);
  skips.sort();
  writeCells_('Walks', w._row, { 'Skip dates': skipCell_(skips), 'Updated': new Date() });
  return { ok: true };
}
// Walk leader ends the series: the current date still happens; no new dates are added after it.
function endSeries_(b) {
  const w = leaderSeriesWalk_(b);
  if (!w) return { ok: false, error: 'not_found' };
  writeCells_('Walks', w._row, { 'Repeats': 'One time', 'Skip dates': '', 'Updated': new Date() });
  return { ok: true };
}

/* ---------- "save my spot on the next date" (?again=<sign-up code>#again) ---------- */

// The next upcoming live date of the series a sign-up belongs to.
function nextInSeries_(walkId, walks) {
  const today = todayPT_();
  let w = walks.find(x => String(x['Walk ID']) === String(walkId)), guard = 0;
  while (w && guard++ < 60) {
    if (w['Status'] === 'Live' && dateText_(w['Date']) > today && String(w['Walk ID']) !== String(walkId)) return w;
    const nx = String(w['Next walk'] || '');
    w = nx ? walks.find(x => String(x['Walk ID']) === nx) : null;
  }
  return null;
}
function againContext_(code) {
  code = cleanLine_(code, 80);
  if (!code) return null;
  const s = readTab_('Sign-ups').find(r => String(r['Cancel code']) === code && r['Status'] !== 'Interested');
  if (!s) return null;
  const walks = readTab_('Walks');
  return { s: s, next: nextInSeries_(s['Walk'], walks) };
}
function againInfo_(b) {
  const c = againContext_(b.code);
  if (!c) return { ok: false, error: 'not_found' };
  if (!c.next) return { ok: true, none: true };
  const out = walkOut_(c.next), email = String(c.s['Email']).toLowerCase();
  const mine = readTab_('Sign-ups').find(r => String(r['Walk']) === out.id && String(r['Email']).toLowerCase() === email && (r['Status'] === 'Going' || r['Status'] === 'Waitlist'));
  const cnt = counts_(out.id);
  return { ok: true, firstName: String(c.s['Name']).split(' ')[0],
    walk: { id: out.id, title: out.title, dateText: out.dateText, timeText: out.timeText, place: out.place, spots: out.spots, going: cnt.going },
    already: mine ? (mine['Status'] === 'Going' ? 'going' : 'waitlist') : '' };
}
function signupAgain_(b) {
  const c = againContext_(b.code);
  if (!c || !c.next) return { ok: false, error: 'not_found' };
  const s = c.s;
  return signup_({ walk: String(c.next['Walk ID']), name: String(s['Name']), email: String(s['Email']), phone: String(s['Phone']),
    profession: String(s['Profession']), accommodation: String(s['Accommodation'] || ''), hcw: true });
}
function againUrl_(code) { return siteUrl_() + '?again=' + encodeURIComponent(code) + '#again'; }
