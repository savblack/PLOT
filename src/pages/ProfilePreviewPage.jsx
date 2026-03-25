/**
 * TEMPORARY PREVIEW PAGE — delete when done reviewing
 * Visit: /profile-preview
 */
import { useState } from 'react';

const MOCK_POSTERS = [
  '/3bhkrj58Vtu7enYsLegbADFZbnA.jpg',
  '/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
  '/6DrHO1jr3qVrViUO6s6kFiAGM7.jpg',
  '/velWPhVMQeQKcxggNEU8YmIo52R.jpg',
  '/hm58fzdcnsSDIOoSHBDKLTCMnyo.jpg',
  '/vZloFAK7NmvMGKE7VkF5UHaz0I.jpg',
  '/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
  '/kDp1vUBnMpe8ak4rjgl3cLELqjU.jpg',
  '/pIkRyD18kl4FhoCNQuWxWu5cBLM.jpg',
  '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg',
  '/jBJWaqoSCiARWtfV0GlqHrcdidd.jpg',
  '/3GrRgt6CiLIUXlights9Rku4x2T4.jpg',
];

const MOCK_ITEMS = [
  { id: '1',  poster_path: MOCK_POSTERS[0],  title: 'Parasite',                   media_type: 'movie', list_id: 'a' },
  { id: '2',  poster_path: MOCK_POSTERS[1],  title: 'Dune',                        media_type: 'movie', list_id: 'a' },
  { id: '3',  poster_path: MOCK_POSTERS[2],  title: 'Interstellar',                media_type: 'movie', list_id: 'a' },
  { id: '4',  poster_path: MOCK_POSTERS[3],  title: 'Oppenheimer',                 media_type: 'movie', list_id: 'a' },
  { id: '5',  poster_path: MOCK_POSTERS[4],  title: 'The Godfather',               media_type: 'movie', list_id: 'b' },
  { id: '6',  poster_path: MOCK_POSTERS[5],  title: 'Blade Runner 2049',           media_type: 'movie', list_id: 'b' },
  { id: '7',  poster_path: MOCK_POSTERS[6],  title: 'Everything Everywhere',       media_type: 'movie', list_id: 'b' },
  { id: '8',  poster_path: MOCK_POSTERS[7],  title: 'La La Land',                  media_type: 'movie', list_id: 'c' },
  { id: '9',  poster_path: MOCK_POSTERS[8],  title: 'The Bear',                    media_type: 'tv',    list_id: 'c' },
  { id: '10', poster_path: MOCK_POSTERS[9],  title: 'Succession',                  media_type: 'tv',    list_id: 'c' },
  { id: '11', poster_path: MOCK_POSTERS[10], title: 'Poor Things',                 media_type: 'movie', list_id: 'd' },
  { id: '12', poster_path: MOCK_POSTERS[11], title: 'The Zone of Interest',        media_type: 'movie', list_id: 'd' },
];

const MOCK_WATCHES = [
  { id: 'w1', poster_path: MOCK_POSTERS[0],  title: 'Parasite',              watched_at: '2026-03-10', rating: 5, mood: 'unsettled',  note: 'Bong Joon-ho is untouchable. The basement reveal destroyed me.' },
  { id: 'w2', poster_path: MOCK_POSTERS[2],  title: 'Interstellar',          watched_at: '2026-03-05', rating: 5, mood: 'emotional',  note: 'Three hours felt like one. The docking scene gave me a panic attack.' },
  { id: 'w3', poster_path: MOCK_POSTERS[3],  title: 'Oppenheimer',           watched_at: '2026-02-28', rating: 4, mood: 'thoughtful', note: null },
  { id: 'w4', poster_path: MOCK_POSTERS[6],  title: 'Everything Everywhere', watched_at: '2026-02-20', rating: 5, mood: 'weird',      note: 'I cried at a movie about rocks.' },
  { id: 'w5', poster_path: MOCK_POSTERS[4],  title: 'The Godfather',         watched_at: '2026-02-14', rating: 5, mood: 'gripped',    note: null },
  { id: 'w6', poster_path: MOCK_POSTERS[7],  title: 'La La Land',            watched_at: '2026-02-01', rating: 3, mood: 'melancholy', note: 'Beautiful but the ending got me.' },
  { id: 'w7', poster_path: MOCK_POSTERS[5],  title: 'Blade Runner 2049',     watched_at: '2026-01-22', rating: 4, mood: 'pensive',    note: null },
  { id: 'w8', poster_path: MOCK_POSTERS[9],  title: 'Succession',            watched_at: '2026-01-10', rating: 5, mood: 'gripped',    note: 'Shiv deserved better. Logan never did.' },
];

const MOCK_LISTS = [
  { id: 'a', name: 'All-Time Favorites' },
  { id: 'b', name: 'Sci-Fi & Dystopia' },
  { id: 'c', name: 'Want to Watch' },
  { id: 'd', name: 'New List' },
];

