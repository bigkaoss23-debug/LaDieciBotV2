import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AccountApp from './components/account/AccountApp';
import { shouldRenderAccount } from './account/accountApi';

// Top-level split: the customer ACCOUNT surface (/cuenta, or a Supabase email
// confirm/recovery callback landing at the site root) renders AccountApp. Every
// other entry renders the operator app EXACTLY as before — the PIN flow, roles,
// and deep links (/repartidor, /servizio, /econbot) are untouched.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(shouldRenderAccount(window.location) ? <AccountApp /> : <App />);
