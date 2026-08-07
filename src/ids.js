// Time-ordered enough to be readable in stored JSON, random enough not to collide.
// Its own module so both Ledger and the grocery reducers can use it without importing
// each other.
export const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
