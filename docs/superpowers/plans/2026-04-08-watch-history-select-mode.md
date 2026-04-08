# Watch History + Bulk Select Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the "No list" virtual list to "Watch History", add bulk select mode to all list detail views, and implement delete/move-to-list bulk actions with appropriate confirmation for permanent journal deletion.

**Architecture:** All changes are contained to `JournalView.jsx` (select state, UI, handlers) and `App.jsx` (new `deleteFromJournal` function + prop passthrough). CSS additions go in `app.css`. No new files needed.

**Tech Stack:** React 19, Supabase JS client, existing CSS custom properties (`--accent-primary`, `--surface-color`, `--text-primary`, `--glass-border`, `--radius-lg`, `--radius-md`, `--radius-pill`)

---

## File Map

| File | Changes |
|------|---------|
| `src/App.jsx` | Add `deleteFromJournal` async function; pass as prop to `JournalView` |
| `src/components/JournalView.jsx` | Rename "No list"→"Watch History"; add select mode state + triggers; make items selectable; add action bar; add move-to-list picker; add delete-from-history confirm modal |
| `src/app.css` | Add styles for selected items, checkboxes, action bar, move picker, confirm modal |

---

## Task 1: Rename "No list" → "Watch History"

**Files:**
- Modify: `src/components/JournalView.jsx:350`

- [ ] **Step 1: Change the virtual list name**

In `JournalView.jsx`, find this line (~350):
```jsx
list={{ id: 'unlisted', name: 'No list' }}
```
Change to:
```jsx
list={{ id: 'unlisted', name: 'Watch History' }}
```

- [ ] **Step 2: Verify**

```bash
npm run dev
```
Open Journal → My Lists. The virtual list card should now say "Watch History". The `id` stays `'unlisted'` internally — no other logic changes.

- [ ] **Step 3: Commit**

```bash
git add src/components/JournalView.jsx
git commit -m "feat: rename 'No list' virtual list to 'Watch History'"
```

---

## Task 2: Add deleteFromJournal to App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the function**

In `App.jsx`, find the `toggleListPublic` function (~line 584). Add `deleteFromJournal` immediately before it:

```jsx
const deleteFromJournal = async (tmdbIds) => {
  if (!user) return;
  await supabase.from('journal').delete().in('tmdb_id', tmdbIds);
  await supabase.from('list_items').delete().in('tmdb_id', tmdbIds).eq('user_id', user.id);
  setWatched(prev => prev.filter(w => !tmdbIds.includes(w.tmdb_id || w.id)));
  setListItems(prev => prev.filter(li => !tmdbIds.includes(li.tmdb_id)));
};
```

- [ ] **Step 2: Pass as prop to JournalView**

In `App.jsx`, find the `<JournalView` usage (~line 710). Add the prop:

```jsx
<JournalView
  {/* ... existing props ... */}
  deleteFromJournal={deleteFromJournal}
/>
```

- [ ] **Step 3: Add to JournalView prop interface**

In `JournalView.jsx`, find the `export default function JournalView({` destructure (~line 126). Add `deleteFromJournal` to the destructured props:

```jsx
export default function JournalView({
  user, watched, sampleWatched, mediaFilter,
  userLists, listItems, activeList, setActiveList,
  journalTab, setJournalTab,
  profile,
  createList, deleteList, renameList, toggleListItem,
  toggleListPublic, copyLink, copiedLink,
  timelineView, setTimelineView,
  gridTimeframe, setGridTimeframe,
  gridNav, setGridNav,
  selectedGridDay, setSelectedGridDay,
  onItemClick, formatDate, toDateKey, moodLabel, tlScribble,
  setShowAuth,
  deleteFromJournal,
}) {
```

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/JournalView.jsx
git commit -m "feat: add deleteFromJournal function and pass to JournalView"
```

---

## Task 3: Add select mode state and triggers

**Files:**
- Modify: `src/components/JournalView.jsx`

- [ ] **Step 1: Add state variables**

In `JournalView.jsx`, find the existing local state block (~line 148, near `showListEditMenu`). Add four new state variables after it:

```jsx
const [selectMode, setSelectMode] = useState(false);
const [selectedIds, setSelectedIds] = useState(new Set());
const [showMoveList, setShowMoveList] = useState(false);
const [pendingHistoryDelete, setPendingHistoryDelete] = useState(null);
```

- [ ] **Step 2: Add exitSelectMode helper**

Immediately after the state declarations, add:

```jsx
const exitSelectMode = () => {
  setSelectMode(false);
  setSelectedIds(new Set());
  setShowMoveList(false);
};

