// Numeric PIN input that browsers and password managers won't treat as a
// password. A `type="password"` field makes the browser offer to save or
// "update" the site's login with the PIN — clobbering the real account
// password — and `autoComplete="off"` is ignored for password fields. So this
// renders a plain text field masked with `-webkit-text-security` (supported
// by Chromium, Safari and Firefox) and opts out of the common third-party
// password managers via their ignore attributes.
const maskStyle = { WebkitTextSecurity: "disc" };

export default function PinInput({ style, ...props }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]{4,8}"
      minLength={4}
      maxLength={8}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-1p-ignore="true"
      data-lpignore="true"
      data-bwignore="true"
      data-form-type="other"
      style={{ ...maskStyle, ...style }}
      {...props}
    />
  );
}
