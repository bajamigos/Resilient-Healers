# How Resilient Healers works

A plain-language guide to everything behind the site: where it lives, what each part does, and how to run and fix it. Written November 9, 2026. If you remember nothing else, start with "Where everything lives" and "Everyday tasks."

## What it is

Resilient Healers is a website where healthcare workers find free small-group walks, sign up, and talk with the person leading the walk. Priya leads the first walk at Lake Murray in San Diego. People who want to lead walks in other places can apply, and staff approve them.

It's a test site for now. The lavender banner at the top says so, and sample walks fill the map.

## Where everything lives

| What | Where | Notes |
|---|---|---|
| The website | https://resilienthealers.github.io/ | One file, `index.html`. |
| The website's code | GitHub: `resilienthealers/resilienthealers.github.io` | The "resilienthealers" organization belongs to your **bajamigos** GitHub account. Changing a file here changes the live site within a minute or two. |
| The data (sign-ups, walks, leaders, messages) | Google Sheet **"Resilient Healers sign-ups"** | Owned by **resilienthealers@gmail.com**. |
| The backend (the code that saves data and sends emails) | Google Apps Script project **"Resilient Healers sign-up backend"** | Also owned by resilienthealers@gmail.com. Find it at script.google.com while signed in as that account. |
| Walk leader photos | Google Drive folder **"Resilient Healers walk leader photos"** | Same account. |
| All emails the site sends | Sent from **resilienthealers@gmail.com** | Staff emails (approvals, reports, contact form) also arrive there. |
| Decisions, open questions, notes for Priya | The claude.ai Project **"Resilient Healers App"** | Docs: "unresolved and tabled," "questions for Priya," "notes for next MVP meeting," and this guide. |
| Coach ads | A private Claude design canvas, "Coach ad: Advertise on Resilient Healers" | Square Instagram post and a story version. |

The backend's settings ("Script properties," under Project Settings in Apps Script):

- `SHEET_ID`: which Google Sheet to use.
- `SITE_URL`: https://resilienthealers.github.io/ (used to build links in emails).
- `ORGANIZER_EMAIL`: where contact-form messages go.
- `STAFF_EMAIL`: where approval requests and reports go. Falls back to `ORGANIZER_EMAIL`.
- `STAFF_CODE`: the secret in the staff messages link. Created automatically.

## Who uses the site, and how they get in

Nobody has a password. Each person gets a **private link** by email, and the link is their key. Anyone with someone's link can act as them, which is fine for testing but needs real sign-in before a real launch.

| Person | What they get | Private link looks like |
|---|---|---|
| Visitor | The map, walk pages, contact form, "Lead a walk" page | (public) |
| Walker (signed up) | Confirmation email with a **messages link** and a **cancel link** | `?inbox=…#inbox` and `?walk=…&cancel=…#walk` |
| Walk leader | Their **walk leader page**: profile, walks, who's coming, messages, propose new walks | `?leader=…#my-walks` |
| Staff (you) | **Review pages** for each approval, and one **staff messages page** | `?review=…#review` and `?staff=…#staff` |

Lost links:
- A walker can ask for their messages link again from the walk page ("Message your walk leader," then enter their email).
- A walk leader can ask for theirs on the "Lead a walk" page ("Already a walk leader?").
- Staff: run `sendStaffLink` in Apps Script to email the staff messages link to `STAFF_EMAIL`.

## How each part works

### Finding a walk
The opening page shows a map of the US. Copper pins are scheduled walks; taupe pins are "coming soon" walks with no leader yet. Searching a city zooms in and lists walks within 100 miles, nearest first. After a search, and on walk pages, a local sponsored ad may show (today only Metamorphosis Coaching, within 60 miles of San Diego). Ads never show on the opening page.

### Signing up, cancelling, the waitlist
- A walk page shows spots taken and spots left. Signing up asks for name, email, phone, profession, a healthcare checkbox and optional mobility needs.
- If there's room, the person is **Going**. If the walk is full, they're on the **Waitlist**.
- Their confirmation email has the messages link and the cancel link.
- When a Going person cancels, the first person on the waitlist moves up automatically and gets an email.
- Signing up twice with the same email just says "You're already on the list."

### Reminder emails
People who are Going get two reminders: **two days before** (from 9 AM) and **the morning of the walk** (from 6 AM, until it starts). Times are Pacific. The email has the time, place, how to find the group, a Google Maps directions link, the messages link and the cancel link. The Sheet records when each reminder went, so nobody gets one twice.

This runs on an hourly schedule that has to be switched on once. See "One-time setup still needed."

### Coming-soon walks and the interest list
A coming-soon walk has a place but no leader or date. Its page has two buttons:
- **"I'd join this walk"**: name, email, profession. The person goes on the interest list (status **Interested**) and gets an email with a link to leave it. The page, list and map show how many people would join.
- **"Lead this walk"**: opens the walk leader application with that place and pin already filled in.

### Becoming a walk leader
1. Someone applies on the "Lead a walk" page with their profile and first walk in one form, including dragging a pin to the exact meeting spot.
2. Staff get an email with a **review link**. The review page shows the profile, the walk, a map of the pin and, if it applies, which coming-soon walk it takes over.
3. Staff click **Approve** or **Request changes** (with a note). The leader gets an email either way.
4. On approval, the walk goes live. If it takes over a coming-soon walk, that walk comes off the map, the new walk keeps its photo, and everyone on its interest list gets **one email** with the date and sign-up link. Spots are first come, first served.
5. Approved leaders propose more walks from their walk leader page. **Every new walk needs approval**, and so do changes to a live walk or to a profile. Live walks keep their old details until changes are approved.

