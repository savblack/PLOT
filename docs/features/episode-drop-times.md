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
| 10 | Times appear on existing screens: Calendar, Episode alerts card, Tonight. No new Upcoming list yet. |
| 11 | Ships as soon as it is built. No quiet trial period. |
| 12 | A PostHog kill switch, plus an automatic brake: if too many confirmed times move in their final hours, or TVmaze stops answering, alerts fall back to the morning path and an incident issue opens. |
| 13 | Estimates come from a hand-kept list of each US service's usual drop time, with a monthly check against observed TVmaze times that opens an issue on drift. |
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
2. **Display**: estimate list, times on Calendar / Episode alerts card / Tonight,
   the two settings. Match a stored airing to TMDB's episode only when their dates
   agree within a day, since TVmaze and TMDB numbering can differ.
3. **Alerts**: alert job every 15 minutes for confirmed times, quiet hours, 7 AM
   summary, brake and kill switch, one-time note.
