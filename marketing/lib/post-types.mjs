// Central registry: how each post type turns its planner payload into
// rendered cards. Used by generate.mjs (real posts) and the preview sheet,
// so template data assembly can't drift between the two.
//
// Cards are image-led: every card gets both poster and backdrop data URIs
// where available — the template picks per canvas (poster for 4:5,
// backdrop for 16:9).
import { fetchImageDataUri, POSTER_GRID, POSTER_HERO, BACKDROP } from './images.mjs';

const hydrateTitle = async (title, { poster = POSTER_HERO } = {}) => ({
  ...title,
  poster_data_uri: await fetchImageDataUri(title.poster_path, poster),
  backdrop_data_uri: await fetchImageDataUri(title.backdrop_path, BACKDROP),
});

// Each entry: template file name and an async cards(payload) returning
// [{data, channels?}] — one element per card. `channels` limits a card to
// specific platforms (default: all).
//
// Channel mapping (see publish.mjs):
//   Instagram -> portrait renders of its cards as a real carousel
//   Threads   -> landscape renders of its cards as a real carousel
//   X         -> ONE landscape image only (no carousel support — multi-image
//                renders as a collage grid): the FIRST card that allows 'x'.
export const POST_TYPES = {
  upcoming: {
    template: 'weekly-slate',
    // One card per title, most popular first — a real carousel on IG/Threads.
    // X gets only card 0; the X copy names the rest of the week's titles.
    cards: async (payload) => {
      const titles = payload.titles || [];
      return Promise.all(titles.slice(0, 6).map(async t => ({
        data: { week_label: payload.week_label, title: await hydrateTitle(t) },
      })));
    },
  },

  trending: {
    template: 'trending-chart',
    // Two five-row charts (1-5, 6-10) on every channel: X posts both landscape
    // images, IG/Threads run them as a carousel followed by detail cards for
    // the top 3. (The single ten-row X chart was retired 17 Sep 2026: too
    // dense to read.)
    cards: async (payload) => {
      const items = await Promise.all((payload.items || []).slice(0, 10).map(async (item, i) => ({
        ...item,
        poster_data_uri: await fetchImageDataUri(item.poster_path, POSTER_GRID),
        // backdrops only feed the top-3 detail cards; the chart is a flat table
        backdrop_data_uri: i < 3 ? await fetchImageDataUri(item.backdrop_path, BACKDROP) : null,
      })));
      const chart = (slice) => ({ kind: 'chart', week_label: payload.week_label, items: slice });
      return [
        { data: chart(items.slice(0, 5)) },
        { data: chart(items.slice(5, 10)) },
        ...items.slice(0, 3).map(item => ({
          data: { kind: 'detail', title: item },
          channels: ['instagram', 'threads'],
        })),
      ];
    },
  },

  countdown: {
    template: 'countdown',
    cards: async (payload) => [{
      data: {
        days_until: payload.days_until,
        kind: payload.kind,
        when_label: payload.when_label,
        title: await hydrateTitle(payload.title),
      },
    }],
  },

  now_streaming: {
    template: 'now-streaming',
    cards: async (payload) => [{
      // providers/from_label stay in the payload for copy; never on the image.
      // home_kind picks the kicker: "Now streaming" vs "Now at home" (rental).
      data: { home_kind: payload.home_kind || null, title: await hydrateTitle(payload.title) },
    }],
  },

  trailer: {
    template: 'trailer-drop',
    cards: async (payload) => [{
      data: {
        kind: payload.kind,
        when_label: payload.when_label,
        title: await hydrateTitle(payload.title),
      },
    }],
  },

  on_this_day: {
    template: 'on-this-day',
    cards: async (payload) => [{
      data: {
        years: payload.years,
        release_year: payload.release_year,
        title: await hydrateTitle(payload.title),
      },
    }],
  },

  watch_tonight: {
    template: 'watch-tonight',
    cards: async (payload) => [{
      // providers/genre stay in the payload for copy; never on the image
      data: { title: await hydrateTitle(payload.title) },
    }],
  },

  hidden_gem: {
    template: 'hidden-gem',
    cards: async (payload) => [{
      data: { year: payload.year || null, title: await hydrateTitle(payload.title) },
    }],
  },
};