const toggleItemSelect = (tmdbId) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(tmdbId)) next.delete(tmdbId);
    else next.add(tmdbId);
    return next;
  });
};
```

- [ ] **Step 3: Add "Select items" to the regular list Edit dropdown**

Find the `list-edit-dropdown` div (~line 217). Add a new button above the `danger` "Delete list" button:

```jsx
<div className="list-edit-dropdown">
  <button onClick={() => { setEditListNameValue(activeList.name); setEditingListName(true); setShowListEditMenu(false); }}>
    Rename
  </button>
  <button onClick={() => { toggleListPublic(activeList.id); setShowListEditMenu(false); }}>
    {activeList.is_public ? 'Make private' : 'Make public'}
  </button>
  {activeList.is_public && profile?.username && (
    <button onClick={() => { copyLink('list', activeList.id); setShowListEditMenu(false); }}>
      {copiedLink === activeList.id ? 'Copied!' : 'Copy list link'}
    </button>
  )}
  <button onClick={() => { setSelectMode(true); setShowListEditMenu(false); }}>
    Select items
  </button>
  <button className="danger" onClick={() => { if (window.confirm(`Delete "${activeList.name}"?`)) { deleteList(activeList.id); setShowListEditMenu(false); } }}>
    Delete list
  </button>
</div>
```

- [ ] **Step 4: Add Select button for Watch History (virtual lists)**

Find the `section-header-row` div (~line 193). The current code shows the "Edit list" menu only for `!isVirtualList`. Replace the entire `{!isVirtualList && (...)}` block with:

```jsx
{!isVirtualList && !selectMode && (
  <div className="list-edit-menu-wrapper">
    <button className="new-list-header-btn list-edit-btn" onClick={() => setShowListEditMenu(v => !v)}>
      Edit list
    </button>
    {showListEditMenu && (
      <>
        <div className="list-edit-backdrop" onClick={() => setShowListEditMenu(false)} />
        <div className="list-edit-dropdown">
          <button onClick={() => { setEditListNameValue(activeList.name); setEditingListName(true); setShowListEditMenu(false); }}>
            Rename
          </button>
          <button onClick={() => { toggleListPublic(activeList.id); setShowListEditMenu(false); }}>
            {activeList.is_public ? 'Make private' : 'Make public'}
          </button>
          {activeList.is_public && profile?.username && (
            <button onClick={() => { copyLink('list', activeList.id); setShowListEditMenu(false); }}>
              {copiedLink === activeList.id ? 'Copied!' : 'Copy list link'}
            </button>
          )}
          <button onClick={() => { setSelectMode(true); setShowListEditMenu(false); }}>
            Select items
          </button>
          <button className="danger" onClick={() => { if (window.confirm(`Delete "${activeList.name}"?`)) { deleteList(activeList.id); setShowListEditMenu(false); } }}>
            Delete list
          </button>
        </div>
      </>
    )}
  </div>
)}
{isVirtualList && !selectMode && (
  <button className="new-list-header-btn list-edit-btn" onClick={() => setSelectMode(true)}>
    Select
  </button>
)}
{selectMode && (
  <button className="new-list-header-btn list-edit-btn" onClick={exitSelectMode}>
    Cancel
  </button>
)}
```

- [ ] **Step 5: Verify select mode toggles**

```bash
npm run dev
```

- Open a regular list → "Edit list" dropdown should now include "Select items". Click it — Cancel button should appear.
- Open Watch History → "Select" button should appear. Click it — Cancel should appear.

- [ ] **Step 6: Commit**

```bash
git add src/components/JournalView.jsx
git commit -m "feat: add select mode state and triggers to list detail view"
```

---

## Task 4: Make items selectable in select mode

**Files:**
- Modify: `src/components/JournalView.jsx`
- Modify: `src/app.css`

- [ ] **Step 1: Update item rendering for select mode**

Find the `activeListItems.map` block (~line 240). Replace the entire map content with:

```jsx
{activeListItems.map((item, index) => {
  const tmdbId = item.tmdb_id || item.id;
  const isSelected = selectedIds.has(tmdbId);
  return (
    <div
      key={item.id || index}
      className={`bento-item glass list-detail-item${isSelected ? ' selected' : ''}`}
      onClick={() => {
        if (selectMode) {
          toggleItemSelect(tmdbId);
        } else {
          onItemClick(isVirtualList ? item : { ...item, id: item.tmdb_id });
        }
      }}
    >
      {item.poster_path
        ? <img src={`https://image.tmdb.org/t/p/w500${item.poster_path}`} alt={item.title || item.name} />
        : <div className="no-image">{item.title || item.name}</div>
      }
      {!selectMode && <ShareButton item={isVirtualList ? item : { ...item, id: item.tmdb_id }} />}
      <div className="overlay">
        <h3>{item.title || item.name}</h3>
      </div>
      {selectMode && (
        <div className={`item-select-overlay${isSelected ? ' checked' : ''}`}>
          <div className="item-checkbox">
            {isSelected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
          </div>
        </div>
      )}
      {!selectMode && !isVirtualList && (
        <button
          className="remove-item-btn"
          onClick={e => { e.stopPropagation(); toggleListItem(activeList.id, { id: item.tmdb_id }, false); }}
          title="Remove from list"
        >×</button>
      )}
    </div>
  );
})}
```

- [ ] **Step 2: Add CSS for selected state and checkbox**

In `src/app.css`, find `.list-detail-item:hover .remove-item-btn` (~line 919). Add after it:

```css
/* ── Select mode ─────────────────────────────────────────── */
.bento-item.selected {
  outline: 2.5px solid var(--accent-primary);
  outline-offset: -2px;
}

.item-select-overlay {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
}

.item-checkbox {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, border-color 0.15s;
}

.item-select-overlay.checked .item-checkbox {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}
```

- [ ] **Step 3: Verify selection works visually**

```bash
npm run dev
```

Enter select mode on any list. Click items — they should get a visible outline and checkmark. Click again — deselected.

- [ ] **Step 4: Commit**

```bash
git add src/components/JournalView.jsx src/app.css
git commit -m "feat: make list items selectable in select mode with checkbox overlay"
```

---

## Task 5: Add sticky action bar

**Files:**
- Modify: `src/components/JournalView.jsx`
- Modify: `src/app.css`

- [ ] **Step 1: Add bulk action handlers**

In `JournalView.jsx`, add `handleBulkDelete` and `handleBulkMove` immediately after the `toggleItemSelect` helper from Task 3. These **must** be defined before the JSX that references them in Step 2:

```jsx
const handleBulkDelete = async () => {
  const tmdbIds = [...selectedIds];
  if (isVirtualList) {
    await deleteFromJournal(tmdbIds);
    exitSelectMode();
  } else {
    await Promise.all(tmdbIds.map(id => toggleListItem(activeList.id, { id }, false)));
    const inHistory = tmdbIds.filter(id =>
      watched.some(w => (w.tmdb_id || w.id) === id)
    );
    if (inHistory.length > 0) {
      setPendingHistoryDelete(inHistory);
    } else {
      exitSelectMode();
    }
  }
};

const handleBulkMove = async (targetListId) => {
  const tmdbIds = [...selectedIds];
  const itemsToMove = activeListItems.filter(item =>
    tmdbIds.includes(item.tmdb_id || item.id)
  );
  if (!isVirtualList) {
    await Promise.all(tmdbIds.map(id => toggleListItem(activeList.id, { id }, false)));
  }
  await Promise.all(itemsToMove.map(item =>
    toggleListItem(targetListId, {
      id: item.tmdb_id || item.id,
      media_type: item.media_type || (item.title ? 'movie' : 'tv'),
      title: item.title || item.name,
      poster_path: item.poster_path,
    }, true)
  ));
  setShowMoveList(false);
  exitSelectMode();
};
```

- [ ] **Step 2: Add the action bar JSX**

In `JournalView.jsx`, find the closing `</div>` of the `list-detail-view` div (~line 267, just after the `bento-grid` closes). Add the action bar and move picker just before that closing tag:

```jsx
        {selectMode && selectedIds.size > 0 && (
          <div className="select-action-bar">
            <span className="select-count">{selectedIds.size} selected</span>
            <div className="select-actions">
              <button className="select-action-btn" onClick={() => setShowMoveList(v => !v)}>
                Move to list
              </button>
              <button className="select-action-btn danger" onClick={handleBulkDelete}>
                Delete
              </button>
            </div>
          </div>
        )}

        {showMoveList && (
          <>
            <div className="move-list-backdrop" onClick={() => setShowMoveList(false)} />
            <div className="move-to-list-popup">
              <h4>Move to list</h4>
              {userLists
                .filter(l => isVirtualList || l.id !== activeList.id)
                .map(l => (
                  <button key={l.id} onClick={() => handleBulkMove(l.id)}>
                    {l.name}
                  </button>
                ))
              }
              {userLists.filter(l => isVirtualList || l.id !== activeList.id).length === 0 && (
                <p style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  No other lists. Create one first.
                </p>
              )}
            </div>
          </>
        )}
```

Note: `handleBulkDelete` and `handleBulkMove` are added in Task 6 — do not run dev server yet.

- [ ] **Step 2: Add action bar CSS**

In `src/app.css`, add after the select mode styles from Task 4:

```css
/* ── Select action bar ───────────────────────────────────── */
.select-action-bar {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--text-primary);
  color: var(--bg-color);
  border-radius: var(--radius-pill);
  padding: 0.75rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  z-index: 150;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
}

