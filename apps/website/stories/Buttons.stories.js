// Documents the .btn / .btn-primary / .btn-outline / .btn-outline-white
// pattern used across apps/website/index.html, about.html, plans.html.
// These rules aren't in a shared file on the live site (each page currently
// carries its own inline copy) — see buttons.mirror.css for why this story
// needs its own stylesheet, and keep the two in sync if a page's .btn rules
// change.
import './buttons.mirror.css';

export default {
  title: 'Foundations/Buttons',
  parameters: { layout: 'padded' },
};

export const Primary = () => {
  const a = document.createElement('a');
  a.className = 'btn btn-primary btn-large';
  a.href = '#';
  a.textContent = 'Start your PLOT →';
  return a;
};

export const Outline = () => {
  const a = document.createElement('a');
  a.className = 'btn btn-outline btn-large';
  a.href = '#';
  a.textContent = 'Start your PLOT →';
  return a;
};

export const OutlineOnDark = () => {
  const wrap = document.createElement('div');
  wrap.style.background = 'var(--dark)';
  wrap.style.padding = '2rem';
  wrap.style.borderRadius = 'var(--r-md)';
  const a = document.createElement('a');
  a.className = 'btn btn-outline-white btn-large';
  a.href = '#';
  a.textContent = 'Unify your entertainment universe →';
  wrap.appendChild(a);
  return wrap;
};
