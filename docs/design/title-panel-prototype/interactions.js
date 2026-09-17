/* Both disclosures work the same way: the button owns aria-expanded, and the
   drawer that follows it is hidden by CSS while that is false. */
document.querySelectorAll('[data-disclosure]').forEach((button) => {
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!open));
  });
});

/* Nothing else is wired up: the remaining controls are static. */
document.querySelectorAll('.panel button:not([data-disclosure])').forEach((button) => {
  button.addEventListener('click', (event) => event.preventDefault());
});
