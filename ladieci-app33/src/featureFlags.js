// src/featureFlags.js — feature flags frontend, DEFAULT OFF.
//
// Progetto = Create React App (react-scripts): le env esposte al bundle devono
// avere prefisso REACT_APP_ e si leggono via process.env (baked a build-time).
// NB: NON è Vite → import.meta.env/VITE_* non esistono qui.
//
// I flag gateno SOLO route nascoste / pannelli lab interni. MAI bottoni o menu
// visibili agli operatori: l'abilitazione del flag non rende nulla operator-visible
// di per sé (serve comunque una route nascosta + PIN).
//
// Default OFF: variabile assente o valore diverso da "on" ⇒ disabilitato.

export function isPremiumProposalsEnabled() {
  try {
    return process.env.REACT_APP_PREMIUM_PROPOSALS === "on";
  } catch (_) {
    return false;
  }
}
