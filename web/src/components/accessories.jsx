// Drawings for the avatar shop's items, keyed by catalog id. The ids, slots,
// names and prices live in api/src/shopCatalog.ts (the server is the source of
// truth for prices); keep this list in sync with it.
//
// Every drawing targets CorgiAvatar's shared 512×512 skeleton (see
// ACCESSORY_ANCHORS in lib/avatars.js), so one drawing fits all coats. Each
// item supplies fragments for one or more layers, which CorgiAvatar draws at
// fixed points in its stack:
//   back   – behind the whole dog (capes)
//   outfit – over the torso, under the front legs
//   neck   – under the chin, over the head
//   eyes   – over the face
//   hat    – on top of everything
// Each fragment gets ctx = { torsoClip } (a clipPath id for the torso shape).

const OUTLINE = "#1F1F1F";
const S = 8; // outline width for accessories (the dog uses 10)

function starPath(cx, cy, outer, inner, points = 5) {
  const step = Math.PI / points;
  let d = "";
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + i * step;
    d += `${i === 0 ? "M" : "L"}${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)} `;
  }
  return `${d}Z`;
}

const TORSO_OUTLINE = (
  <ellipse
    cx="256"
    cy="386"
    rx="114"
    ry="90"
    fill="none"
    stroke={OUTLINE}
    strokeWidth="10"
  />
);

// A top covering the torso from the shoulders down to `hem` (y), in `color`.
function top(ctx, color, hem, children) {
  return (
    <>
      <g clipPath={`url(#${ctx.torsoClip})`}>
        <rect x="130" y="280" width="252" height={hem - 280} fill={color} />
        {children}
        {hem < 476 && (
          <line
            x1="130"
            y1={hem}
            x2="382"
            y2={hem}
            stroke={OUTLINE}
            strokeWidth={S}
          />
        )}
      </g>
      {TORSO_OUTLINE}
    </>
  );
}

