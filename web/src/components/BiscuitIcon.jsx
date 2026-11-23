const OUTLINE = "#1F1F1F";
const BISCUIT = "#D9A35B";
const HIGHLIGHT = "#EBC285";
const HOLE = "#9C6A2F";

// The bone shape: one bar plus two round lobes at each end.
const LOBES = [
  [20, 18],
  [20, 42],
  [100, 18],
  [100, 42],
];

function BoneShape(props) {
  return (
    <g {...props}>
      <rect x="20" y="16" width="80" height="28" />
      {LOBES.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="14" />
      ))}
    </g>
  );
}

// Bone-shaped dog biscuit, in the same flat, thick-outlined style as
// CorgiAvatar. Sized by CSS (defaults to 1em tall so it sits inline with text).
// Pass label="" when it sits next to a visible number like "10" (decorative).
export default function BiscuitIcon({ label = "biscuits", className }) {
  return (
    <svg
      viewBox="-2 -2 124 64"
      className={className}
      style={className ? undefined : { height: "1em", width: "2em" }}
      {...(label === ""
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
    >
      {/* Draw the bone twice: a fat dark copy underneath becomes the outline
          around the merged shape, then the fill on top hides the inner seams. */}
      <BoneShape fill={OUTLINE} stroke={OUTLINE} strokeWidth="8" />
      <BoneShape fill={BISCUIT} />
      <rect x="26" y="20" width="62" height="5" rx="2.5" fill={HIGHLIGHT} />
      <g fill={HOLE}>
        <circle cx="42" cy="34" r="3" />
        <circle cx="60" cy="30" r="3" />
        <circle cx="78" cy="34" r="3" />
      </g>
    </svg>
  );
}