.select-count {
  font-size: 0.85rem;
  opacity: 0.6;
}

.select-actions {
  display: flex;
  gap: 0.5rem;
}

.select-action-btn {
  background: rgba(128, 128, 128, 0.25);
  color: inherit;
  border: none;
  border-radius: var(--radius-pill);
  padding: 0.4rem 0.9rem;
  font-size: 0.85rem;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: background 0.15s;
}

.select-action-btn:hover { background: rgba(128, 128, 128, 0.4); }

.select-action-btn.danger { background: rgba(229, 85, 85, 0.4); }
.select-action-btn.danger:hover { background: rgba(229, 85, 85, 0.6); }

/* ── Move to list popup ──────────────────────────────────── */
.move-list-backdrop {
  position: fixed;
  inset: 0;
  z-index: 149;
}

.move-to-list-popup {
  position: fixed;
  bottom: 5.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface-color);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  padding: 0.5rem;
  z-index: 151;
  min-width: 200px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.move-to-list-popup h4 {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  padding: 0.5rem 0.75rem 0.25rem;
  margin: 0;
  font-family: var(--font-sans);
  font-weight: 600;
}

.move-to-list-popup button {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0.6rem 0.75rem;
  border-radius: calc(var(--radius-md) - 4px);
  cursor: pointer;
  font-size: 0.9rem;
  font-family: var(--font-sans);
  color: var(--text-primary);
  transition: background 0.12s;
}

