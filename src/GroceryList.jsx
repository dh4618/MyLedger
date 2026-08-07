import React, { useEffect, useRef, useState } from 'react';
import { X, Plus, Check, ShoppingCart, Trash2 } from 'lucide-react';
import { useLang } from './i18n/LanguageProvider';
import { suggestionsFor } from './groceries';

// The standing shopping list. Deliberately has nothing to do with days, goals or
// progress — see src/groceries.js for why it is stored on its own.
export default function GroceryList({ list, onAdd, onToggle, onRemove, onClearBought, onClose }) {
  const { t } = useLang();
  const [draft, setDraft] = useState('');
  // The row to highlight after an add, which is how re-adding something already on the
  // list says "it's already there" rather than appearing to do nothing.
  const [flashId, setFlashId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!flashId) return undefined;
    const handle = setTimeout(() => setFlashId(null), 900);
    return () => clearTimeout(handle);
  }, [flashId]);

  const outstanding = list.items.filter((x) => !x.bought);
  const bought = list.items.filter((x) => x.bought);
  const suggestions = suggestionsFor(list);

  const submit = (name) => {
    const id = onAdd(name);
    if (!id) return;
    setDraft('');
    setFlashId(id);
    // Keep the keyboard up: several items usually go in at once.
    if (inputRef.current) inputRef.current.focus();
  };

  const row = (item) => (
    <div key={item.id} className={`dt-grocery-row ${flashId === item.id ? 'flash' : ''}`}>
      <div className={`dt-checkbox ${item.bought ? 'checked' : ''}`} onClick={() => onToggle(item.id)}>
        {item.bought && <Check size={13} color="currentColor" strokeWidth={3} />}
      </div>
      <div
        className={`dt-grocery-name ${item.bought ? 'done' : ''}`}
        onClick={() => onToggle(item.id)}
      >{item.name}</div>
      {/* No confirm: it's an item on a shopping list, not a record of anything. */}
      <button className="dt-icon-btn" title={t('grocery.remove')} onClick={() => onRemove(item.id)}>
        <Trash2 size={15} />
      </button>
    </div>
  );

  return (
    <div className="dt-manage-panel" onClick={onClose}>
      <div className="dt-manage-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dt-modal-title">
          <span className="dt-grocery-title">
            <ShoppingCart size={18} /> {t('grocery.title')}
          </span>
          <button className="dt-icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {suggestions.length > 0 && (
          <>
            <div className="dt-section-label" style={{ margin: '0 0 8px' }}>{t('grocery.buyAgain')}</div>
            <div className="dt-grocery-chips">
              {suggestions.map((name) => (
                <button key={name} className="dt-preset-btn" onClick={() => submit(name)}>
                  <Plus size={12} /> {name}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Not autofocused: at the shop you are ticking things off, and a keyboard
            covering the list is worse than one extra tap when you do want to type. */}
        <div className="dt-grocery-add">
          <input
            ref={inputRef}
            className="dt-input"
            placeholder={t('grocery.addPlaceholder')}
            value={draft}
            enterKeyHint="done"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(draft); }}
          />
          <button className="dt-grocery-add-btn" title={t('grocery.add')} onClick={() => submit(draft)}>
            <Plus size={20} />
          </button>
        </div>

        {list.items.length === 0 && (
          <div className="dt-empty-manage" style={{ padding: '18px 0 6px' }}>{t('grocery.empty')}</div>
        )}

        {outstanding.map(row)}

        {bought.length > 0 && (
          <>
            <div className="dt-section-label dt-grocery-divider">
              {t('grocery.boughtSection', { n: bought.length })}
            </div>
            {bought.map(row)}
            <button className="dt-preset-btn" style={{ width: '100%', marginTop: 14, padding: '10px' }} onClick={onClearBought}>
              <Trash2 size={14} /> {t('grocery.clearBought', { n: bought.length })}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
