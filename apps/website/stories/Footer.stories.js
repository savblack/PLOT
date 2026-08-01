// Renders the actual apps/website/_partials/footer.html contents (raw import)
// so this story can never drift from what the live pages include.
import footerHtml from '../_partials/footer.html?raw';
import './footer.mirror.css';

export default {
  title: 'Foundations/Footer',
  parameters: { layout: 'fullscreen' },
};

export const Default = () => {
  const wrap = document.createElement('div');
  wrap.innerHTML = footerHtml;
  return wrap;
};
