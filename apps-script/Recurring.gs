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
 */

TABS['Walks'] = TABS['Walks'].concat(['Next walk']);

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
    let next = nextOccurrence_(date, w['Repeats']);
    if (!next) return;
    while (next < today) next = nextOccurrence_(next, w['Repeats']);   // skip dates missed while nobody checked
    const base = String(w['Walk ID']).replace(/-\d{4}-\d{2}-\d{2}$/, '');
    let id = base + '-' + next;
    if (ids[id]) id = newId_('W');
    const row = {};
    TABS['Walks'].forEach(h => { row[h] = w[h]; });
    Object.assign(row, { 'Walk ID': id, 'Date': "'" + next, 'Start': "'" + timeText_(w['Start']), 'End': w['End'] ? "'" + timeText_(w['End']) : '',
      'Staff note': '', 'Pending edit': '', 'Takes over': '', 'Next walk': '', 'Created': new Date(), 'Updated': new Date() });
    appendObj_('Walks', row);
    writeCells_('Walks', w._row, { 'Next walk': id });
    ids[id] = true; added++;
  });
  return added;
}
