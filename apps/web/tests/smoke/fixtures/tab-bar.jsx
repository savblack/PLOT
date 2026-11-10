// Mounts the real app shell so the smoke test can check the phone tab bar.
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import Harness from './tab-bar-harness.jsx';
// The shell's own styles. In the app, App.jsx brings these in; without them
// here the bar would only be styled if another module happened to load them.
import '../../../src/styles/app.css';
import '../../../src/index.css';

createRoot(document.getElementById('root')).render(<BrowserRouter><Harness /></BrowserRouter>);
