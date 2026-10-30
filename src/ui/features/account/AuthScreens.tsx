import { useState, type ReactNode } from 'react';
import { assetUrl, isTauri } from '@/core/platform/env';
import { useApp } from '@/app/store';
import { Button } from '@/ui/components/ui';

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="card auth-card">
        <img src={assetUrl('favicon.png')} alt="" width={44} height={44} />
        {children}
      </div>
    </div>
  );
}

export function LoginScreen() {
  const auth = useApp((s) => s.auth);
  const { signIn } = useApp.getState();
  const [emailMode, setEmailMode] = useState(false);
  return (
    <Shell>
      <h1 className="auth-title">Lexora</h1>
      <p className="muted">Votre carnet de vocabulaire, dans toutes vos langues, synchronisé entre ordinateur et téléphone.</p>
      <Button variant="secondary" size="lg" block onClick={() => void signIn()} disabled={auth.busy}>
        <GoogleLogo /> {auth.busy ? 'Connexion dans le navigateur…' : 'Continuer avec Google'}
      </Button>
      {auth.busy && !emailMode && <p className="muted small">Terminez la connexion dans la fenêtre du navigateur qui vient de s'ouvrir, puis revenez ici.</p>}
      {!isTauri() && <EmailCodeLogin onOpen={setEmailMode} />}
      {auth.error && <p className="field-error">{auth.error}</p>}
      <p className="muted small">Une connexion Internet est nécessaire la première fois. Ensuite, Lexora fonctionne aussi hors ligne.</p>
    </Shell>
  );
}

export function AccountConflictScreen() {
  const user = useApp((s) => s.auth.user);
  const { resolveAccountConflict } = useApp.getState();
  return (
    <Shell>
      <h1 className="auth-title">Autre compte détecté</h1>
      <p className="text-2">
        Cet appareil contient les données d'un autre compte. Pour continuer avec <strong>{user?.email}</strong>, les données locales seront remplacées
        par celles de ce compte (les données de l'autre compte restent dans son espace en ligne).
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <Button onClick={() => void resolveAccountConflict(false)}>Annuler</Button>
        <Button variant="primary" onClick={() => void resolveAccountConflict(true)}>
          Continuer avec ce compte
        </Button>
      </div>
    </Shell>
  );
}

export function FirstSyncScreen() {
  return (
    <Shell>
      <h1 className="auth-title">Récupération de vos données…</h1>
      <p className="muted">Lexora charge votre vocabulaire et votre historique de révision.</p>
      <div className="session-progress" style={{ width: '100%' }}>
        <span className="indeterminate" />
      </div>
    </Shell>
  );
}

/**
 * Connexion par code reçu par e-mail (version web) : utile sur iPhone, où la page Google s'ouvre hors de l'application
 * installée. Le compte doit déjà exister (première connexion avec Google, même adresse).
 */
function EmailCodeLogin({ onOpen }: { onOpen: (open: boolean) => void }) {
  const busy = useApp((s) => s.auth.busy);
  const { signInWithCode } = useApp.getState();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  if (!open)
    return (
      <button
        className="link small"
        onClick={() => {
          setOpen(true);
          onOpen(true);
        }}
      >
        Recevoir un code par e-mail
      </button>
    );
  return (
    <form
      className="stack stack--sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (!sent) void signInWithCode(email).then((ok) => ok && setSent(true));
        else void signInWithCode(email, code);
      }}
    >
      <input className="input" type="email" autoComplete="email" placeholder="Votre adresse e-mail" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} required />
      {sent && (
        <>
          <p className="muted small">Un code à 6 chiffres vient d'être envoyé à cette adresse.</p>
          <input
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Code reçu"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
          />
        </>
      )}
      <Button type="submit" variant="primary" block disabled={busy || !email.trim() || (sent && code.trim().length < 6)}>
        {sent ? 'Se connecter' : 'Envoyer le code'}
      </Button>
    </form>
  );
}