const HERO_POSTERS = MOCK_POSTERS.slice(0, 4);

const allPosters = MOCK_ITEMS.map(i => i.poster_path);
const stripRaw = Array.from({ length: Math.ceil(40 / allPosters.length) }, () => allPosters).flat().slice(0, 40);
const FILMSTRIP = [...stripRaw, ...stripRaw];

const RECENT_ITEMS = MOCK_ITEMS.slice(0, 12);

export default function ProfilePreviewPage() {
  const [watchIdx, setWatchIdx] = useState(0);
  const watches = MOCK_WATCHES;
  const w = watches[watchIdx];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 2rem 6rem' }}>

      {/* Hero */}
      <div className="pp-hero">
        <div className="pp-hero-strip">
          {HERO_POSTERS.map((p, i) => (
            <img key={i} src={`https://image.tmdb.org/t/p/w342${p}`} alt="" />
          ))}
        </div>
        <div className="pp-hero-overlay" />
        <div className="pp-profile-card">
          <div className="public-profile-avatar pp-avatar-large">S</div>
          <div>
            <h1 className="pp-display-name">Savannah</h1>
            <p className="public-profile-username">@savannah</p>
            <p className="pp-stats">4 lists · 8 watched</p>
          </div>
        </div>
      </div>

      {/* Film strip marquee */}
      <div className="pp-filmstrip">
        <div className="pp-filmstrip-track">
          {FILMSTRIP.map((p, i) => (
            <img key={i} src={`https://image.tmdb.org/t/p/w92${p}`} alt="" />
          ))}
        </div>
      </div>

      {/* Recently Watched — centered carousel */}
      <div className="pp-watches-carousel pp-section">
        <div className="pp-carousel-stage">
          <button className="pp-carousel-arrow" onClick={() => setWatchIdx(i => Math.max(0, i - 1))} disabled={watchIdx === 0}>‹</button>
          <div className="pp-carousel-entry" key={watchIdx}>
            <div className="pp-carousel-side">
              {w.note && <p className="pp-carousel-note">{w.note}</p>}
            </div>
            <div className="pp-carousel-poster-wrap">
              <img src={`https://image.tmdb.org/t/p/w342${w.poster_path}`} alt={w.title} />
            </div>
            <div className="pp-carousel-side">
              <h3 className="pp-carousel-title">{w.title}</h3>
              {w.rating && <p className="pp-carousel-stars">{'★'.repeat(w.rating)}{'☆'.repeat(5 - w.rating)}</p>}
              <p className="pp-carousel-date">{new Date(w.watched_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              {w.mood && <p className="pp-carousel-mood">{w.mood}</p>}
            </div>
          </div>
          <button className="pp-carousel-arrow" onClick={() => setWatchIdx(i => Math.min(watches.length - 1, i + 1))} disabled={watchIdx === watches.length - 1}>›</button>
        </div>
        <div className="pp-carousel-dots">
          {watches.map((_, i) => (
            <button key={i} className={`pp-carousel-dot ${i === watchIdx ? 'active' : ''}`} onClick={() => setWatchIdx(i)} />
          ))}
        </div>
      </div>

      {/* Recently Added */}
      <div className="pp-section">
        <div className="pp-section-header">
          <h2 className="pp-section-title">Recently Added</h2>
          <span className="pp-section-count">12 total</span>
        </div>
        <div className="pp-scroll-row">
          {RECENT_ITEMS.map(item => (
            <div key={item.id} className="pp-scroll-item">
              <img
                className="pp-scroll-poster"
                src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                alt={item.title}
              />
              <p className="pp-scroll-label">{item.title}</p>
              <p className="pp-scroll-meta">{item.media_type === 'tv' ? 'Series' : 'Film'}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Lists */}
      <div className="pp-section">
        <div className="pp-section-header">
          <h2 className="pp-section-title">Lists</h2>
          <span className="pp-section-count">4</span>
        </div>
        <div className="pp-lists-grid">
          {MOCK_LISTS.map(list => {
            const items = MOCK_ITEMS.filter(i => i.list_id === list.id);
            const filled = items.slice(0, 4);
            const empty = Math.max(0, 4 - filled.length);
            return (
              <div key={list.id} className="pp-list-mosaic">
                <div className="pp-mosaic-grid">
                  {filled.map((item, idx) => (
                    <img key={idx} src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt="" />
                  ))}
                  {Array.from({ length: empty }).map((_, idx) => (
                    <div key={`e${idx}`} className="pp-mosaic-empty" />
                  ))}
                </div>
                <div className="stack-info">
                  <h3>{list.name}</h3>
                  <p>{items.length} {items.length === 1 ? 'item' : 'items'}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Join CTA */}
      <div className="pp-join-cta">
        <p className="pp-join-tagline">Track what you watch. Share what you love.</p>
        <a href="/signup" className="pp-join-link">Join Plot →</a>
      </div>
    </div>
  );
}
