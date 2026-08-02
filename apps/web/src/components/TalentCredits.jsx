import { posterUrl } from '../utils/images.js';
import { creditMeta, creditTitle, mediaType } from '../utils/talentCredits.js';
import './TalentCredits.css';

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
