import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import SettingsBilling from '../../../src/components/SettingsBilling.jsx';
import { billingAccess } from '@plot/core/billing.js';
import '../../../src/styles/tokens.css';
const states = [
  ['No subscription', { isPremium: false, canManage: false }],
  ['Expired subscription', { isPremium: false, canManage: true, status: 'past_due' }],
  ['Active subscription', { isPremium: true, canManage: true, status: 'active' }],
  ['No billing relationship', { isPremium: true, canManage: false }],
];
createRoot(document.getElementById('root')).render(<MemoryRouter><main>{states.map(([name, billing]) => <section key={name} aria-label={name}><h2>{name}</h2><SettingsBilling {...billingAccess(billing)} billing={billing} onManage={() => {}} /></section>)}</main></MemoryRouter>);
