import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import SettingsBilling from '../../../src/components/SettingsBilling.jsx';
import { billingAccess } from '@plot/core/billing.js';
import '../../../src/styles/tokens.css';
const states = [
  ['No subscription', { isPremium: false, canManage: false }],
  ['Expired subscription', { isPremium: false, canManage: true, status: 'past_due' }],
  ['Active subscription', { isPremium: true, canManage: true, status: 'active', periodEnd: '2027-06-19T12:00:00Z' }],
  ['Free trial', { isPremium: true, canManage: true, status: 'trialing', periodEnd: '2026-11-17T12:00:00Z' }],
  ['Ending subscription', { isPremium: true, canManage: true, status: 'active', cancelAtPeriodEnd: true, periodEnd: '2027-06-19T12:00:00Z' }],
  ['Premium provided by Plot', { isPremium: true, canManage: false, status: 'active' }],
];
createRoot(document.getElementById('root')).render(<MemoryRouter><main>{states.map(([name, billing]) => <section key={name} aria-label={name}><h2>{name}</h2><SettingsBilling {...billingAccess(billing)} billing={billing} onManage={() => {}} /></section>)}</main></MemoryRouter>);
