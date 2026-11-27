import React from 'react';
import { useLang } from './i18n/LanguageProvider';
import Pixel from './Pixel';
import { MYSTERY_EGG, PIXEL_STAR, PIXEL_STAR_SMALL } from './pixels';
import { stars, EGG_PRICE } from './game';

// What stars are for. It was a section at the bottom of the Pet tab, below the room,
// the slot and the collection — which put the one thing you spend stars on furthest
// from the counter that shows them. It is its own tab now, and tapping that counter
// is how you get here.
//
// The balance is shown large at the top rather than only in the header: this is the
// page where the number is the point, and the header's copy is a glance.
export default function StorePanel({ game, total, onBuy }) {
  const { t } = useLang();
  const { balance } = stars(game, total);
  const canBuy = balance >= EGG_PRICE;

  return (
    <div className="dt-page">
      <div className="dt-stars">
        <Pixel sprite={PIXEL_STAR} size={18} />
        <span className="dt-stars-count">{balance}</span>
        <span className="dt-stars-label">{t('game.starsLabel')}</span>
      </div>
      <div className="dt-hint" style={{ marginTop: 0 }}>{t('game.starsHint')}</div>

      <div className="dt-field-label" style={{ marginTop: 20 }}>{t('game.store')}</div>
      <div className="dt-shop-card">
        <Pixel sprite={MYSTERY_EGG} size={56} label={t('game.mysteryEgg')} className="dt-mystery" />
        <div className="dt-shop-body">
          <div className="dt-raise-name">{t('game.mysteryEgg')}</div>
        </div>
        <button className="dt-buy-btn" disabled={!canBuy} onClick={onBuy}>
          <Pixel sprite={PIXEL_STAR_SMALL} size={14} /> {EGG_PRICE}
        </button>
      </div>
      {!canBuy && (
        <div className="dt-hint" style={{ marginTop: 6 }}>
          {t('game.needMore', { n: EGG_PRICE - balance })}
        </div>
      )}
      {/* Where a bought egg goes, since it does not appear on this page. */}
      <div className="dt-hint" style={{ marginTop: 14 }}>{t('game.storeHint')}</div>
    </div>
  );
}