export const ACCESSORIES = {
  // ── Hats ──────────────────────────────────────────────────────────────
  "party-hat": {
    slot: "hat",
    hat: () => (
      <g stroke={OUTLINE} strokeWidth={S}>
        <path d="M204 108 L256 28 L308 108 Q256 124 204 108 Z" fill="#5BB5E8" />
        <g stroke="none" fill="#FFD54A">
          <circle cx="240" cy="92" r="7" />
          <circle cx="270" cy="70" r="6" />
          <circle cx="252" cy="54" r="5" />
          <circle cx="282" cy="100" r="6" />
        </g>
        <circle cx="256" cy="24" r="14" fill="#F26CA7" />
      </g>
    ),
  },
  "baseball-cap": {
    slot: "hat",
    hat: () => (
      <g stroke={OUTLINE} strokeWidth={S}>
        <path d="M164 136 C164 52 348 52 348 136 Z" fill="#E04848" />
        <path d="M148 136 Q256 166 364 136 Q256 120 148 136 Z" fill="#B83232" />
        <path d="M256 60 V132" fill="none" strokeWidth="4" />
        <circle cx="256" cy="62" r="9" fill="#B83232" />
      </g>
    ),
  },
  beanie: {
    slot: "hat",
    hat: () => (
      <g stroke={OUTLINE} strokeWidth={S}>
        <path d="M168 128 C168 50 344 50 344 128 Z" fill="#3FA7A0" />
        <rect x="158" y="118" width="196" height="32" rx="14" fill="#2C7F79" />
        <g stroke="#1F5F5A" strokeWidth="4">
          {[184, 210, 236, 262, 288, 314].map((x) => (
            <line key={x} x1={x + 8} y1="126" x2={x + 8} y2="142" />
          ))}
        </g>
        <circle cx="256" cy="48" r="20" fill="#F4F1EA" />
      </g>
    ),
  },
  "wizard-hat": {
    slot: "hat",
    hat: () => (
      <g stroke={OUTLINE} strokeWidth={S}>
        <path d="M194 116 Q236 66 274 10 Q298 72 318 116 Z" fill="#6A4FC4" />
        <ellipse cx="256" cy="118" rx="104" ry="18" fill="#563BAE" />
        <g stroke="none" fill="#FFD54A">
          <path d={starPath(248, 84, 12, 5)} />
          <path d={starPath(282, 56, 8, 3.5)} />
          <circle cx="224" cy="104" r="4" />
        </g>
      </g>
    ),
  },
  crown: {
    slot: "hat",
    hat: () => (
      <g stroke={OUTLINE} strokeWidth={S}>
        <path
          d="M188 130 L188 70 L222 100 L256 56 L290 100 L324 70 L324 130 Z"
          fill="#F5C542"
        />
        <g strokeWidth="5">
          <circle cx="188" cy="66" r="8" fill="#F5C542" />
          <circle cx="256" cy="52" r="8" fill="#F5C542" />
          <circle cx="324" cy="66" r="8" fill="#F5C542" />
          <circle cx="256" cy="112" r="10" fill="#E04848" />
          <circle cx="216" cy="116" r="7" fill="#4A8FE0" />
          <circle cx="296" cy="116" r="7" fill="#4A8FE0" />
        </g>
      </g>
    ),
  },

  // ── Glasses ───────────────────────────────────────────────────────────
  "round-glasses": {
    slot: "eyes",
    eyes: () => (
      <g stroke={OUTLINE} strokeWidth="7" fill="none">
        <circle cx="216" cy="192" r="32" fill="#FFFFFF" fillOpacity="0.25" />
        <circle cx="296" cy="192" r="32" fill="#FFFFFF" fillOpacity="0.25" />
        <path d="M248 190 Q256 180 264 190" />
        <path d="M184 186 L152 176 M328 186 L360 176" />
      </g>
    ),
  },
  sunglasses: {
    slot: "eyes",
    eyes: () => (
      <g stroke={OUTLINE} strokeWidth="7">
        <rect x="174" y="168" width="78" height="48" rx="16" fill="#1F1F1F" />
        <rect x="260" y="168" width="78" height="48" rx="16" fill="#1F1F1F" />
        <path d="M252 182 H260" fill="none" />
        <path d="M174 180 L152 172 M338 180 L360 172" fill="none" />
        <g stroke="#FFFFFF" strokeOpacity="0.7" strokeWidth="5" fill="none">
          <path d="M190 202 L208 180" />
          <path d="M276 202 L294 180" />
        </g>
      </g>
    ),
  },
  "star-glasses": {
    slot: "eyes",
    eyes: () => (
      <g stroke={OUTLINE} strokeWidth="6">
        <path
          d={starPath(216, 194, 42, 22)}
          fill="#F26CA7"
          fillOpacity="0.55"
        />
        <path
          d={starPath(296, 194, 42, 22)}
          fill="#F26CA7"
          fillOpacity="0.55"
        />
        <path d="M240 190 Q256 180 272 190" fill="none" />
      </g>
    ),
  },

  // ── Neck ──────────────────────────────────────────────────────────────
  "red-collar": {
    slot: "neck",
    neck: () => (
      <g stroke={OUTLINE} strokeWidth={S}>
        <path
          d="M176 282 Q256 322 336 282 L340 302 Q256 346 172 302 Z"
          fill="#D64545"
        />
        <circle cx="256" cy="336" r="13" fill="#F5C542" />
      </g>
    ),
  },
  bandana: {
    slot: "neck",
    neck: () => (
      <g stroke={OUTLINE} strokeWidth={S}>
        <path d="M172 286 Q256 318 340 286 L256 380 Z" fill="#D64545" />
        <g stroke="none" fill="#FFFFFF">
          <circle cx="226" cy="318" r="5" />
          <circle cx="256" cy="330" r="5" />
          <circle cx="286" cy="318" r="5" />
          <circle cx="244" cy="352" r="4" />
          <circle cx="268" cy="352" r="4" />
        </g>
      </g>
    ),
  },
  "bow-tie": {
    slot: "neck",
    neck: () => (
      <g stroke={OUTLINE} strokeWidth={S}>
        <path d="M256 314 L208 290 L208 338 Z" fill="#3B6FD4" />
        <path d="M256 314 L304 290 L304 338 Z" fill="#3B6FD4" />
        <rect x="242" y="300" width="28" height="28" rx="8" fill="#2D56A8" />
      </g>
    ),
  },
  flower: {
    slot: "neck",
    neck: () => (
      <g stroke={OUTLINE} strokeWidth="5">
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <ellipse
            key={deg}
            cx="312"
            cy="282"
            rx="12"
            ry="20"
            transform={`rotate(${deg} 312 304)`}
            fill="#F7A8C4"
          />
        ))}
        <circle cx="312" cy="304" r="12" fill="#FFD54A" />
      </g>
    ),
  },

  // ── Outfits ───────────────────────────────────────────────────────────
  "t-shirt": {
    slot: "outfit",
    outfit: (ctx) =>
      top(
        ctx,
        "#4CAF7A",
        436,
        <>
          <path d={starPath(256, 344, 22, 10)} fill="#FFFFFF" />
        </>,
      ),
  },
  sweater: {
    slot: "outfit",
    outfit: (ctx) =>
      top(
        ctx,
        "#C0504D",
        476,
        <>
          <g fill="#F4E3C1">
            <rect x="130" y="330" width="252" height="12" />
            <rect x="130" y="366" width="252" height="12" />
          </g>
          <path
            d="M150 336 H362"
            stroke="#C0504D"
            strokeWidth="4"
            strokeDasharray="6 8"
          />
        </>,
      ),
  },
  raincoat: {
    slot: "outfit",
    outfit: (ctx) =>
      top(
        ctx,
        "#F4C430",
        476,
        <>
          <line
            x1="256"
            y1="296"
            x2="256"
            y2="476"
            stroke={OUTLINE}
            strokeWidth="5"
          />
          <g fill={OUTLINE}>
            <circle cx="240" cy="330" r="6" />
            <circle cx="240" cy="366" r="6" />
          </g>
          <path
            d="M168 400 H196 M316 400 H344"
            stroke={OUTLINE}
            strokeWidth="5"
          />
        </>,
      ),
  },
  "superhero-cape": {
    slot: "outfit",
    back: () => (
      <path
        d="M176 286 Q90 380 66 482 Q256 508 446 482 Q422 380 336 286 Z"
        fill="#D63A3A"
        stroke={OUTLINE}
        strokeWidth={S}
      />
    ),
    neck: () => (
      <g stroke={OUTLINE} strokeWidth="6">
        <path
          d="M184 292 Q256 322 328 292"
          fill="none"
          stroke="#D63A3A"
          strokeWidth="12"
        />
        <circle cx="256" cy="312" r="14" fill="#F5C542" />
        <path d={starPath(256, 312, 8, 3.5)} fill="#D63A3A" stroke="none" />
      </g>
    ),
  },
};

// The equipped items' fragments for one layer, in a stable order.
export function accessoryLayer(itemIds, layer, ctx) {
  if (!itemIds?.length) return null;
  return itemIds
    .filter((id) => ACCESSORIES[id]?.[layer])
    .map((id) => (
      <g key={id} data-accessory={id}>
        {ACCESSORIES[id][layer](ctx)}
      </g>
    ));
}
