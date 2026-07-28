import { useCallback } from 'react';

// ===============================================================
// PinPad.jsx — S2-7D6E5
//
// THE canonical numeric PIN entry surface. Every PIN in this app — operational
// login, admin step-up re-confirmation, new/confirm PIN when rotating an
// actor's PIN — renders through this ONE component: same 0-9 grid, same
// masked-dot progress, same backspace/clear, same error/loading treatment.
//
// No <input> exists anywhere in this component, so no device virtual keyboard
// is ever invoked. `value`/`onChange` are fully controlled by the caller —
// this component holds no PIN state of its own and never persists, logs, or
// echoes the digits anywhere beyond the masked dots.
// ===============================================================
export default function PinPad({
  icon = '🔒',
  title,
  subtitle,
  value,
  onChange,
  minLength,
  maxLength = minLength,
  loading = false,
  loadingLabel = 'Verificando…',
  error = '',
  submitLabel = 'Entrar',
  onSubmit,
  onCancel,
  cancelLabel = 'Cancelar',
}) {
  const dotCount = Math.max(minLength || 0, value.length);
  const canSubmit = !loading && value.length >= (minLength || 1) && value.length <= maxLength;

  const press = useCallback((k) => {
    if (loading) return;
    if (k === 'DEL') { onChange(value.slice(0, -1)); return; }
    if (k === 'CLR') { onChange(''); return; }
    if (value.length < maxLength) onChange(value + k);
  }, [loading, value, maxLength, onChange]);

  return (
    <div style={{ width: '100%', maxWidth: 320, textAlign: 'center' }}>
      {icon && <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>}
      {title && <div style={{ color: '#fff', fontWeight: 800, fontSize: 19, letterSpacing: 0.3 }}>{title}</div>}
      {subtitle && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 6, marginBottom: 20 }}>{subtitle}</div>}

      <div data-testid="pinpad-dots" style={{ display: 'flex', gap: 14, justifyContent: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {Array.from({ length: dotCount }, (_, i) => i).map((i) => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < value.length ? (error ? '#E8341C' : '#F97316') : 'rgba(255,255,255,0.15)',
            border: `2px solid ${error ? '#E8341C' : i < value.length ? '#F97316' : 'rgba(255,255,255,0.25)'}`,
            transition: 'all .15s',
            transform: error ? 'scale(1.2)' : 'scale(1)',
          }}
          />
        ))}
      </div>

      {loading && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 10 }}>{loadingLabel}</div>}
      {!loading && error && (
        <div role="alert" style={{ color: '#E8341C', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{error}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, width: 240, margin: '0 auto' }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'CLR'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            disabled={loading}
            aria-label={k === 'DEL' ? 'Borrar' : k === 'CLR' ? 'Vaciar' : k}
            style={{
              height: 64,
              background: (k === 'DEL' || k === 'CLR') ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14,
              color: '#fff',
              fontSize: (k === 'DEL' || k === 'CLR') ? 13 : 22,
              fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.4 : 1,
            }}
          >
            {k === 'DEL' ? '⌫' : k === 'CLR' ? 'Vaciar' : k}
          </button>
        ))}
      </div>

      {onSubmit && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            width: 240, height: 52, borderRadius: 14, marginTop: 20,
            background: canSubmit ? '#F97316' : 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: canSubmit ? '#fff' : 'rgba(255,255,255,0.35)',
            fontSize: 16, fontWeight: 800, letterSpacing: 1,
            cursor: canSubmit ? 'pointer' : 'default',
          }}
        >
          {submitLabel}
        </button>
      )}

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          style={{
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.3)', fontSize: 13,
            cursor: loading ? 'default' : 'pointer', padding: '8px 20px', marginTop: 8,
          }}
        >
          {cancelLabel}
        </button>
      )}
    </div>
  );
}
