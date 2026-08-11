# App Store Guideline 1.2: what PLOT must ship for user-generated content

Research note for issue #482. Written 2026-08-10, ahead of PLOT's first App Store submission.

Every claim below is sourced to an Apple-owned page. Where a widely repeated piece of
folklore could not be traced to a primary source, it is called out as unverified rather
than repeated as fact. Developer forum threads are not treated as primary: they are other
developers reporting what a reviewer told them, not Apple publishing a rule.

## The short answer

Yes, PLOT triggers Guideline 1.2 today, before the activity feed is ever switched on.
Apple's threshold is not "does the app have a feed". The guideline opens with "apps with
user-generated content **or social networking services**", and PLOT is both: users upload
avatar images, choose usernames and display names, write profile bios and social links,
and follow each other, with public profiles exposing what they have watched and what they
love. That content is created by users and broadcast to other users. It is user-generated
content.

To satisfy 1.2, PLOT must ship four things, all four of which Apple lists as mandatory:
content filtering, a reporting mechanism with timely response, user blocking, and
published contact information. PLOT has none of the first three in its codebase today.

Source: [App Review Guidelines, 1.2 User-Generated
Content](https://developer.apple.com/app-store/review/guidelines/#1.2)

## 1. What Apple counts as user-generated content at the 1.2 threshold

### The guideline's own scope language

Apple's text, quoted verbatim:

> Apps with user-generated content present particular challenges, ranging from
> intellectual property infringement to anonymous bullying. To prevent abuse, apps with
> user-generated content or social networking services must include:

Two things follow from the exact wording. First, the trigger is disjunctive: "user-
generated content **or** social networking services". An app qualifies on either limb.
A follow graph between named users with public profiles is a social networking service on
the plain reading, independent of whether anything gets posted. Second, nothing in the
guideline conditions the requirement on a feed, a timeline, or a posting surface. Apple
never uses the word "feed" in 1.2 at all.

Source: [Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#1.2)

### Apple's own definition of UGC, from the age rating system

The clearest first-party definition Apple publishes sits in App Store Connect's age
rating reference, which defines each content descriptor and capability. Verbatim:

> **User-Generated Content**: Includes the broad distribution of content created by users
> as a component of the app's intended user experience. May include: broadly distributed
> videos, photos, text, and/or audio created by users of the app.

And separately:

> **Messaging and Chat**: Users can directly communicate with one another through features
> within the app. May include: text, voice and/or video chat, direct and/or group
> messaging, or public posting.

Both are 4+ capabilities, meaning declaring them does not by itself raise PLOT's age
rating.

Apple also defines a distinct, higher-rated capability:

> **Social Media**: Redistribution, amplification, or interaction with user-generated
> content through a social feed or similar discovery method that visibly spreads content
> to many users. May include: users reposting, liking, commenting, reacting, or making
> user-generated content more visible through a social feed, community, search, or other
> sharing and discovery tools.

Social Media triggers a **13+** rating.

Source: [Age ratings values and
definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)

### What that means for PLOT specifically

Photos and text created by users, distributed to other users, is exactly what a PLOT
public profile is. Avatars are user-uploaded photos. Usernames, display names, bios and
social links are user-authored text. All of it renders on a page another user can open.
Under Apple's own definition that is User-Generated Content, at 4+.

The useful nuance is the boundary with Social Media at 13+. Apple's Social Media
definition turns on redistribution and amplification through "a social feed or similar
discovery method that visibly spreads content to many users". Shipping without the
activity feed is a real, defensible distinction on Apple's own wording: PLOT would have
UGC without the amplification layer. Note the definition does say "or other sharing and
discovery tools", so any user-search or user-discovery surface should be checked against
it before declaring. But the important point is that avoiding Social Media at 13+ does not
avoid 1.2. Guideline 1.2 attaches to the UGC, and the moderation obligations attach to the
guideline, not to the age rating.

**Direct answer to the question asked:** a follow graph plus user-uploaded avatars and
usernames triggers 1.2 on its own, with no posts and no feed.

## 2. The exact mechanisms 1.2 requires

Apple's list, quoted verbatim and complete:

> *   A method for filtering objectionable material from being posted to the app
> *   A mechanism to report offensive content and timely responses to concerns
> *   The ability to block abusive users from the service
> *   Published contact information so users can easily reach you

Four items, presented as a flat list of things the app "must include". Reading them
precisely:

**Filtering.** The wording is "filtering objectionable material from being posted to the
app". It is preventative and applies at the point of posting, not only after the fact.
Apple does not name a technology, a vendor, a threshold, or an API anywhere in 1.2. No
first-party Apple page was found that mandates a specific moderation service or framework
for this, so the implementation is the developer's choice as long as a method exists.

**Reporting plus response.** Two obligations bundled in one bullet: a reporting mechanism,
and "timely responses to concerns". Apple does not define "timely" in the published
guideline text. See the unverified-claims section below.

**Blocking.** "The ability to block abusive users from the service." Note "from the
service", not "from your feed". Blocking should sever the relationship, not merely hide a
row.

**Published contact information.** "so users can easily reach you". This overlaps with
Guideline 1.5 and with the required Support URL field, both covered below.

Apple then states who owns enforcement, verbatim:

> It is your responsibility to remove content that violates this guideline, your terms of
> service, or your community standards. If we find such content, we will ask you to remove
> it, and provide a plan to improve your compliance with this guideline. Based on your
> response, your app may be removed from the App Store until you can demonstrate
> improvements that bring your app into compliance. Egregious or repeated behavior is
> grounds for immediate removal of your app from the App Store, and from the Apple
> Developer Program.

Two operational consequences. Apple expects a written remediation plan on demand, so
PLOT should have community standards or terms of service that define what "objectionable"
means for PLOT. And the escalation path ends at removal from the Developer Program, not
just the app being pulled.

There is also a hard content ceiling in the same guideline, verbatim:

> Apps with user-generated content or services that end up being used primarily for
> pornographic content, Chatroulette-style experiences, random or anonymous chat,
> objectification of real people (e.g. "hot-or-not" voting), making physical threats, or
> bullying do not belong on the App Store and may be removed without notice.

"Objectification of real people (e.g. 'hot-or-not' voting)" is worth flagging for a
ratings-driven app. PLOT rates titles, not people, so this does not bite, but any future
feature that ranks or scores other users would.

Source: [Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#1.2)

Guideline 1.2.1 (Creator Content) covers apps built around a community of "creators" who
author, share and monetize content as a structured programme. PLOT has no creator
programme, so 1.2.1 does not apply, though it is worth knowing it exists because it
reiterates that creator material "are treated as user-generated content by App Review".

Source: [Guideline
1.2.1](https://developer.apple.com/app-store/review/guidelines/#1.2.1)

## 3. Related guidelines that bite for this app shape

### 1.1 Objectionable Content

This is the substantive standard that 1.2's filtering and reporting machinery is meant to
enforce. Apple's framing, verbatim:

> Apps should not include content that is offensive, insensitive, upsetting, intended to
> disgust, in exceptionally poor taste, or just plain creepy.

The subsections most relevant to free-text bios, usernames and avatar images are 1.1.1
(defamatory, discriminatory or mean-spirited content, "particularly if the app is likely
to humiliate, intimidate, or harm a targeted individual or group") and 1.1.4 (overtly
sexual or pornographic material). PLOT's community standards should map onto these
categories so a reviewer can see the connection.

Source: [Guideline 1.1](https://developer.apple.com/app-store/review/guidelines/#1.1)

### 1.5 Developer Information

The published-contact-information limb of 1.2 has its own guideline, verbatim:

> People need to know how to reach you with questions and support issues. Make sure your
> app and its Support URL include an easy way to contact you [...] Failure to include
> accurate and up-to-date contact information not only frustrates customers, but may
> violate the law in some countries or regions.

Note "your app **and** its Support URL". An in-app contact route is expected, not just a
metadata field.

Source: [Guideline 1.5](https://developer.apple.com/app-store/review/guidelines/#1.5)

The Support URL field itself is mandatory in App Store Connect. Apple's field definition,
verbatim:

> The URL of the support website you plan to provide for users, which displays on the App
> Store for users who have downloaded your app. This URL must lead to actual contact
> information (legal address, email address, telephone number), as may be required by
> local law, so that users can reach you regarding app issues, general feedback, and
> feature enhancement requests.

Source: [Platform version
information](https://developer.apple.com/help/app-store-connect/reference/platform-version-information)

### 5.1.1(v) Account Sign-In and in-app account deletion

Verbatim:

> If your app doesn't include significant account-based features, let people use it
> without a login. If your app supports account creation, you must also offer account
> deletion within the app.

Apple's dedicated support page sets the deadline and the standard. Verbatim from that
page: the requirement applies to apps "submitted to the App Store that support account
creation" since June 30, 2022, developers must "Offer to delete the entire account record,
along with associated personal data", and "only offering to temporarily deactivate or
disable an account is insufficient". The deletion entry point must be easy to find,
typically in account settings, and "All users should be allowed to delete their accounts,
regardless of where they're located."

PLOT already satisfies this on iOS. `apps/mobile/app/(app)/settings.tsx` has a
`handleDeleteAccount` flow that calls the `delete-account` Supabase edge function, with
the shared cleanup logic in `supabase/functions/delete-account/`.

Sources: [Guideline
5.1.1](https://developer.apple.com/app-store/review/guidelines/#5.1.1), [Offering account
deletion in your
app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

### 5.1.1(i) Privacy policy

Verbatim, the privacy policy must "clearly and explicitly" identify what data is
collected and all uses of it, confirm equivalent protection by any third party the data is
shared with, and "Explain its data retention/deletion policies and describe how a user can
revoke consent and/or request deletion of the user's data." A link is required both in App
Store Connect metadata and inside the app "in an easily accessible manner".

Avatar images, usernames, bios and the follow graph all need to appear in PLOT's policy.

Source: [Guideline
5.1.1](https://developer.apple.com/app-store/review/guidelines/#5.1.1)

### 4.8 Login Services

Verbatim:

> Apps that use a third-party or social login service (such as Facebook Login, Google
> Sign-In, Log in with X, Sign In with LinkedIn, Login with Amazon, or WeChat Login) to
> set up or authenticate the user's primary account with the app must also offer as an
> equivalent option another login service with the following features:
>
> *   the login service limits data collection to the user's name and email address;
> *   the login service allows users to keep their email address private as part of
>     setting up their account; and
> *   the login service does not collect interactions with your app for advertising
>     purposes without consent.

And the carve-out that matters here, verbatim: "Another login service is not required if:
Your app exclusively uses your company's own account setup and sign-in systems."

This is currently satisfied by construction, not by accident. `apps/mobile/lib/launchFeatures.ts`
ships with `SHOW_APPLE_LOGIN = false` and Google sign-in behind
`EXPO_PUBLIC_SHOW_GOOGLE_LOGIN`, which is off. Email and password only means no
third-party login service is in play and 4.8 does not require a second option. The moment
Google sign-in is switched on for iOS, 4.8 requires an equivalent alternative, which in
practice means Sign in with Apple, which in turn requires the Apple Developer Program
membership PLOT is still waiting on. Keep Google off for the first submission unless Sign
in with Apple ships alongside it.

Source: [Guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#4.8)

### 5.1.2 Data Use and Sharing, and 1.6 Data Security

5.1.2(i), verbatim: "Unless otherwise permitted by law, you may not use, transmit, or
share someone's personal data without first obtaining their permission." 5.1.2(iii) forbids
surreptitiously building user profiles from collected data.

1.6, verbatim in full:

> Apps should implement appropriate security measures to ensure proper handling of user
> information collected pursuant to the Apple Developer Program License Agreement and
> these Guidelines (see Guideline 5.1 for more information) and prevent its unauthorized
> use, disclosure, or access by third parties.

For PLOT this points at the Supabase row-level security on the follow graph and on
whatever new report and block tables get added. A blocked user must not be able to read
the blocker's data through the API even if the UI hides it.

Sources: [Guideline
5.1.2](https://developer.apple.com/app-store/review/guidelines/#5.1.2), [Guideline
1.6](https://developer.apple.com/app-store/review/guidelines/#1.6)

### 2.1 App Completeness

Verbatim, the part that matters for a first submission with gated social features:

> Submissions to App Review, including apps you make available for pre-order, should be
> final versions with all necessary metadata and fully functional URLs included;
> placeholder text, empty websites, and other temporary content should be scrubbed before
> submission. Make sure your app has been tested on-device for bugs and stability before
> you submit it, and include demo account info (and turn on your back-end service!) if
> your app includes a login.

PLOT requires a login, so a working demo account is mandatory. And because reporting and
blocking only make sense between two accounts, the demo account needs a second account to
interact with, or the reviewer cannot exercise the flows.

Source: [Guideline 2.1](https://developer.apple.com/app-store/review/guidelines/#2.1)

### Age rating declaration

The age rating questionnaire in App Store Connect includes "a list of content descriptors,
in-app controls, and capabilities that allow you to specify the frequency of each content
type in your app". PLOT should declare User-Generated Content honestly. Under-declaring is
a metadata accuracy problem on top of a 1.2 problem.

Apple's in-app controls definitions cover Parental Controls and Age Assurance, and Apple
publishes a
[Declared Age Range API](https://developer.apple.com/documentation/declaredagerange)
referenced by the Social Media capability definition. Neither is required at 4+ with UGC
alone. They become relevant if PLOT later enables the feed and takes on the Social Media
capability.

Sources: [Set an app age
rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating),
[Age ratings values and
definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)

## 4. What reviewers actually check, from Apple's own account

Apple publishes review statistics and a list of common rejection causes on its App Review
page. Verbatim highlights:

> On average, 90% of submissions are reviewed in less than 24 hours.

> On average, over 40% of unresolved issues are related to guideline 2.1: App Completeness,
> which covers crashes, placeholder content, incomplete information, and more.

The listed common causes, with Apple's wording:

- Crashes and bugs. "Submit items for review only when they're complete and ready to be
  published."
- Broken links. "All links in your app must be functional. A link to user support with
  up-to-date contact information and a link to your privacy policy is required for all
  apps."
- Placeholder content. "Finalize all images and text before submitting for review."
- Incomplete information. "Enter all of the details needed for review in the App Review
  Information section of App Store Connect."
- Privacy policy defects, unclear data access requests, inaccurate screenshots,
  substandard user interface, web clippings and content aggregators, repeated similar
  apps, copycats, misleading users, insufficient value, and submission by the incorrect
  entity.

On demo accounts, verbatim:

> If some features require signing in, provide a valid demo account username and password.
> If there are special configurations to set, include the specifics. If features require
> an environment that is hard to replicate or require specific hardware, be prepared to
> provide a demo video or the hardware.

The practical reading for PLOT: the single largest documented rejection bucket is not
about moderation at all, it is completeness. A reviewer who cannot sign in, cannot find a
second user to report, or lands on a broken support link will produce a rejection before
the 1.2 question is ever reached. Ship the demo account, the second seeded account, a
working Support URL and a working privacy policy link, and record all of it in the App
Review Information notes.

Source: [App Review](https://developer.apple.com/distribute/app-review/)

### On "common rejection reasons for social-adjacent apps"

Apple does not publish a rejection-reason breakdown segmented by app category or by
guideline beyond the 2.1 figure quoted above. Claims circulating about typical 1.2
rejection patterns come from developer forum posts quoting individual rejection letters.
Those are useful intelligence but they are not Apple publishing a rule, so they are not
recorded here as requirements. What Apple does publish is the enforcement consequence
quoted in section 2: a request to remove content plus a compliance plan, escalating to app
removal and Developer Program removal.

## 5. Claims that could not be traced to a primary source

**"You must act on a report within 24 hours by removing the content and ejecting the
user."** This is repeated constantly and appears in many developer forum threads reporting
rejection letters, but it does not appear in the published text of Guideline 1.2, which
says only "timely responses to concerns". No Apple-published page stating a 24-hour
service level for UGC reports was located.

Treat it as a prudent operating target rather than a quoted rule. Building to a 24-hour
turnaround costs PLOT nothing at current scale and removes the argument entirely if a
reviewer raises it. Do not, however, write "as required by Apple, within 24 hours" into
PLOT's public terms, because that sourcing cannot be substantiated.

**A mandated moderation API or vendor.** No Apple guideline or documentation page requires
a particular filtering technology. 1.2 requires that a method exist.

## 6. Minimum viable implementation for PLOT

Scope assumption: profiles, avatars, usernames, display names, bios, social links and a
follow graph, with the activity feed staying disabled. Everything below maps to a specific
requirement rather than to good practice in general.

### Filtering, mapped to "a method for filtering objectionable material from being posted"

The postable surfaces without the feed are avatar image, username, display name, bio, and
social link URLs. Minimum viable:

1. Server-side text screening on username, display name and bio at write time, rejecting
   or holding slurs, sexual solicitation and impersonation patterns. It must live in the
   database or edge function, not in the client, because the client is bypassable and the
   web app writes to the same tables.
2. Length and character constraints on the free-text fields. `USERNAME_RE` already
   constrains usernames; bio and display name need equivalent server-side limits.
3. Avatar images screened before they become publicly readable. At PLOT's scale the
   cheapest compliant shape is server-side screening on upload plus a fast takedown path,
   rather than human pre-moderation of every upload.
4. Social link URLs restricted to an allowlist of hosts, since an unconstrained URL field
   on a public profile is a distribution channel for anything.

### Reporting, mapped to "a mechanism to report offensive content and timely responses"

1. A report control on every surface that renders another user's content: the public
   profile, the follow-request list, and any user-search result row.
2. A report reason picker whose categories mirror Guideline 1.1 (harassment or bullying,
   hate or discrimination, sexual content, impersonation, spam), so PLOT's taxonomy and
   Apple's standard line up.
3. A `reports` table capturing reporter, reported user, surface, reason, free-text detail,
   and status, with row-level security so reporters cannot read each other's reports.
4. A confirmation to the reporter that the report was received. "Timely responses to
   concerns" is a response obligation, and an acknowledgement is the floor.
5. A route for PLOT to actually see reports. An email or notification to the operator on
   new report insert is sufficient at 20 users. A moderation queue can come later.
6. A documented internal turnaround. Target 24 hours, per section 5.

### Blocking, mapped to "the ability to block abusive users from the service"

1. A block control everywhere the report control appears.
2. A `user_blocks` table, enforced in row-level security, not just in the UI. Blocking must
   sever the relationship at the data layer: existing follows in both directions dropped,
   pending follow requests cancelled, and the blocked user unable to read the blocker's
   profile, watched titles, favourites or follow lists through the API.
3. A visible list of blocked users in settings, with unblock.
4. Blocking must not require the reporting flow, and reporting must not require blocking.
   Apple lists them as two separate capabilities.

### Published contact information, mapped to 1.2 and 1.5

1. An in-app contact route in settings, since 1.5 says "your app and its Support URL".
2. A Support URL on theplot.tv that resolves and carries real contact details, per the App
   Store Connect field definition.
3. A privacy policy link both in App Store Connect and in the app, per 5.1.1(i).

### Terms and community standards

1.2 makes PLOT responsible for removing content that violates "this guideline, your terms
of service, or your community standards", and Apple asks for a compliance plan when it
finds violating content. PLOT needs published community standards that define
objectionable content and state that accounts can be removed. Without them there is
nothing to enforce against and nothing to show a reviewer.

### Submission mechanics

1. A demo account plus a second seeded account that follows it, so the reviewer can
   exercise report and block against a real target.
2. App Review Information notes that say plainly where the report and block controls are,
   which screens they appear on, and that the activity feed is not enabled in this build.
3. Declare User-Generated Content in the age rating questionnaire.
4. Keep Google sign-in disabled unless Sign in with Apple ships in the same build, per 4.8.

### Deliberately out of scope for the first submission

Human pre-moderation of every upload, a moderation dashboard, appeals workflow, and the
Declared Age Range API. None is required by the text of 1.2 for an app at PLOT's shape and
scale. They become relevant when the activity feed turns on and PLOT takes on Apple's
Social Media capability at 13+.

## Sources

All primary, all Apple-owned.

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), in
  particular [1.1](https://developer.apple.com/app-store/review/guidelines/#1.1),
  [1.2](https://developer.apple.com/app-store/review/guidelines/#1.2),
  [1.2.1](https://developer.apple.com/app-store/review/guidelines/#1.2.1),
  [1.5](https://developer.apple.com/app-store/review/guidelines/#1.5),
  [1.6](https://developer.apple.com/app-store/review/guidelines/#1.6),
  [2.1](https://developer.apple.com/app-store/review/guidelines/#2.1),
  [4.8](https://developer.apple.com/app-store/review/guidelines/#4.8),
  [5.1.1](https://developer.apple.com/app-store/review/guidelines/#5.1.1),
  [5.1.2](https://developer.apple.com/app-store/review/guidelines/#5.1.2)
- [App Review](https://developer.apple.com/distribute/app-review/), for review statistics,
  common rejection causes and demo account expectations
- [Offering account deletion in your
  app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Age ratings values and
  definitions](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions)
- [Set an app age
  rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating)
- [Platform version
  information](https://developer.apple.com/help/app-store-connect/reference/platform-version-information),
  for the Support URL field definition
- [Declared Age Range API](https://developer.apple.com/documentation/declaredagerange)

Apple revises the App Review Guidelines without notice. Re-read 1.2 immediately before
submitting rather than trusting this note's quotations.
