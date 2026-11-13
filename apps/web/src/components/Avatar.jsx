// The one round profile picture on web: a photo, or the first letter of the
// name on a sunken circle. Pages used to draw their own (.wt-avatar,
// .notif-avatar, .people-avatar, .ft-avatar, .to-avatar, the sidebar's, the
// drawer's, Settings'), at slightly different sizes and colors.
// iPhone parity: apps/mobile/components/Avatar.tsx.
import './Avatar.css';

/**
 * @param {object} props
 * @param {string | null | undefined} [props.src]  photo URL; the initial shows without one
 * @param {string | null | undefined} [props.name]  for the initial
 * @param {number} [props.size]  px, default 40
 * @param {boolean} [props.stacked]  a ring in the page color, for overlapping faces
 * @param {boolean} [props.headshot]  a TMDB person photo: crop toward the face
 * @param {'neutral' | 'raised' | 'accent'} [props.tone]  the circle behind the initial
 * @param {string} [props.className]  outer spacing only
 */
export default function Avatar({ src, name, size = 40, stacked = false, headshot = false, tone = 'neutral', className = '' }) {
  const cls = `avatar avatar--${tone}${stacked ? ' avatar--stacked' : ''}${headshot ? ' avatar--headshot' : ''}${className ? ` ${className}` : ''}`;
  const style = { '--avatar-size': `${size}px` };
  return src
    ? <img className={cls} style={style} src={src} alt="" loading="lazy" />
    : <span className={cls} style={style} aria-hidden="true">{(name || '?').trim().charAt(0).toUpperCase()}</span>;
}
