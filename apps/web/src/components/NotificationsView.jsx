// Notifications on the History shell: requests first (folded in from the old
// /requests page), new followers rolled into one row, everything else by day.
// Option C from the 17 Sep 2026 Notifications canvas. Native parity: the
// grouping lives in @plot/core/notificationGroups.js.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useNotifications } from '../hooks/useNotifications.js';
import { useFollowRequests } from '../hooks/useFollowRequests.js';
import { COMMON } from '../copy/common.js';
import { notificationPhrase, NOTIFICATIONS_EMPTY, NOTIFICATIONS_PAGE as T } from '@plot/core/copy/notifications.js';
import { groupNotifications, notificationKind, actorName, rollupNames } from '@plot/core/notificationGroups.js';
import { relativeTime } from '@plot/core/date.js';
import './NotificationsView.css';

const KindIcon = ({ kind }) => kind === 'request'
  ? <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
  : kind === 'follow'
    ? <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
    : <svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8z" /></svg>;

function Avatar({ url, name, small = false, kind }) {
  const cls = `notif-avatar${small ? ' notif-avatar--sm' : ''}`;
  return <span className="notif-avatar-wrap">
    {url ? <img className={cls} src={url} alt="" /> : <span className={cls} aria-hidden="true">{(name || '?').charAt(0).toUpperCase()}</span>}
    {kind && <span className={`notif-kind notif-kind--${kind}`} aria-hidden="true"><KindIcon kind={kind} /></span>}
  </span>;
}

/** Pure layout; data comes from the hooks in NotificationsView (and from a story). */
export function NotificationsPage({ list, requests, loading, onApprove, onDecline, onOpen, now, wasUnread = () => false }) {
  const { rollup, groups } = useMemo(() => groupNotifications(list, now), [list, now]);
  const unread = list.filter(wasUnread).length;
  const empty = !loading && list.length === 0 && requests.length === 0;
  const labels = { today: T.today, yesterday: T.yesterday, earlier: T.earlier };
  return <div className="hist-page notif-page">
    <div className="hist-toolbar"><span className="hist-toolbar-sub">{unread ? T.newCount(unread) : T.upToDate}</span></div>
    {loading ? <p className="hist-card-note notif-status" role="status">{COMMON.loading}</p>
      : empty ? <div className="empty-state"><div className="empty-title">{NOTIFICATIONS_EMPTY.title}</div><div className="empty-body">{NOTIFICATIONS_EMPTY.body}</div></div>
      : <div className="notif-body">
        {requests.length > 0 && <section className="notif-section">
          <div className="cal-stream-month"><h2 className="cal-stream-month-name">{T.requests}</h2><span className="cal-stream-month-count">{T.requestCount(requests.length)}</span></div>
          <div className="notif-request-grid">
            {requests.map(r => <div className="hist-card notif-request" key={r.follower_id}>
              <Avatar url={r.avatar_url} name={r.display_name || r.username} />
              <span className="notif-request-text">
                <button type="button" className="notif-request-name" onClick={() => onOpen?.(r.username)}>{r.display_name || r.username}</button>
                <span className="hist-card-note">@{r.username} · {T.wantsToFollow}</span>
              </span>
              <span className="notif-request-actions">
                <button type="button" className="btn btn-primary btn-xs" onClick={() => onApprove(r.follower_id)}>{T.approve}</button>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => onDecline(r.follower_id)}>{T.decline}</button>
              </span>
            </div>)}
          </div>
          <p className="hist-card-note notif-hint">{T.approveHint}</p>
        </section>}

        {rollup && <section className="notif-section">
          <div className="cal-stream-month"><h2 className="cal-stream-month-name">{T.newFollowers}</h2><span className="cal-stream-month-count">{T.thisWeek}</span></div>
          {(() => { const { names, tail } = rollupNames(rollup.items, T.others); return (
            <button type="button" className="hist-card notif-rollup interactive-surface" onClick={() => onOpen?.(rollup.items[0].actor_username)}>
              <span className={`notif-dot${rollup.unread && rollup.items.some(wasUnread) ? '' : ' notif-dot--read'}`} aria-hidden="true" />
              <span className="notif-stack">{rollup.items.slice(0, 3).map(n => <Avatar key={n.id} url={n.actor_avatar_url} name={actorName(n)} small />)}</span>
              <span className="notif-rollup-text">{names.map((name, i) => <span key={name}>{i > 0 && ', '}<strong>{name}</strong></span>)}{names.length > 0 && ' and '}<strong>{tail}</strong> {T.startedFollowing}</span>
              <span className="hist-card-note notif-time">{T.peopleCount(rollup.items.length)}</span>
            </button>
          ); })()}
        </section>}

        {groups.length > 0 && <section className="notif-section">
          {(requests.length > 0 || rollup) && <div className="cal-stream-month"><h2 className="cal-stream-month-name">{T.everythingElse}</h2></div>}
          {groups.map(group => <div className="notif-group" key={group.key}>
            <div className="notif-group-label">{labels[group.key]}</div>
            <div className="notif-rows">
              {group.items.map(n => <button type="button" className="notif-row interactive-surface" key={n.id} onClick={() => onOpen?.(n.actor_username)}>
                <span className={`notif-dot${wasUnread(n) ? '' : ' notif-dot--read'}`} aria-hidden="true" />
                <Avatar url={n.actor_avatar_url} name={actorName(n)} kind={notificationKind(n.type)} />
                <span className="notif-row-text"><strong>{actorName(n)}</strong> {notificationPhrase(n.type)}{n.post_title && <span className="hist-card-note"> · {n.post_title}</span>}</span>
                <span className="hist-card-note notif-time">{relativeTime(n.created_at, now)}</span>
              </button>)}
            </div>
          </div>)}
        </section>}
        {!groups.length && !rollup && requests.length > 0 && <p className="hist-card-note notif-status">{T.nothingElse}</p>}
      </div>}
  </div>;
}

export default function NotificationsView() {
  const { user } = useApp();
  const navigate = useNavigate();
  const { list, loading, refreshList, markAllRead } = useNotifications(user?.id);
  const { requests, loading: requestsLoading, approve, decline } = useFollowRequests(user?.id);
  // Which rows were unread when the page opened: the dots keep showing for
  // this visit even though opening the page clears the badge server-side.
  const [unreadIds, setUnreadIds] = useState(null);
  const [now] = useState(() => Date.now());
  useEffect(() => { refreshList(); }, [refreshList]);
  useEffect(() => { markAllRead(); }, [markAllRead]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- snapshot the unread set once the first load lands
    if (unreadIds === null && !loading && list.length) setUnreadIds(new Set(list.filter(n => !n.read_at || Date.parse(n.read_at) > Date.now() - 5000).map(n => n.id)));
  }, [list, loading, unreadIds]);
  return <NotificationsPage list={list} requests={requests} loading={loading || requestsLoading} now={now}
    onApprove={approve} onDecline={decline} onOpen={username => { if (username) navigate(`/u/${username}`); }}
    wasUnread={n => unreadIds?.has(n.id) ?? false} />;
}