.move-to-list-popup button:hover { background: var(--glass-border); }

[data-theme="dark"] .move-to-list-popup {
  background: #1e1e1e;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* On mobile, raise action bar above the bottom tab bar */
@media (max-width: 768px) {
  .select-action-bar { bottom: 5rem; }
  .move-to-list-popup { bottom: 8.5rem; }
}
```

- [ ] **Step 3: Commit (UI only — handlers not wired yet)**

```bash
git add src/components/JournalView.jsx src/app.css
git commit -m "feat: add select action bar and move-to-list popup UI"
```

---

## Task 6: Verify bulk actions end-to-end

**Files:** None (verification only — handlers were added in Task 5)

- [ ] **Step 1: Verify bulk delete on Watch History**

```bash
npm run dev
```

1. Open Watch History → Select → pick 1–2 items → Delete
2. Items should disappear from Watch History and from any manual lists they were in
3. No confirm modal (Watch History delete is direct)

- [ ] **Step 2: Verify bulk delete on a regular list**

1. Open a manual list → Edit list → Select items → pick some → Delete
2. Items removed from list
3. If any items were also in Watch History, the confirm modal appears (Task 7 adds this modal UI — run after Task 7)

- [ ] **Step 3: Verify move to list**

1. Select mode → pick items → Move to list → choose a list
2. Items appear in the chosen list; items from a regular list no longer appear in the source list

---

## Task 7: Add "Also remove from Watch History?" confirm modal

**Files:**
- Modify: `src/components/JournalView.jsx`
- Modify: `src/app.css`

- [ ] **Step 1: Add the confirm modal JSX**

In `JournalView.jsx`, find the closing `</section>` tag of the `watchlist` section (the very last line of the return, ~line 700+). Add the modal just before it:

```jsx
      {pendingHistoryDelete && (
        <>
          <div className="modal-backdrop" onClick={() => { setPendingHistoryDelete(null); exitSelectMode(); }} />
          <div className="confirm-modal">
            <p>
              Also remove {pendingHistoryDelete.length} item{pendingHistoryDelete.length !== 1 ? 's' : ''} from Watch History?
            </p>
            <div className="confirm-modal-actions">
              <button onClick={async () => {
                await deleteFromJournal(pendingHistoryDelete);
                setPendingHistoryDelete(null);
                exitSelectMode();
              }}>
                Yes, remove from history
              </button>
              <button onClick={() => { setPendingHistoryDelete(null); exitSelectMode(); }}>
                No, keep in history
              </button>
            </div>
          </div>
        </>
      )}
```

Note: `modal-backdrop` already exists in `app.css` (used by other modals) — check with:
```bash
grep -n "modal-backdrop" ~/Programming/Plot/src/app.css
```
If it doesn't exist, add it in Step 2 alongside the confirm modal styles.

- [ ] **Step 2: Add confirm modal CSS**

In `src/app.css`, add after the move-to-list popup styles:

```css
/* ── Delete from history confirm ─────────────────────────── */
.confirm-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--surface-color);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 1.75rem 1.5rem 1.5rem;
  z-index: 300;
  max-width: 340px;
  width: calc(100% - 2rem);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  text-align: center;
}

