// Mounts the panel address harness under a real BrowserRouter, so the smoke
// test can press the browser's own Back and Forward buttons.
import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import Harness from './panel-route-harness.jsx';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="*" element={<Harness />} />
    </Routes>
  </BrowserRouter>,
);
