import React from 'react';
import { createRoot } from 'react-dom/client';
import Auth from './Auth';
import Ledger from './Ledger';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Auth>
      <Ledger />
    </Auth>
  </React.StrictMode>
);