.confirm-modal p {
  margin: 0 0 1.5rem;
  color: var(--text-primary);
  font-size: 0.95rem;
  line-height: 1.55;
  font-family: var(--font-sans);
}

.confirm-modal-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.confirm-modal-actions button {
  padding: 0.7rem 1rem;
  border-radius: var(--radius-pill);
  border: 1px solid var(--glass-border);
  background: none;
  cursor: pointer;
  font-size: 0.9rem;
  font-family: var(--font-sans);
  color: var(--text-primary);
  transition: background 0.12s;
}

.confirm-modal-actions button:first-child {
  background: #e55;
  color: white;
  border-color: #e55;
}

.confirm-modal-actions button:first-child:hover { background: #c44; border-color: #c44; }
.confirm-modal-actions button:last-child:hover { background: var(--glass-border); }

[data-theme="dark"] .confirm-modal {
  background: #1e1e1e;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}
```

Also check for `modal-backdrop` — if not defined add:
```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 299;
}
```

- [ ] **Step 3: Verify the full delete flow**

```bash
npm run dev
```

1. Open a manual list → Edit list → Select items → pick items that exist in Watch History → Delete
2. Items disappear from the list
3. Confirm modal appears: "Also remove N items from Watch History?"
4. **Yes**: items disappear from Watch History list too
5. **No**: items gone from this list but still visible in Watch History
6. Select mode exits in both cases

- [ ] **Step 4: Commit**

```bash
git add src/components/JournalView.jsx src/app.css
git commit -m "feat: add confirm modal for removing items from Watch History after list delete"
```

---

## Task 8: Exit select mode on list navigation

**Files:**
- Modify: `src/components/JournalView.jsx`

When a user navigates back from a list while in select mode, the mode should reset — otherwise state leaks to the next list they open.

- [ ] **Step 1: Reset select mode on back navigation**

Find the back button (~line 192):
```jsx
<button className="back-btn" onClick={() => { setActiveList(null); setEditingListName(false); }}>
```

Update to also exit select mode:
```jsx
<button className="back-btn" onClick={() => { setActiveList(null); setEditingListName(false); exitSelectMode(); }}>
```

- [ ] **Step 2: Reset select mode when activeList changes**

After the `exitSelectMode` helper definition, add a `useEffect`:

```jsx
useEffect(() => {
  exitSelectMode();
}, [activeList?.id]);
```

- [ ] **Step 3: Verify no state leakage**

```bash
npm run dev
```

1. Open list A → enter select mode → select some items → press back
2. Open list B → select mode should be off, no items selected

- [ ] **Step 4: Commit**

```bash
git add src/components/JournalView.jsx
git commit -m "fix: reset select mode when navigating between lists"
```

---

## Summary

| Task | What it delivers |
|------|-----------------|
| 1 | "No list" → "Watch History" label |
| 2 | `deleteFromJournal` in App.jsx, passed as prop |
| 3 | Select mode state, "Select items" in Edit dropdown, "Select" button on virtual lists |
| 4 | Selectable items with checkbox overlay + selected outline |
| 5 | Floating action bar (N selected · Move to list · Delete) + move picker |
| 6 | Bulk delete and move handlers wired up |
| 7 | "Also remove from Watch History?" confirm modal |
| 8 | Select mode resets on list navigation |
