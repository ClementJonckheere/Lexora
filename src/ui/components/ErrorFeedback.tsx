import type { AnswerFeedback } from '@/core/domain/errorKind';

/** Retour par type d'erreur (src/core/domain/errorKind.ts) : ce qui ne va pas, puis une explication courte. */
export function ErrorFeedback({ feedback, extra }: { feedback: AnswerFeedback | null; extra?: string | null }) {
  if (!feedback) return null;
  return (
    <div className={`error-feedback error-feedback--${feedback.kind}`} role="note">
      <div className="error-feedback-message">{feedback.message}</div>
      <div className="error-feedback-tip">{feedback.tip}</div>
      {extra && <div className="error-feedback-tip">{extra}</div>}
    </div>
  );
}
