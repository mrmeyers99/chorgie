import { useEffect } from "react";

// Per-route title, description and robots directives. index.html ships static
// defaults (for crawlers and link-preview bots that don't run JS); this
// updates those same tags in place rather than adding duplicates, and marks
// private, logged-in pages as noindex.
function setMeta(name, content) {
  let tag = document.head.querySelector(`meta[name="${name}"]`);
  if (content == null) {
    tag?.remove();
    return;
  }
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

const SITE_URL = import.meta.env.VITE_SITE_URL || window.location.origin;

function setCanonical(pathname) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", `${SITE_URL}${pathname}`);
}

export default function PageMeta({ title, description, noindex = false }) {
  useEffect(() => {
    // Titles that already lead with the brand (the landing page) aren't suffixed.
    document.title = !title
      ? "Chorgie"
      : title.startsWith("Chorgie")
        ? title
        : `${title} · Chorgie`;
    if (description) setMeta("description", description);
    setMeta("robots", noindex ? "noindex, nofollow" : null);
    setCanonical(window.location.pathname);
  }, [title, description, noindex]);
  return null;
}
