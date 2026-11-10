// Mounts the real app shell so the smoke test can check the phone tab bar.
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import Harness from './tab-bar-harness.jsx';
import '../../../src/index.css';

createRoot(document.getElementById('root')).render(<BrowserRouter><Harness /></BrowserRouter>);
