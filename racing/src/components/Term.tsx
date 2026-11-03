import type { ReactNode } from 'react';
import { GLOSSARY, type GlossaryKey } from '../glossary';

/** A term with a plain-English explanation on hover / keyboard focus / tap. */
export function Term({ k, text, children }: { k?: GlossaryKey; text?: string; children: ReactNode }) {
  const tip = text ?? (k ? GLOSSARY[k] : '');
  return (
    <span className="term" tabIndex={0} data-tip={tip} aria-label={`${typeof children === 'string' ? children : ''}: ${tip}`}>
      {children}
    </span>
  );
}
