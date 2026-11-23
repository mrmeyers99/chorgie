import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { safeDecryptField } from "../lib/crypto.js";
import { requireHouseholdKey } from "../lib/keyStore.js";
import CorgiAvatar from "../components/CorgiAvatar.jsx";
import BiscuitIcon from "../components/BiscuitIcon.jsx";
import styles from "./Shop.module.css";

const SLOT_TITLES = {
  hat: "Hats",
  eyes: "Glasses",
  neck: "Neck",
  outfit: "Outfits",
};

// What the big corgi shows: what the kid is wearing, with the previewed item
// swapped into its slot.
function withPreview(wearingIds, catalog, previewId) {
  const preview = catalog.find((item) => item.id === previewId);
  if (!preview) return wearingIds;
  const slotOf = (id) => catalog.find((item) => item.id === id)?.slot;
  return [
    ...wearingIds.filter((id) => slotOf(id) !== preview.slot),
    preview.id,
  ];
}

export default function Shop() {
  const navigate = useNavigate();
  const { kidId } = useParams();
  const userEmail = sessionStorage.getItem("userEmail");

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [kid, setKid] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [biscuits, setBiscuits] = useState(0);
  const [owned, setOwned] = useState([]);
  const [previewId, setPreviewId] = useState("");
  const [busyItemId, setBusyItemId] = useState("");

  useEffect(() => {
    if (!userEmail) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const hek = await requireHouseholdKey();
        if (!hek || cancelled) return;
        const [kidsData, catalogData, shopData] = await Promise.all([
          api.getKids(),
          api.getShopCatalog(),
          api.getKidShop(kidId),
        ]);
        const found = (kidsData.kids ?? []).find(
          (k) => k.id === kidId && k.is_active !== false,
        );
        if (!found) {
          if (!cancelled) setStatus("Couldn't find that kid.");
          return;
        }
        const name = await safeDecryptField(hek, found.enc_display_name);
        if (cancelled) return;
        setKid({ ...found, enc_display_name: name });
        setCatalog(catalogData.items ?? []);
        setBiscuits(shopData.biscuits ?? 0);
        setOwned(shopData.items ?? []);
      } catch (err) {
        if (!cancelled) setStatus(err.message ?? "Failed to load the shop.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [kidId, navigate, userEmail]);

  const ownedById = new Map(owned.map((item) => [item.item_id, item]));
  const wearingIds = owned
    .filter((item) => item.equipped)
    .map((item) => item.item_id);
  const previewItem = catalog.find((item) => item.id === previewId);

  function applyShopState(data) {
    setBiscuits(data.biscuits ?? 0);
    setOwned(data.items ?? []);
  }

  async function handleBuy(item) {
    setStatus("");
    setBusyItemId(item.id);
    try {
      applyShopState(await api.buyShopItem(kidId, item.id));
      setPreviewId("");
      setStatus(`You got the ${item.name}!`);
    } catch (err) {
      setStatus(err.message ?? "Couldn't buy that.");
    } finally {
      setBusyItemId("");
    }
  }

  async function handleWear(item, equipped) {
    setStatus("");
    setBusyItemId(item.id);
    try {
      applyShopState(await api.setShopItemEquipped(kidId, item.id, equipped));
      setPreviewId("");
    } catch (err) {
      setStatus(err.message ?? "Couldn't change that.");
    } finally {
      setBusyItemId("");
    }
  }

  function renderAction(item) {
    const mine = ownedById.get(item.id);
    const busy = busyItemId === item.id;
    if (mine) {
      return mine.equipped ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSecondary}`}
          onClick={() => void handleWear(item, false)}
          disabled={busy}
        >
          Take off
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => void handleWear(item, true)}
          disabled={busy}
        >
          Wear
        </button>
      );
    }
    const short = item.price - biscuits;
    return (
      <button
        type="button"
        className={`${styles.btn} ${styles.btnPrimary}`}
        onClick={() => void handleBuy(item)}
        disabled={busy || short > 0}
      >
        {short > 0 ? `Need ${short} more` : busy ? "Buying…" : "Buy"}
      </button>
    );
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <p className={styles.emptyState}>Loading the shop…</p>
      </main>
    );
  }

  if (!kid) {
    return (
      <main className={styles.page}>
        <p className={styles.emptyState}>{status || "Shop unavailable."}</p>
        <Link to="/" className={`${styles.btn} ${styles.btnSecondary}`}>
          Back home
        </Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <Link to="/" className={`${styles.btn} ${styles.btnGhost}`}>
          ← Back
        </Link>
      </div>

      <section className={styles.hero}>
        <CorgiAvatar
          avatarId={kid.avatar_id}
          accessories={withPreview(wearingIds, catalog, previewId)}
          label={`${kid.enc_display_name}'s avatar`}
          className={styles.heroAvatar}
        />
        <div className={styles.heroInfo}>
          <h1 className={styles.title}>{kid.enc_display_name}'s Shop</h1>
          <p className={styles.biscuitCount}>
            <BiscuitIcon label="" /> {biscuits}{" "}
            <span className={styles.biscuitWord}>
              biscuit{biscuits === 1 ? "" : "s"}
            </span>
          </p>
          {previewItem ? (
            <div className={styles.previewBox}>
              <p className={styles.previewText}>
                Trying on: <strong>{previewItem.name}</strong>
              </p>
              <div className={styles.previewActions}>
                {renderAction(previewItem)}
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => setPreviewId("")}
                >
                  Stop trying on
                </button>
              </div>
            </div>
          ) : (
            <p className={styles.hint}>Tap anything to try it on!</p>
          )}
        </div>
      </section>

      {status ? (
        <p role="status" className={styles.statusMsg}>
          {status}
        </p>
      ) : null}

      {Object.entries(SLOT_TITLES).map(([slot, title]) => {
        const items = catalog.filter((item) => item.slot === slot);
        if (items.length === 0) return null;
        return (
          <section key={slot} className={styles.slotSection}>
            <h2 className={styles.slotTitle}>{title}</h2>
            <ul className={styles.itemGrid}>
              {items.map((item) => {
                const mine = ownedById.get(item.id);
                return (
                  <li
                    key={item.id}
                    className={`${styles.itemCard}${previewId === item.id ? ` ${styles.itemCardActive}` : ""}`}
                  >
                    <button
                      type="button"
                      className={styles.itemPreviewBtn}
                      onClick={() =>
                        setPreviewId(previewId === item.id ? "" : item.id)
                      }
                      aria-pressed={previewId === item.id}
                      aria-label={`Try on ${item.name}`}
                    >
                      <CorgiAvatar
                        avatarId={kid.avatar_id}
                        accessories={[item.id]}
                        label=""
                        className={styles.itemAvatar}
                      />
                    </button>
                    <span className={styles.itemName}>{item.name}</span>
                    {mine ? (
                      <span className={styles.ownedBadge}>
                        {mine.equipped ? "Wearing" : "Yours"}
                      </span>
                    ) : (
                      <span className={styles.itemPrice}>
                        <BiscuitIcon label="" /> {item.price}
                      </span>
                    )}
                    {renderAction(item)}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
