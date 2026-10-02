import { posterUrl } from '../utils/images.js';
import { creditMeta, creditTitle, mediaType } from '../utils/talentCredits.js';
import { PEOPLE } from '@plot/core/copy/people.js';
import { shortDayMonth, localDateStr } from '@plot/core/date.js';
import { comingUpFromCredits } from '@plot/core/peopleFeed.js';
import './TalentCredits.css';
import './PeopleFollow.css';

export default function CreditsGrid({ credits, openPanel }) {
  if (!credits.length) return null;
  return (
    <div className="talent-credits-grid">
      {credits.map(credit => {
        const title = creditTitle(credit);
        const image = posterUrl(credit.poster_path, 'w185');
        const type = mediaType(credit);
        const role = credit.character || credit.roles?.[0]?.character;
        return (
          <button type="button" className="talent-credit" key={`${type}-${credit.id}`} onClick={() => openPanel(credit.id, type, 'talent_profile')}>
            <div className="talent-credit-poster">
              {image ? <img src={image} alt="" loading="lazy" /> : <span>{title}</span>}
            </div>
            <span className="talent-credit-title">{title}</span>
            {role && <span className="talent-credit-role">{role}</span>}
            <span className="talent-credit-meta">{creditMeta(credit, type)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A person's Coming up strip (board 2a): dated work from today on, soonest
 * first, from @plot/core/peopleFeed.js comingUpFromCredits. Same card as the
 * credits grid, with the date (or an Out today chip) as the last line.
 */
export function ComingUpGrid({ items, openPanel }) {
  if (!items.length) return null;
  return (
    <div className="talent-credits-grid">
      {items.map(item => {
        const image = posterUrl(item.posterPath, 'w185');
        return (
          <button type="button" className="talent-credit" key={`${item.mediaType}-${item.tmdbId}`} onClick={() => openPanel(item.tmdbId, item.mediaType, 'talent_profile')}>
            <div className="talent-credit-poster">
              {image ? <img src={image} alt="" loading="lazy" /> : <span>{item.title}</span>}
            </div>
            <span className="talent-credit-title">{item.title}</span>
            {item.role && <span className="talent-credit-role">{item.role}</span>}
            <span className="talent-credit-meta">
              {item.today ? <span className="people-chip people-chip--today">{PEOPLE.chips.outToday}</span> : shortDayMonth(item.date)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A person's work, under the header on their page and in the panel's talent
 * view: Coming up (when anything is dated), then All credits.
 */
export function TalentWork({ credits, actingCredits, openPanel, emptyText }) {
  const comingUp = comingUpFromCredits(credits, localDateStr());
  return (
    <>
      {comingUp.length > 0 && (
        <section className="talent-section">
          <div className="talent-section-head"><h2>{PEOPLE.person.comingUp}</h2><span>{PEOPLE.person.comingUpNote}</span></div>
          <ComingUpGrid items={comingUp} openPanel={openPanel} />
        </section>
      )}
      <section className="talent-section">
        {comingUp.length > 0 && <div className="talent-section-head"><h2>{PEOPLE.person.allCredits}</h2></div>}
        <CreditsGrid credits={actingCredits} openPanel={openPanel} />
        {!actingCredits.length && <p className="talent-muted">{emptyText}</p>}
      </section>
    </>
  );
}
