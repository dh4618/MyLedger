/** A simple two-colour silks swatch (real silks images need a licensed source). */
export function Silks({ colours }: { colours?: [string, string] }) {
  const [a, b] = colours ?? ['#9aa0a6', '#d0d4d8'];
  return (
    <span className="silks" aria-hidden="true" style={{ background: `linear-gradient(135deg, ${a} 0 55%, ${b} 55% 100%)` }} />
  );
}
