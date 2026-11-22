# Exact episode drop times

Plot shows when each episode becomes watchable, in the viewer's own time zone, and
alerts people when it actually drops instead of the next morning. Decided with
Savannah on 2026-11-18 and 2026-11-19. This is the record later phases build from.

## Decisions

| # | Decision |
|---|---|
| 1 | Show a time whenever Plot has one (confirmed or estimated). Day only when nothing is known. |
| 2 | The time shown is when it is watchable for the viewer (US). If unknown, the broadcast time converted to their clock, labeled with the network ("on BBC One"). |
| 3 | Alerts fire only on a confirmed time. Estimates appear on screen only. |
| 4 | Estimates read "Fri around 3 AM". Confirmed times read "Fri 3:00 AM". |
| 5 | Times and in-app alerts are free. Phone push at the drop is Premium. |
| 6–7 | No pushes 11 PM to 7 AM in the viewer's time zone; held pushes go at 7 AM. No setting to change it. |
| 8 | Held 7 AM pushes combine into one. Daytime drops push one by one. |
| 9 | Push only for shows the person is caught up on (watched the previous episode), or has switched push on for from the Episode alerts card. Other followed shows get the in-app alert only. |
| 10 | Times appear on existing screens: Calendar and the Episode alerts card. No new Upcoming list yet. (Tonight was dropped on 2026-11-19: it shows no upcoming dates to put a time on.) |
| 11 | Ships as soon as it is built. No quiet trial period. |
| 12 | A PostHog kill switch, plus an automatic brake: if too many confirmed times move in their final hours, or TVmaze stops answering, alerts fall back to the morning path and an incident issue opens. |
| 13 | ~~Estimates from a hand-kept list of service drop times, checked monthly.~~ **Changed 2026-11-19:** no estimates for now. TVmaze listed no time for any of 215 Netflix, 20 Apple TV or 29 Paramount+ episodes over three weeks, so a list could never be checked. Streaming shows show the day until a source for their times exists. This also makes decisions 4 and 17 moot for now. |
| 14 | No web-only Premium extra (no browser notifications, no email per episode). Push arrives with the iPhone app. |
| 15 | Two settings: "Episode alerts in Plot" and "Episode alerts on my phone". |
| 16 | Phone alerts start on, with a one-time in-app note the first time one would send. |
| 17 | Shows with only an estimate keep the next-morning alert. (Savannah closed the review before answering; this was the recommendation.) |

## Sources

- **TVmaze** (free, no key): exact broadcast time and time zone per episode. A blank
  `airtime` means TVmaze knows only the date; its `airstamp` is then a placeholder
  and must not be used as a time. Shows are linked by TheTVDB or IMDb id from TMDB,
  never by title.
- **TMDB**: dates and which services carry a show, not when an episode lands on one.
- **JustWatch partner API** is paid and not used.

What TVmaze knows, checked live on 2026-11-19: US network shows (ABC, NBC) have exact
times. Apple TV shows (Severance, Slow Horses) have dates only. Other streaming
services are mixed. So for many streaming drops the on-screen time will be an
estimate from decision 13, and per decision 17 their alert stays next-morning. If
that turns out to cover most of what people follow, revisit 3 and 17 for the
largest services.

## Phases

1. **Collect** (this change): `tvmaze_show_links`, `episode_airings`, hourly
   `episode-air-times` job. Nothing user-facing.
2. **Display** (`packages/core/dropTimes.js`): exact times on the Calendar and the
   Episode alerts card, web and mobile. A stored airing is matched to TMDB's
   episode only when their dates agree within a day, since TVmaze and TMDB
   numbering can differ. The two settings (decision 15) move to phase 3, where
   phone alerts make them matter.
3. **Alerts**, split in two.
   - **3a** (`episode-drop-alerts`, every 15 minutes at :05/:20/:35/:50): in-app
     `new_episode` rows at the drop for exact times, each confirmed against
     TMDB's episode (same numbers, dated within a day). The daily job is
     unchanged and is the fallback for anything skipped. Brake: the run writes
     nothing and answers 500 (so `cron-health.yml` opens an incident) when the
     time sync has not finished cleanly for 3 hours, or more than 10% of at
     least 10 drops from an hour ago to 6 hours ahead moved in the last day.
     Kill switch: PostHog flag `kill-episode-drop-alerts` (create it and turn it
     on to stop the job; missing or unreachable means run). Settings:
     `notification_preferences.episode_alerts` and `.episode_push`. Push:
     quiet hours 11 PM to 7 AM in `profiles.timezone` (Eastern when unknown) for
     every push type, and episodes waiting in the 7 AM hour go as one summary.
   - **3b** (with the iPhone launch): push only for caught-up shows (decision 9)
     and the per-show phone switch, the one-time note (decision 16), and whether
     phone alerts at the drop are Premium. Push was made free on 2026-10-16
     (`20261016140000_push_alerts_free.sql`), which conflicts with decision 5;
     Savannah to decide.
