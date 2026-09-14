# PLOT What’s On guidelines

This is the research and writing standard for every article at
`theplot.tv/whats-on`. It exists to make the website useful on its own terms:
a short, informed editorial note about a title, not a release calendar caption
stretched into paragraphs.

## The standard

Every title-led article has **three or four short, developed paragraphs** (five
at most). Each paragraph must add a new piece of information or a clear
critical point. If a sentence could describe almost any film or series, cut it.

The article is written for, and judged against, **its own publish date**. A
post that was accurate the day it went out stays as it is; it is never
rewritten later because a countdown has passed or a title has changed platform.
The demanding half is the same rule read forwards: every time-bound claim has
to be true on that date, and nothing may be borrowed from after it. A countdown
cannot cite reviews, episode counts or box office that do not exist yet.

Three rules are yours alone, because no check can see them: **no spoilers**,
**no more than three names in a sentence**, and **every time-bound claim true
on the publish day**. A person’s name and a film title are the same shape to a
regex. Everything else in this file is enforced by
`supabase/functions/_shared/articleRules.js` and will fail the post outright.

Before writing, check the post type against the calendar. A trailer drop or a
countdown is only true for a title that has not yet released on the publish
day; a "now streaming" post is only true when the brief names a provider or a
store; an anniversary is counted from the original theatrical release (for a US film, the US opening, not the premiere); a hidden gem is
a good film outside the canon, never a title everyone has already seen. If the
brief's type cannot be made true, say so in the output rather than writing
around it.

Use a minimum of two relevant sources per article whenever they are available:

1. one **primary source** for facts; and
2. one **editorial or industry source** for context, criticism or news.

For anniversaries and older titles, replace breaking-news reporting with a
reliable archival or critical source. For a genuinely obscure title with little
coverage, use the best available primary material and say less rather than
padding the article.

Never expose the research process to the reader. Articles state facts directly
and confidently, but the source URLs must always be stored in `copy.sources`.

## Mandatory title baseline

Start every title-led article with these two inputs before doing any wider
research:

- **TMDB** for the verified title ID, media type, basic credits, poster paths
  and initial metadata.
- **OMDb’s pre-fetched fields** for IMDb, Rotten Tomatoes and Metacritic when
  present in the brief.

These are inputs to the article, not language to display on the page. Use them
to resolve the right title and orient the research; do not turn database fields
into an article by themselves.

## Source hierarchy

### 1. Primary sources, use first for facts

- Studio, distributor, streamer, network and production-company pressrooms.
- Official trailers, release announcements and press kits.
- Official festival programme pages and filmmaker interviews.
- PLOT’s verified provider/release data for where and when to watch.

Use these for dates, release plans, platform availability, cast, crew, official
synopsis, trailer details and confirmed production facts. Do not upgrade a
rumour or a trade report into a confirmed fact when a primary source is silent.

### 2. Industry reporting, use for what has changed and why it matters

- Variety and Variety Australia.
- Deadline.
- IndieWire.
- Screen Daily.
- The Hollywood Reporter and TheWrap, where accessible.

Use these for casting, development, distribution, box-office context, a
festival debut, a release-date change, a trailer announcement or an interview
that explains a filmmaker’s intent. Prefer the original report over articles
that merely repeat it.

### 3. Criticism and interviews, use for the editorial paragraph

- BFI and *Sight and Sound*.
- RogerEbert.com, Vulture, The New Yorker, the Guardian and the New York Times,
  where accessible.
- Criterion essays and filmmaker interviews from reputable publications.

Use criticism to sharpen PLOT’s own point of view, not to borrow someone else’s
language. Never quote a review unless a short quotation is essential and
licensed for use; normally, paraphrase the idea instead.

### 4. Archives and institutions, use for “On this day” and classics

- BFI, Academy Museum, AFI, TCM and Criterion.
- National Film Registry and official studio archives.
- Festival archives for premieres, awards and historical reception.

Use these for release history, restoration context, craft, influence and why a
film has endured. Do not reduce an anniversary post to a birthday calculation.

### 5. Reference data, useful, never the article’s whole argument

- TMDB for title IDs, basic credits, poster paths and initial metadata.
- OMDb’s pre-fetched IMDb, Rotten Tomatoes and Metacritic fields when present.
- JustWatch/PLOT availability data for regional viewing information.

Reference data verifies a baseline. It does not substitute for reporting,
criticism or an editorial idea. Never use TMDB vote averages or vote counts.

## The distinct angle

Every article needs one sourced detail that gives it its own reason to exist.
It might be an unusual production choice, a first collaboration, a change from
the source material, a festival reaction, a specific craft decision, a
performer’s preparation, a release-history wrinkle or a revealing interview
detail. Work it naturally into the article. Never introduce it as a “fun fact”,
“did you know”, “worth noting” or a detached trivia aside.

The detail must change the reader’s understanding of the title. If it does not,
leave it out.

## Evidence rules

- Keep every consulted external URL in `sources`.
- Separate confirmed facts from interpretation. A date, credit, deal, platform
  or quote needs a source; PLOT’s view of why a title works is clearly written
  as criticism, not disguised fact.
- Cross-check time-sensitive facts against a primary source where possible:
  release dates, streaming platforms, casting and trailers.
