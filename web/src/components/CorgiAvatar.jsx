import { useId } from "react";
import { resolveAvatar } from "../lib/avatars.js";
import { accessoryLayer } from "./accessories.jsx";

const OUTLINE = "#1F1F1F";
const WHITE = "#FFFFFF";
const EAR_INNER = "#F6BFCB";
const CHEEK = "#F8B8C6";
const STROKE = 10;

const HEAD = { cx: 256, cy: 195, r: 108 };
const TORSO = { cx: 256, cy: 386, rx: 114, ry: 90 };

// Every coat is drawn on this same skeleton; only fills change. Keep shapes
// identical across avatars so shop accessories line up (see lib/avatars.js).
// Pass label="" when the avatar sits next to the kid's name (decorative).
// accessories: equipped shop item ids (see components/accessories.jsx).
export default function CorgiAvatar({
  avatarId,
  label,
  className,
  accessories,
}) {
  const { coat, label: coatLabel } = resolveAvatar(avatarId);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const headClip = `corgi-head-${uid}`;
  const torsoClip = `corgi-torso-${uid}`;
  const earColor = coat.saddle ?? coat.main;
  const ctx = { torsoClip };

  return (
    <svg
      viewBox="0 0 512 512"
      {...(label === ""
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label ?? `${coatLabel} corgi` })}
      className={className}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <defs>
        <clipPath id={headClip}>
          <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} />
        </clipPath>
        <clipPath id={torsoClip}>
          <ellipse cx={TORSO.cx} cy={TORSO.cy} rx={TORSO.rx} ry={TORSO.ry} />
        </clipPath>
      </defs>

      {accessoryLayer(accessories, "back", ctx)}

      <g data-layer="tail">
        <ellipse
          cx="402"
          cy="440"
          rx="38"
          ry="22"
          transform="rotate(-25 402 440)"
          fill={coat.main}
          stroke={OUTLINE}
          strokeWidth={STROKE}
        />
      </g>

      <g
        data-layer="haunches"
        fill={coat.main}
        stroke={OUTLINE}
        strokeWidth={STROKE}
      >
        <ellipse cx="164" cy="438" rx="64" ry="40" />
        <ellipse cx="348" cy="438" rx="64" ry="40" />
      </g>

      <g data-layer="torso">
        <ellipse
          cx={TORSO.cx}
          cy={TORSO.cy}
          rx={TORSO.rx}
          ry={TORSO.ry}
          fill={coat.main}
        />
        <g clipPath={`url(#${torsoClip})`}>
          {coat.saddle && (
            <ellipse cx="256" cy="304" rx="140" ry="44" fill={coat.saddle} />
          )}
          {coat.patches && (
            <g fill={coat.patches}>
              <ellipse cx="182" cy="356" rx="22" ry="17" />
              <ellipse cx="336" cy="410" rx="24" ry="18" />
            </g>
          )}
          <ellipse cx="256" cy="380" rx="60" ry="86" fill={WHITE} />
        </g>
        <ellipse
          cx={TORSO.cx}
          cy={TORSO.cy}
          rx={TORSO.rx}
          ry={TORSO.ry}
          fill="none"
          stroke={OUTLINE}
          strokeWidth={STROKE}
        />
      </g>

      {accessoryLayer(accessories, "outfit", ctx)}

      <g data-layer="front-legs">
        <rect x="206" y="392" width="40" height="74" fill={coat.legs} />
        <rect x="266" y="392" width="40" height="74" fill={coat.legs} />
        <path
          d="M206 396 V462 M246 396 V462 M266 396 V462 M306 396 V462"
          fill="none"
          stroke={OUTLINE}
          strokeWidth={STROKE}
        />
        <g fill={WHITE} stroke={OUTLINE} strokeWidth={STROKE}>
          <ellipse cx="224" cy="468" rx="30" ry="17" />
          <ellipse cx="288" cy="468" rx="30" ry="17" />
        </g>
      </g>

      <g data-layer="ears">
        <g fill={earColor} stroke={OUTLINE} strokeWidth={STROKE}>
          <path d="M160 160 Q128 70 150 24 Q204 48 246 104 Z" />
          <path d="M352 160 Q384 70 362 24 Q308 48 266 104 Z" />
        </g>
        <g fill={EAR_INNER}>
          <path d="M174 136 Q154 82 162 54 Q198 76 226 108 Z" />
          <path d="M338 136 Q358 82 350 54 Q314 76 286 108 Z" />
        </g>
      </g>

      <g data-layer="head">
        <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} fill={coat.main} />
        <g clipPath={`url(#${headClip})`}>
          {coat.saddle && (
            <ellipse cx="256" cy="98" rx="130" ry="62" fill={coat.saddle} />
          )}
          {coat.patches && (
            <g fill={coat.patches}>
              <ellipse cx="196" cy="116" rx="24" ry="16" />
              <ellipse cx="352" cy="214" rx="16" ry="24" />
            </g>
          )}
          <path
            d="M242 80 L270 80 L278 172 C328 186 338 256 304 292 L208 292 C174 256 184 186 234 172 Z"
            fill={WHITE}
          />
        </g>
        <circle
          cx={HEAD.cx}
          cy={HEAD.cy}
          r={HEAD.r}
          fill="none"
          stroke={OUTLINE}
          strokeWidth={STROKE}
        />
      </g>

      <g data-layer="face">
        {coat.brows && (
          <g fill={coat.brows}>
            <ellipse cx="214" cy="158" rx="12" ry="8" />
            <ellipse cx="298" cy="158" rx="12" ry="8" />
          </g>
        )}
        <g fill={CHEEK} opacity="0.85">
          <circle cx="194" cy="230" r="18" />
          <circle cx="318" cy="230" r="18" />
        </g>
        <g fill={OUTLINE}>
          <circle cx="216" cy="192" r="20" />
          <circle cx="296" cy="192" r="20" />
        </g>
        <g fill={WHITE}>
          <circle cx="222" cy="185" r="6.5" />
          <circle cx="302" cy="185" r="6.5" />
        </g>
        <path
          d="M238 216 Q256 208 274 216 Q272 232 256 238 Q240 232 238 216 Z"
          fill={OUTLINE}
        />
        <path
          d="M226 248 Q241 264 256 248 Q271 264 286 248"
          fill="none"
          stroke={OUTLINE}
          strokeWidth="7"
        />
      </g>

      {accessoryLayer(accessories, "neck", ctx)}
      {accessoryLayer(accessories, "eyes", ctx)}
      {accessoryLayer(accessories, "hat", ctx)}
    </svg>
  );
}
