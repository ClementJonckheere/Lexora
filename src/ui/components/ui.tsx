import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Mastery } from '@/core/domain/types';
import { MASTERY_LABEL } from '@/core/domain/types';

/* ---------------------------------- Button --------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: boolean;
  block?: boolean;
  shortcut?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, block, shortcut, className = '', children, type = 'button', ...rest },
  ref,
) {
  const cls = [
    'btn',
    `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    icon && 'btn--icon',
    block && 'btn--block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {children}
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </button>
  );
});

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/* ---------------------------------- Badges --------------------------------- */

export function MasteryBadge({ mastery }: { mastery: Mastery }) {
  return <span className={`badge badge--${mastery}`}>{MASTERY_LABEL[mastery]}</span>;
}

export function DirectionDots({ levels, title }: { levels: Mastery[]; title?: string }) {
  return (
    <span className="dir-dots" title={title}>
      {levels.map((m, i) => (
        <span key={i} className={`dir-dot dir-dot--${m}`} />
      ))}
    </span>
  );
}

/* ---------------------------------- Switch --------------------------------- */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- Field ---------------------------------- */

export function Field({
  label,
  optional,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: ReactNode;
  optional?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="optional">facultatif</span>}
      </label>
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

/* ---------------------------------- Modal ---------------------------------- */

/** Pile des modales ouvertes : seule la plus haute réagit au clavier. */
const modalStack: symbol[] = [];
export const isModalOpen = () => modalStack.length > 0;

export function Modal({
  title,
  onClose,
  children,
  footer,
  size,
  className = '',
  labelledBy,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'wide';
  className?: string;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const downOnOverlay = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const id = Symbol('modal');
    modalStack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === 'Tab' && ref.current) {
        // Piège de focus minimal.
        const items = ref.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      modalStack.splice(modalStack.indexOf(id), 1);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => (downOnOverlay.current = e.target === e.currentTarget)}
      onMouseUp={(e) => {
        if (downOnOverlay.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className={`modal ${size ? `modal--${size}` : ''} ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {title && (
          <div className="modal-header">
            <h2 className="modal-title" id={labelledBy}>
              {title}
            </h2>
            <Button variant="ghost" icon size="sm" onClick={onClose} aria-label="Fermer">
              <X size={16} />
            </Button>
          </div>
        )}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------- Empty state ------------------------------- */

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div className="empty-title">{title}</div>
      {children}
    </div>
  );
}
