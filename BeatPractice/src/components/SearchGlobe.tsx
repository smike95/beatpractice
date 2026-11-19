/**
 * A small turning globe: the picture shown while the song is being looked up on the internet. Two meridians narrow and widen in turn,
 * which looks like the globe turning around its axis. The turning is stopped when the system asks for less motion (index.css).
 */
export function SearchGlobe({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="19" />
      <path d="M5.5 24h37" />
      <path d="M8.5 14.5h31" />
      <path d="M8.5 33.5h31" />
      <ellipse className="globe-meridian" cx="24" cy="24" rx="9" ry="19" />
      <ellipse className="globe-meridian globe-meridian-2" cx="24" cy="24" rx="9" ry="19" />
    </svg>
  );
}
