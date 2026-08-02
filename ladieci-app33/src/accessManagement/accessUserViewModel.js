// ─── Access Management V3 — presentation/view-model boundary (V3-I.1 UX) ─────
// ONE centralized place that decides what an access-user record looks like on
// screen. The page/card components render this output verbatim — they make no
// wording, labeling or fallback-naming decisions of their own. Mirrors the
// precedent in operationalSession.js (ACTOR_LABEL/ROLE_LABEL/describeIdentity
// centralize the OTHER auth surface's presentation the same way).
//
// Input is the already-sanitized `{actor, displayName, canonicalRole, active,
// hasPin}` record from accessManagementApi.js (never raw pin/hash/token — that
// stripping already happened in the API client). This module adds no new
// network call and touches no write route.
import { describeRole } from './roleLabels';

// A legacy/default display name carries no real information beyond what the
// role already says (it was migration-generated, e.g. "Operador de apoyo
// heredado", or is literally the role word, e.g. "Repartidor", or is the raw
// actor id). Those must not be shown as a person's name — a deterministic
// "Operador N" fallback replaces them. A genuine later rename (V3-I.2) simply
// stops matching this check and starts rendering automatically.
const GENERIC_NAME_MARKERS = [/heredado/i];

function isGenericDisplayName(displayName, roleLabel, actorId) {
  const name = String(displayName || '').trim();
  if (!name) return true;
  const lower = name.toLowerCase();
  if (lower === String(roleLabel || '').toLowerCase()) return true;
  if (lower === String(actorId || '').toLowerCase()) return true;
  return GENERIC_NAME_MARKERS.some((re) => re.test(name));
}

// One user's presentation. `context.isOwner` selects the MI ACCESO rules
// (no Activo/Inactivo — a logged-in owner is definitionally active; "Propietario"
// fallback). `context.staffIndex` (1-based) is this user's position in the
// caller's already-deterministic staff ordering, used only as the "Operador N"
// fallback number — never as a re-sort key here.
export function toAccessUserViewModel(apiUser, context = {}) {
  const u = apiUser || {};
  const isOwner = !!context.isOwner;
  const { label: roleLabel, beta: roleBeta } = describeRole(u.canonicalRole);

  const generic = isGenericDisplayName(u.displayName, roleLabel, u.actor);
  const primaryLabel = !generic
    ? u.displayName
    : (isOwner ? 'Propietario' : `Operador ${context.staffIndex}`);

  // Avoid saying the same thing twice (e.g. name "Propietario" + role "Propietario").
  const showRoleLabel = primaryLabel !== roleLabel;

  const active = u.active === true;
  const hasPin = u.hasPin === true;
  // The owner viewing this page is, by construction, an active session holder —
  // Activo/Inactivo carries no information for that row and is never shown.
  // At most ONE access-status concept is ever surfaced (role is the other) —
  // inactive takes priority over PIN state when both would otherwise apply.
  const inactiveRow = !isOwner && !active;
  const statusLabel = inactiveRow ? 'Inactivo' : (hasPin ? 'PIN configurado' : 'PIN no configurado');
  // Color is reinforcement only (the word already carries the meaning) and is
  // decided HERE, once, instead of the page string-matching statusLabel later.
  const statusTone = inactiveRow ? 'danger' : (hasPin ? 'positive' : 'warning');

  return Object.freeze({
    actorId: u.actor,
    isOwner,
    primaryLabel,
    roleLabel,
    roleBeta,
    showRoleLabel,
    active,
    hasPin,
    statusLabel,
    statusTone,
    // Explicitly named so no future page code mistakes this for a display name.
    secondaryTechnicalId: u.actor,
    // V3-I write support ONLY — never rendered. The role-change/deactivate/
    // reactivate/clear-PIN routes require the caller's believed-current raw
    // state as a stale-snapshot guard (`expectedRole` compares against the RAW
    // `auth_actors.role` DB value, confirmed directly against the RPC source —
    // NOT canonicalRole; `expectedActive`/`expectedSessionVersion` likewise
    // need the raw current values). Kept together under one clearly-named,
    // clearly-scoped field so it can never be mistaken for display data.
    writeSnapshot: Object.freeze({
      dbRole: u.dbRole,
      active,
      sessionVersion: u.sessionVersion,
    }),
  });
}

// The whole-directory view: splits MI ACCESO from PERSONAL by the CURRENT
// session actor (not by role — matches "the current authenticated owner
// account", the same split the page already used), then assigns stable
// staff-fallback numbering by sorting the remaining records by their actor id
// ascending — an explicit, stable presentation key that does not depend on
// backend response order (the backend list route is itself proven stable/
// alphabetical by actor, but this module does not rely on that implicitly).
//
// The fallback sequence ("Operador N") is consumed ONLY by accounts that
// actually need it (isGenericDisplayName) — a friendly-named account never
// occupies or shifts a numbering slot. Adding or removing a named account
// must never renumber a generic-named account around it.
export function buildAccessDirectoryViewModel(users, context = {}) {
  const list = Array.isArray(users) ? users : [];
  const currentActorId = context.currentActorId;

  const me = list.find((u) => u.actor === currentActorId) || null;
  const staffSorted = list
    .filter((u) => u.actor !== currentActorId)
    .slice()
    .sort((a, b) => (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0));

  let fallbackSeq = 0;
  const staff = staffSorted.map((u) => {
    const { label: roleLabel } = describeRole(u.canonicalRole);
    const needsFallback = isGenericDisplayName(u.displayName, roleLabel, u.actor);
    const staffIndex = needsFallback ? (fallbackSeq += 1) : null;
    return toAccessUserViewModel(u, { isOwner: false, staffIndex });
  });

  return {
    owner: me ? toAccessUserViewModel(me, { isOwner: true, staffIndex: null }) : null,
    staff,
  };
}
