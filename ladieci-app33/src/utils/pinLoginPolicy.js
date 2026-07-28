// S2-7D6E5 — the canonical operational-login PIN range.
//
// Mirrors the backend's Auth V2 login contract (validateUniversalPinFormat = /^\d{6,12}$/):
// accepts the legacy 6-12 digit range until owner/operator_primary/operator_backup/rider have
// each rotated onto the exact-six-digit NEW-PIN policy declared in accountHelpers.js — a
// different, stricter policy for PIN *creation*, not login.
//
// Both the login gate (App.jsx) and the admin step-up re-verification (OperationalMenu.jsx)
// verify the SAME credential class — the operator's own existing login PIN — and must share
// this range rather than each inventing its own bound.
export const PIN_LOGIN_MIN = 6;
export const PIN_LOGIN_MAX = 12;