### Messaging
Once someone has signed up or been approved, conversations happen on the site, not by email:
- **Walker and walk leader**, one-to-one.
- **Walk leader to everyone signed up** (walkers can read but not reply there; they reply one-to-one).
- **Walker and staff**, and **walk leader and staff**.
- No messaging between walkers.

Emails only say "You have a new message," with a link. They never contain the message, so the full record stays in the Sheet's **Chat** tab. Walkers' email and phone are never shown to walk leaders. At most one notice per person per conversation every 15 minutes.

Every message has **"Report this message."** Staff get an email, and the staff messages page lists reported messages at the top with who reported it and their note. Only staff and the person who reported can see that a message was reported.

### Contact form
The Contact page sends a message to `ORGANIZER_EMAIL` and saves it in the **Messages** tab. It says clearly that it goes to Resilient Healers staff, and points walk questions to "Message your walk leader."

## The Sheet, tab by tab

| Tab | One row per | Key columns |
|---|---|---|
| Sign-ups | person per walk | Status: **Going**, **Waitlist**, **Cancelled**, **Interested** (coming-soon list), **Notified** (emailed when it got a date). Also the private code and reminder dates. |
| Walks | walk | Status: **Pending review**, **Live**, **Changes requested**, **Replaced** (a coming-soon walk that was taken over). "Sample" marks demo walks. No date means coming soon. |
| Leaders | walk leader | Status: **Pending review**, **Approved**, **Changes requested**. Private link code. |
| Reviews | thing waiting for staff | Type (application, walk, walk-edit, profile-edit), Open or decided. |
| Chat | message | Thread, who sent it, text, and report details. |
| Messages | contact-form message | |

You can read and fix anything directly in the Sheet. Avoid deleting columns or renaming tabs; the backend finds things by header name.

## Everyday tasks

- **Approve a walk leader or walk:** open the review link in the staff email, read, then Approve or Request changes.
- **Handle a report:** open the staff messages page (link in the report email), read the whole conversation, and reply as staff in that conversation if needed.
- **Remove a walker:** in Sign-ups, set their Status to **Cancelled**. They can still read old messages and write to staff, but not to the leader.
- **Remove a walk leader:** in Leaders, set Status to something other than Approved (for example "Removed"); they can no longer send messages or propose walks. In Walks, change their walks' Status from Live to "Removed" to take them off the map. Tell their walkers through the group message or by email.
- **Call off a walk:** for now, post in the group message, then set the walk's Status to "Cancelled" in the Sheet. (A proper "call off" button is on the to-do list.)
- **Answer a contact-form message:** reply from resilienthealers@gmail.com.
- **Remove all sample walks before a real launch:** run `removeSamples` in Apps Script.

## Changing the site or the backend

**The website** (`index.html`): edit it in the GitHub repository. The live site updates in a minute or two.

**The backend** (`apps-script/Code.gs`, `apps-script/Messaging.gs`, `apps-script/SampleData.gs` in the repository): the copy that actually runs lives in Apps Script, so after changing the files:
1. Open the Apps Script project as resilienthealers@gmail.com.
2. Replace the code in the editor with the three files, one after the other, in that order. Save.
3. **Deploy → Manage deployments → pencil (Edit) → Version: New version → Deploy.** This keeps the same web address, so the site keeps working. (Never choose "New deployment"; that makes a new address.)
4. If a "You're currently signed in as" box pops up and closes the dialog, click OK and start step 3 again.

**Functions you can run from the Apps Script editor** (choose one in the drop-down next to Run):
- `setup`: creates any missing tabs or columns. Also runs automatically.
- `installReminders`: switches on the hourly reminder check. Run once.
- `sendStaffLink`: emails the staff messages link to staff.
- `loadSamples` / `removeSamples`: add or remove the demo walks. Real walks aren't touched.
- `removeTestData`: deletes anyone named "Test Leader," sign-ups named "Test …," and puts back any coming-soon walk a test took over.

## One-time setup still needed

- **Reminders:** in Apps Script, run `installReminders` and approve the permission prompt (Review permissions, choose resilienthealers@gmail.com, Allow; if Google says the app isn't verified, Advanced, then Go to Resilient Healers sign-up backend). Until then, reminder emails don't go out.

## Limits to know about

- **100 emails a day.** Google's limit for a free Gmail account, counting every confirmation, reminder, notice and staff email. Fine for one or two walks; a real launch needs a proper email service.
- **Private links, not sign-in.** Anyone with a forwarded link can act as that person. Before real use, add sign-in (for example an emailed one-time code).
- **Reminder times are Pacific** for every walk, so East Coast walkers get theirs three hours "late" by their clock.
- **Google Sheets is a stopgap.** The plan is to move to Supabase later, especially for sign-in and messaging at scale.
- **Busy moments:** only one change is saved at a time. If many people act at once, someone may see "didn't send, try again."

## Where decisions are recorded

The claude.ai Project "Resilient Healers App" holds the running list of what's decided, what's tabled and what's waiting on Priya ("unresolved and tabled"). Check it before changing how something works.
