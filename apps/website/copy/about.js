// Reference-only copy catalog for apps/website/about.html. Not imported by
// the HTML — see copy/common.js for how this catalog is used.

export const ABOUT_PAGE = {
  meta: {
    title: 'About — PLOT',
    description: 'PLOT is a film and TV journal built for anyone who loves movies and TV. A note from the solo builder behind it.',
  },
  pageLabel: 'About',
  h1: 'About PLOT',
  pageMeta: 'A note from the person building it.',

  // One long-form letter from the founder — kept as a single ordered array
  // rather than named fields since paragraphs don't map to reusable UI slots.
  paragraphs: [
    "You don't have to call yourself a cinephile to belong here. PLOT is built for anyone who just genuinely loves movies and TV. That's it.",
    "PLOT started because of a real lack of enthusiasm for the apps that already exist. They're clunky, seemingly only ever in dark mode, and bluntly, no fun to look at. A place to track what you watch shouldn't have to be hard on the eyes or a chore to use.",
    'Then there was the pressure. The pressure of writing reviews, of performing how you felt about something in the "right" way. PLOT is for people who love TV, who love movies, who love the cinema and aren\'t afraid to say exactly how something made them feel. If all you have to say about a movie is that it made you cry 14 separate times, firstly, shout out to my emotional baddies, and secondly, thanks for the heads up! That one\'s getting saved for when a good cry is needed. Sometimes the only review worth writing is "I fucking loved that", and then moving on.',
    "That's why PLOT caps the characters in your reviews. The point is to capture your immediate, true reaction, the way you would in a journal. Nobody delivers a measured critique the second the credits roll. You have a feeling. That's what films and TV are designed to give us. They're not made to be picked apart frame by frame.",
    'PLOT is here to bring the feeling back. The joy of watching and weeding out the performance of it.',
    "But that's only half the story. Building in this space, you notice the small frustrations you'd usually ignore. Never knowing when a show drops or the next episode lands. Forgetting the film a friend swore by. The nightly hunt across seven platforms only to give up and pick the first thing on Netflix.",
    "PLOT remembers all of it. It builds you your own film and TV calendar, so there's always something to look forward to. Share it with your family so they know not to call you during the Summer House reunion. And when you don't know what to watch, search your PLOT to see what's hot across platforms in one place. No loading screens. No logging in. That's the old way. PLOT is the way forward.",
    "PLOT is built by one person. A solo builder. Someone who wanted a better way to track what I love. Building PLOT is both exciting and scary, and I've got a lot more I want to do: AI-powered recommendations, a fully personalised feed, PLOT profiles to share what you're watching with friends, and eventually PLOT watch parties to watch together in real time. I'm building as fast as I can and as best as I can around a full-time job.",
    "I value each and every person who takes the time to sign up and use PLOT. Any feedback, good or bad, and any feature request or bug you spot is incredibly helpful to me. It's the core driver behind every improvement I make in the app. You can share your thoughts anytime via the settings.",
    "PLOT is still early, so if you're using it now, you're an early user too, bugs and all. When something breaks or feels off, tell me. That feedback is what's shaped almost everything here and it's what'll keep shaping it. <strong>I don't take that kind of patience lightly. That's why PLOT is free to use and I want to keep it this way for as long as possible.</strong>",
    'If you enjoy using PLOT, you can support it directly on <a href="https://ko-fi.com/J7P123TYGK" target="_blank" rel="noopener">Ko-fi</a>, this helps cover what it actually costs to run and continue improving it.',
    "Thank you for reading this. Thank you for considering PLOT. And if you're already a user, thank you for backing a solo builder trying to make a life out of building beautiful things.",
  ],

  // Data-source attribution. TMDB's API terms require their notice verbatim and
  // ask for it on an About or Credits surface, not only in the legal pages.
  // Mirrors the Credits group in packages/core/copy/settingsView.js.
  credits: {
    title: 'Credits',
    intro: 'PLOT is built on data from these sources.',
    items: [
      { name: 'TMDB', notice: 'This product uses the TMDB API but is not endorsed or certified by TMDB.' },
      { name: 'TVmaze', notice: 'Episode air dates and the TV guide use the TVmaze API.' },
      { name: 'OMDb', notice: 'Critic scores are retrieved through the OMDb API.' },
    ],
  },
};
