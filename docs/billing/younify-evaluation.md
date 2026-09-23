# Younify Connect evaluation

Reviewed 17 September 2026. **Not approved for installation, linking or launch.**
No provider contact, SDK implementation, licence acceptance, paid commitment or
account connection has occurred. Direct streaming remains unadvertised.

## Evidence and unresolved questions

| Requirement | Public evidence | PLOT decision / remaining proof |
| --- | --- | --- |
| Native compatibility | SDK 1.0.8 advertises React Native 0.81; PLOT currently installs Expo 57 / RN 0.86.3 | Requires a development build and real iOS/Android compile/link tests; Expo Go cannot establish compatibility with an unbundled native SDK |
| Installation | React Native instructions require CocoaPods and an Android Maven dependency repository | Prepare an Expo config plugin after SDK approval; do not hand-edit generated native projects |
| Linking | Published SDK platforms are native; no browser SDK is listed | Browser linking is unverified. Only after provider confirmation should web offer a mobile-linking handoff |
| Australian coverage | Product page names services but provides no region matrix | Confirm Australian Netflix, Prime Video, Disney+, Apple TV, Paramount+ and HBO Max accounts separately; ask about Stan, Binge and other local services |
| Profile selection | Management schema exposes preferred_profile and history profile_id | Require explicit selection and reject records from other profiles; test multiple adults, children and PIN-protected profiles |
| Identity | WatchHistory schema has content_id, tmdb_id and tmdb_series_id | Verify movie/episode semantics, season/episode lookup, event identity and rewatches with sanitised real payloads. Documentation examples are not verified TMDB fixtures |
| Dates and history depth | Timestamp and percent_complete exist | Confirm timezone, unknown dates, partial-play threshold and maximum history depth per service |
| Refresh | UserHistory POST is documented for user-triggered linking/refresh only | **Do not put this POST in scheduled jobs.** Confirm provider refresh SLA; scheduled PLOT jobs may read existing cached history only under agreed API terms |
| Backend access | Management OpenAPI 1.0.2 documents paginated history and updated/timestamp filters | Server owns API key; validate pagination, incremental corrections, rate limits and webhook authentication in a sandbox |
| Tokens | SDK instructions require device-specific secure token storage | Native SecureStore, not shared cloud storage. Server key must never reach web/mobile bundles |
| Consent | Provider requires a consent screen and its terms/privacy acceptance | Show before linking, retain consent version/time; obtain the applicable SDK commercial terms before implementation |
| Disconnect / deletion | Separate unlink-service and delete-user endpoints | Disconnect unlinks and retains PLOT data; only an explicit data-deletion request calls delete-user |
| Economics | No public per-user price/minimum in the reviewed docs | Obtain written pricing, AU coverage, SLA, limits, deletion terms and minimum commitment before deciding launch |

Sources: [SDK overview](https://www.younify.tv/product/developer-sdk/),
[React Native installation and licence](https://connect-sdk.younify.tv/integrations/sdk/react-native/documentation/),
[Management API reference](https://api.younify.tv/docs),
[OpenAPI document](https://api.younify.tv/api-docs/v1/prd-management.json).
The API schema is stronger implementation evidence than the product-page snippets;
for example, history refresh restrictions must be honoured even though the product
page describes automatic personalisation broadly.

## Cost model in Australian dollars

Let N be paying subscribers, U be connected subscribers, M a monthly minimum,
c the per-connected-user monthly fee and O all monthly payment/store, hosting,
support and tax costs. If the minimum is credited against usage:

- Monthly contribution: `5*N - max(M,c*U) - O`.
- Annual-plan monthly contribution: `(40/12)*N - max(M,c*U) - O`.
- If the minimum is additional to usage, replace `max(M,c*U)` with `M+c*U`.

The following are sensitivity assumptions, **not Younify quotes**. All subscribers
are connected, there is no minimum, and the amounts below are per subscriber per
month, before O:

| Assumed provider charge | A$5 monthly plan remaining | A$40 annual plan remaining |
| --- | ---: | ---: |
| A$0.25 | A$4.75 | A$3.08 |
| A$1.00 | A$4.00 | A$2.33 |
| A$2.00 | A$3.00 | A$1.33 |
| A$3.00 | A$2.00 | A$0.33 |

A hypothetical A$500 monthly minimum with 100 subscribers consumes the entire
monthly-plan gross revenue and exceeds annual-plan gross monthly revenue by
A$166.67, before any other cost. That makes minimum commitments material even
when a per-user quote looks affordable. Convert a USD quote at a dated exchange
rate and account for taxes/fees before approving a margin target.

## Prepared integration boundary

Reuse the additive watch-event/provenance model and fenced background jobs after
provider-specific identity has been verified. Add the provider to the database
allowlist only with the adapter and tests, not as an empty advertised connection.
Keep API operations server-side. Isolate the native SDK in the mobile platform
layer; share consent state, status/error copy and incoming-event normalisation in
core. Backend tokens are encrypted; SDK tokens are separate per device. No direct
streaming flag or placeholder UI can make an unverified provider appear enabled.

## Draft provider enquiry (not sent)

PLOT is a movie and TV journal with web and Expo 57 / React Native 0.86.3 apps.
We are evaluating Younify Connect for incoming watch history, including individual
episodes and rewatches, for Australian customers. Pricing is A$5/month or A$40/year.

Please provide sandbox access and the applicable evaluation/commercial terms;
SDK compatibility with our native versions; Australian service/profile coverage;
real sanitised movie/episode/rewatch payloads; history depth and refresh SLA;
rate limits/webhooks; consent, unlinking and deletion behaviour; browser-linking
support; and all minimum, per-user, per-service and usage charges. Please clarify
how scheduled reading works given the documented user-interaction-only restriction
on requesting a history refresh. We are not making a purchase commitment.
