import { useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { normalizeSearch } from '@/core/domain/text';

/** Saisie de tags : Entrée, virgule ou Tab pour valider, Retour arrière pour retirer, suggestions. */
export function TagInput({
  value,
  onChange,
  suggestions,
  placeholder = 'Ajouter un tag…',
  id,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = normalizeSearch(draft);
    const taken = new Set(value.map((v) => v.toLowerCase()));
    return suggestions
      .filter((s) => !taken.has(s.toLowerCase()) && (!q || normalizeSearch(s).includes(q)))
      .slice(0, 8);
  }, [draft, suggestions, value]);

  const add = (raw: string) => {
    const tag = raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    if (tag && !value.some((v) => v.toLowerCase() === tag.toLowerCase())) onChange([...value, tag]);
    setDraft('');
    setActive(0);
  };

  const showSuggestions = focused && matches.length > 0 && (draft.length > 0 || value.length === 0);

  return (
    <div className="tag-input" onClick={() => inputRef.current?.focus()}>
      {value.map((t) => (
        <span key={t} className="chip chip--primary">
          {t}
          <button type="button" aria-label={`Retirer ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        id={id}
        ref={inputRef}
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (draft.trim()) add(draft);
        }}
        onChange={(e) => {
          if (e.target.value.endsWith(',')) add(e.target.value.slice(0, -1));
          else {
            setDraft(e.target.value);
            setActive(0);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            if (draft.trim() || showSuggestions) {
              e.preventDefault();
              add(showSuggestions && draft && matches[active] ? matches[active] : draft);
            }
          } else if (e.key === 'Tab' && draft.trim()) {
            e.preventDefault();
            add(showSuggestions && matches[active] ? matches[active] : draft);
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          } else if (e.key === 'ArrowDown' && showSuggestions) {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === 'ArrowUp' && showSuggestions) {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          }
        }}
      />
      {showSuggestions && (
        <div className="suggestions">
          {matches.map((m, i) => (
            <button
              key={m}
              type="button"
              className={`suggestion ${i === active ? 'suggestion--active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                add(m);
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