- Never copy an official synopsis, Wikipedia, a review or another article.
  Paraphrase and add a point of view.
- No spoilers. For older titles, discuss structure, mood, performance or craft
  without revealing a turn, ending or surprise.
- Do not make claims about reception without a source, and never summarise
  reception (“critics kept coming back to”, “reviews landed mixed”, “critics
  have praised”). Write PLOT’s own observation instead.
- Only include ratings from the brief’s pre-fetched ratings block: at most one
  score per article, woven into a point, never as the closing paragraph, never
  a pre-release IMDb average, never an audience score.
- Never wrap your own paraphrase in quotation marks. A quoted span reads as a
  review quote, and the guidelines already forbid those. Titles are written
  bare, not in quotation marks.
- Name at most two or three people in any paragraph, and never more than three
  in a single sentence. A cast list is not a paragraph.
- Em and en dashes are banned. Hyphens in compound words and in names are
  correct English and stay (“co-writer”, “low-budget”, “Young-White”).
- US spelling throughout: theaters, center, color, favorite, organize.
  “Cinemas” is the ordinary word for the place and is fine.
- The headline never opens with the post type. The site renders that label
  itself, so “On This Day: Die Hard turns 38” says it twice and breaks
  sentence case.
- Never show the reader the seams. If a fact could not be checked, cut it; an
  article never says PLOT could not verify something.
- Sister articles about the same title (a trailer, then a countdown, then a
  home-release post) must agree on credits and facts. Read the earlier article
  before writing the later one.
- If reliable information is thin, write a shorter, more honest article rather
  than inventing context.

## Article structure by post type

### Watch tonight

1. The premise and the specific mood or problem it sets up.
2. A useful creative fact: director, key performer, source material, era or
   formal choice.
3. The critical case: what the film does particularly well, with a concrete
   observation about tone, structure, performance or craft.
4. A practical note on where it is available, if verified.

### Hidden gem

1. What it is and the kind of viewer it will reward.
2. Why it has been overlooked or sits outside the obvious picks.
3. The distinctive thing it does: a performance, visual approach, setting,
   genre twist or emotional register.
4. A verified viewing note or a concise reason to save it.

### Now streaming (and now to rent or buy)

The brief's `home_kind` says which this is. A subscription arrival is "now
streaming on Netflix" and is labelled Now streaming. A cinema release reaching
the digital stores is labelled Now at home; the article says it is "now
available to rent or buy on Prime Video and Apple TV", and it should
say how long it ran in cinemas first; that arrival is the moment most readers
can actually watch it, so treat it as the news, not as the end of a run.

1. What has arrived and where it can be watched, in the right words for
   `home_kind`.
2. The concrete premise and key creative team.
3. The best reason to choose it now, grounded in reporting or criticism.
4. Who it is for: a clear mood, genre or audience fit, not an empty call to
   action.

### Upcoming this week

1. The week’s shape: what connects the release slate or where the choice lies.
2. Two or three key releases, each with a distinct one-sentence reason to care.
3. A practical split between cinema, streaming and television, using verified
   regional availability.
4. A concise recommendation for different moods or audiences.

### Trailer drop

1. What the new trailer confirms: release date, story setup, returning talent
   or a first look at the world.
2. What is new in this trailer compared with earlier information.
3. Relevant production or source-material context from reporting.
4. A measured take on what the footage suggests, without treating a trailer as
   proof that the finished film works.

### Countdown

1. The title, exact verified release date and how far away it is.
2. The actual premise, cast, director, franchise or source-material context.
3. Why this release is worth watching: a concrete creative or cultural reason.
4. What is confirmed so far, and what remains unknown. Do not pad with generic
   instructions to save a title.

### On this day

1. The original release and the occasion for revisiting it.
2. Its initial context: filmmaker, stars, genre, moment in a career or place in
   a movement.
3. A fresh critical point about why it still lands, specific to the title.
4. Its influence, restoration history, later reputation or the best reason for
   a first watch now.

### Trending chart

1. What has moved at the top of the chart and what that says about the week.
2. A useful note on the leading title: release, platform, premise or cultural
   reason for the attention.
3. Two or three notable alternatives, each with a different appeal.
4. A recommendation that helps the reader choose rather than simply repeat the
   rankings.

### Guide

1. A clear thesis for the list.
2. One short, evidence-led paragraph for each included title.
3. A close that helps the reader select their first watch.

Guides are longer by design, but every title still needs a reason to be there;
never fill a list with generic adjectives.

### Question

Questions are not articles. Keep them to a genuine, specific conversation
starter and never fabricate a website article around them.

## Banned filler

Do not write phrases such as:

- “the shape of an invitation”
- “the finished film will earn the time”
- “this is what the watchlist is for”
- “a proper watch, not background noise”
- “a clear point of view” without explaining what that view is
- “worth adding to your list” without first giving a concrete reason
- closing lines that state nothing: “looks like one of the more rewarding
  releases”, “there is something here whichever mood wins out”, “if that is
  what tonight calls for”, “whatever else it is”
- “an interesting detail”, “interestingly”, “fun fact”, “did you know”
- “according to”, “reportedly”, “reports suggest”, “sources say”

The reader should finish each article knowing more about the title than when
they started, and with a sharper sense of whether it is for them.
