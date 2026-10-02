// A smart list's rules as one sentence of chips: "Find [shows] from [new
// discoveries] that are [Drama or Crime,] [rated 7+,] [on my services.]"
// (B3 on the list page; the builder in A2 and the phone save sheet). Tapping
// a chip opens its choices; "Add a rule" offers the filters not yet set.
// What the sentence says and what each choice does is
// @plot/core/smartLists.js; this only draws it. Mobile parity: issue 1094.
import { useEffect, useId, useRef, useState } from 'react';
import {
  addableSmartListRules, isRemovableSmartListRule, removeSmartListRule, setSmartListRule,
  smartListGenres, smartListRuleChoices, smartListSentence,
} from '@plot/core/smartLists.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';

const IconPlus = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const IconTick = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;

/** Closes on a click outside or Escape, and gives focus back to its trigger. */
function useDismiss(open, close, rootRef) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) close(); };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      // The menu sits inside a dialog: Escape closes the menu, not the dialog.
      e.stopPropagation();
      close(true);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, close, rootRef]);
}

/**
 * One chip and its menu.
 * @param {{
 *   rule: import('@plot/core/smartLists.js').SmartListRuleKey,
 *   text: string,
 *   rules: import('@plot/core/smartLists.js').SmartListRules,
 *   catalog: { movie?: Array<{id:number,name:string}>, tv?: Array<{id:number,name:string}> },
 *   onChange: (next: import('@plot/core/smartLists.js').SmartListRules) => void,
 *   startOpen?: boolean,
 *   onClosed?: () => void,
 *   anchor?: React.ReactNode,  drawn instead of the chip (Add a rule's menu)
 * }} props
 */
function RuleChip({ rule, text, rules, catalog, onChange, startOpen = false, onClosed, anchor }) {
  const [open, setOpen] = useState(startOpen);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuId = useId();
  const genres = smartListGenres(catalog, rules.mediaType);
  const { label, multi, choices } = smartListRuleChoices(rule, rules, { genres });
  const close = (refocus = false) => {
    setOpen(false);
    onClosed?.();
    if (refocus) buttonRef.current?.focus();
  };
  useDismiss(open, close, rootRef);

  const pickChoice = (value) => {
    // A new type keeps only the genres it offers ("Movies and shows" offers both).
    const offeredGenreIds = rule === 'mediaType' ? smartListGenres(catalog, value).map(g => g.id) : undefined;
    onChange(setSmartListRule(rules, rule, value, { offeredGenreIds }));
    if (!multi) close(true);
  };

  return (
    <span className="smart-chip-wrap" ref={rootRef}>
      {anchor ?? (
        <button
          ref={buttonRef}
          type="button"
          className="smart-chip"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`${text.replace(/[.,]$/, '')}. ${SMART_LISTS.ruleMenu(label)}`}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {text}
        </button>
      )}
      {open && (
        <div id={menuId} className="kebab-menu-panel smart-chip-menu" role="menu" aria-label={label}>
          <div className="smart-chip-menu-title" aria-hidden="true">{label}</div>
          <div className="smart-chip-menu-items">
            {choices.map(choice => (
              <button
                key={String(choice.value)}
                type="button"
                role={multi ? 'menuitemcheckbox' : 'menuitemradio'}
                aria-checked={choice.selected}
                className="kebab-menu-item smart-chip-menu-item"
                onClick={() => pickChoice(choice.value)}
              >
                <span>{choice.label}</span>
                {choice.selected && <span className="smart-chip-menu-check"><IconTick /></span>}
              </button>
            ))}
          </div>
          {isRemovableSmartListRule(rule) && !anchor && (
            <button type="button" role="menuitem" className="kebab-menu-item smart-chip-menu-remove"
              onClick={() => { onChange(removeSmartListRule(rules, rule)); close(); }}>
              {SMART_LISTS.removeRule}
            </button>
          )}
        </div>
      )}
    </span>
  );
}

/**
 * "Add a rule": a menu of the filters not set yet. Picking one with choices
 * opens that rule's choices in place; services turns straight on.
 */
function AddRule({ rules, catalog, hasServices, onChange }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(/** @type {import('@plot/core/smartLists.js').SmartListRuleKey | null} */ (null));
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const close = (refocus = false) => { setOpen(false); if (refocus) buttonRef.current?.focus(); };
  useDismiss(open, close, rootRef);
  const addable = addableSmartListRules(rules, { hasServices });
  if (!addable.length) return null;

  const button = (
    <button ref={buttonRef} type="button" className="smart-add-rule" aria-haspopup="menu" aria-expanded={open || !!adding}
      onClick={() => { setAdding(null); setOpen(o => !o); }}>
      <IconPlus />{SMART_LISTS.addRule}
    </button>
  );

  if (adding) {
    return (
      <RuleChip rule={adding} text="" rules={rules} catalog={catalog} startOpen anchor={button}
        onChange={onChange} onClosed={() => setAdding(null)} />
    );
  }

  return (
    <span className="smart-chip-wrap" ref={rootRef}>
      {button}
      {open && (
        <div className="kebab-menu-panel smart-chip-menu" role="menu" aria-label={SMART_LISTS.addRule}>
          <div className="smart-chip-menu-items">
            {addable.map(({ rule, label }) => (
              <button key={rule} type="button" role="menuitem" className="kebab-menu-item smart-chip-menu-item"
                onClick={() => {
                  setOpen(false);
                  if (rule === 'onlyServices') { onChange(setSmartListRule(rules, rule, true)); return; }
                  setAdding(rule);
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * @param {{
 *   rules: import('@plot/core/smartLists.js').SmartListRules,
 *   catalog: { movie?: Array<{id:number,name:string}>, tv?: Array<{id:number,name:string}> },  TMDB's genre lists
 *   hasServices: boolean,
 *   onChange?: (next: import('@plot/core/smartLists.js').SmartListRules) => void,  omit for read-only
 *   variant?: 'card' | 'page',  card: the builder's boxed sentence; page: under a list's title
 *   className?: string,
 * }} props
 */
export default function SmartListRules({ rules, catalog, hasServices, onChange, variant = 'card', className = '' }) {
  const parts = smartListSentence(rules, { genres: smartListGenres(catalog, rules.mediaType), hasServices });
  return (
    <div className={`smart-rules smart-rules--${variant} ${className}`}>
      <p className="smart-sentence">
        {parts.map((part, i) => {
          const gap = i > 0 ? ' ' : '';
          if (part.kind === 'text') return <span key={i}>{gap}{part.text}</span>;
          if (!onChange) return <span key={i}>{gap}<span className="smart-chip smart-chip--static">{part.text}</span></span>;
          return (
            <span key={`${part.rule}-${i}`}>
              {gap}
              <RuleChip rule={part.rule} text={part.text} rules={rules} catalog={catalog} onChange={onChange} />
            </span>
          );
        })}
      </p>
      {onChange && <AddRule rules={rules} catalog={catalog} hasServices={hasServices} onChange={onChange} />}
    </div>
  );
}
