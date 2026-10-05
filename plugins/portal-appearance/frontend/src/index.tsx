import { BrandIcon, hasBrandIcon, tabLabel } from "./brands";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { identityApiRef, useApi } from "@backstage/core-plugin-api";
import { Tab, move, orderedTabs, parseOrder } from "./order";

const css = `
[data-acme-native-tabs] { display: none !important; }
.acme-tabs-shell { background:#FFF; color:#292524; padding:8px 16px 0; border-bottom:3px solid #DA1710; }
.acme-tabs-tools { display:flex; justify-content:flex-end; padding:0 0 6px; }
.acme-tabs-shell button { font:inherit; cursor:pointer; border:1px solid #DED8D4; background:#FFF; color:#5B2925; border-radius:6px; padding:5px 10px; }
.acme-tabs-shell button:disabled { opacity:.4; cursor:default; }
.acme-tab-strip { display:flex; gap:6px; align-items:end; overflow-x:auto; padding:4px 3px 0; scrollbar-width:thin; }
.acme-tab-strip a { display:flex; gap:8px; align-items:center; flex-shrink:0; box-sizing:border-box; min-height:44px; padding:12px 16px; border:1px solid #DED8D4; border-bottom:0; border-radius:10px 10px 0 0; background:linear-gradient(#FFF,#F0ECE9); color:#443C38 !important; font-weight:600; text-decoration:none !important; box-shadow:0 -1px 3px #37191412; }
.acme-tab-strip a:hover { background:#FCE9E7; }
.acme-tab-strip a[aria-selected=true] { background:linear-gradient(#E5231C,#C9140E); color:white !important; border-color:#C9140E; min-height:48px; box-shadow:0 -2px 7px #96140C2E; }
.acme-tab-strip a[data-drop=true] { outline:3px dashed #9A170F; outline-offset:-4px; }
.acme-tabs-shell :focus-visible { outline:3px solid #74221D; outline-offset:-3px; }
.acme-tab-strip a[aria-selected=true]:focus-visible { outline-color:white; }
.acme-tabs-editor { padding:12px; margin-bottom:10px; background:#FAF6F4; border:1px solid #E5DCD6; border-radius:8px; }
.acme-tabs-editor p { margin:0 0 10px; font-size:13px; }
.acme-tabs-editor ol { list-style:none; padding:0; margin:8px 0; display:flex; flex-wrap:wrap; gap:8px; }
.acme-tabs-editor li { display:flex; align-items:center; gap:6px; padding:6px; background:white; border:1px solid #DED8D4; border-radius:6px; }
.acme-tabs-editor li span { padding:0 4px; }
.acme-tab-status { font-size:12px; margin-right:10px; align-self:center; }
`;
const icons: Record<string, string> = {
  overview: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
  ci: "M3 12h5m8 0h5M8 8h8v8H8zM3 9v6m18-6v6",
  api: "m8 5-6 7 6 7m8-14 6 7-6 7m-3-15-2 16",
  dependencies: "M12 3v6M4 21v-7h16v7M12 14v7M8 3h8v6H8z",
  docs: "M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h8",
  vault: "M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3M12 14v3",
  jira: "m12 3 9 9-9 9-9-9zM8 12l3 3 5-6",
  security: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6",
  splunk: "m4 6 6 6-6 6m9 0h7",
  infrastructure: "M3 3h18v7H3zM3 14h18v7H3zM6 6h1m-1 11h1M11 6h7m-7 11h7",
  workflows: "M3 3h6v6H3zM15 15h6v6h-6zM6 9v9h9M9 6h9v9",
};
function Icon({ id }: { id: string }) {
  if (hasBrandIcon(id)) return <BrandIcon id={id}/>;
  return (
    <svg
      aria-hidden="true"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={icons[id] || "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"}
      />
    </svg>
  );
}

export function CatalogTabAppearance() {
  const { pathname } = useLocation();
  const identity = useApi(identityApiRef);
  const base = pathname.match(/^\/catalog\/[^/]+\/[^/]+\/[^/]+/)?.[0];
  const [host, setHost] = useState<HTMLElement | null>(null),
    [tabs, setTabs] = useState<Tab[]>([]);
  const [key, setKey] = useState<string>(),
    [order, setOrder] = useState<string[]>([]);
  const [editing, setEditing] = useState(false),
    [message, setMessage] = useState(""),
    [drop, setDrop] = useState("");
  const dragging = useRef<{
    id: string;
    x: number;
    y: number;
    target: string;
    active: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    identity
      .getBackstageIdentity()
      .then((i) => {
        if (active) {
          const k = "acme.tab-order.v1:" + i.userEntityRef;
          setKey(k);
          try {
            setOrder(parseOrder(localStorage.getItem(k)));
          } catch {
            setMessage("Preferences cannot be saved in this browser.");
          }
        }
      })
      .catch(() => setMessage("Sign in to save your tab order."));
    return () => {
      active = false;
    };
  }, [identity]);
  // A narrow adapter reads the shell's actual available routes. React continues to
  // own the original tabs; we never move or remove its nodes. Unmount restores them.
  useEffect(() => {
    if (!base) return;
    let root: HTMLElement | null = null,
      mount: HTMLElement | null = null,
      signature = "";
    const sync = () => {
      const list = document.querySelector<HTMLElement>(
        '[role="tablist"][aria-label="tabs"]:has(> a[data-testid^="header-tab-"])'
      );
      const found = list?.closest<HTMLElement>('[class*="MuiTabs-root"]');
      if (!found || !list) return;
      const items = Array.from(
        list.querySelectorAll<HTMLAnchorElement>(
          'a[data-testid^="header-tab-"]'
        )
      )
        .filter((a) => a.pathname === base || a.pathname.startsWith(base + "/"))
        .map((a) => ({
          id: a.pathname.slice(base.length).replace(/^\//, "") || "overview",
          label: tabLabel(a.pathname.slice(base.length).replace(/^\//, "") || "overview", a.textContent?.trim() || ""),
          href: a.pathname + a.search + a.hash,
        }));
      if (!items.length) return;
      if (root !== found) {
        root?.removeAttribute("data-acme-native-tabs");
        mount?.remove();
        root = found;
        mount = document.createElement("div");
        root.before(mount);
        setHost(mount);
        root.setAttribute("data-acme-native-tabs", "true");
      }
      const next = JSON.stringify(items);
      if (next !== signature) {
        signature = next;
        setTabs(items);
      }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => {
      observer.disconnect();
      root?.removeAttribute("data-acme-native-tabs");
      mount?.remove();
      setHost(null);
      setTabs([]);
    };
  }, [base]);
  const arranged = orderedTabs(tabs, order);
  useEffect(() => {
    strip.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname, host, tabs]);
  function save(next: string[], notice: string) {
    setOrder(next);
    setMessage(notice);
    if (key)
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        setMessage(
          "Order changed for this session; browser storage is unavailable."
        );
      }
  }
  function reorder(from: string, to: string) {
    const current = arranged.map((t) => t.id);
    const next = move(current, from, to);
    if (next !== current)
      save(
        [...next, ...order.filter((id) => !current.includes(id))],
        "Tab order saved in this browser."
      );
    setDrop("");
  }
  if (!base || !host) return null;
  return createPortal(
    <section className="acme-tabs-shell" aria-label="Application navigation">
      <style>{css}</style>
      <div className="acme-tabs-tools">
        <span className="acme-tab-status" role="status">
          {message}
        </span>
        <button aria-expanded={editing} onClick={() => setEditing(!editing)}>
          Customize tabs
        </button>
      </div>
      {editing && (
        <div className="acme-tabs-editor">
          <p>
            Drag a tab to reorder it, or use the move buttons below. On a
            focused tab, Ctrl+Shift+Left/Right also moves it. Your order is
            saved for your account in this browser.
          </p>
          <button onClick={() => save([], "Default tab order restored.")}>
            Reset to default
          </button>
          <ol>
            {arranged.map((t, i) => (
              <li key={t.id}>
                <span>{t.label}</span>
                <button
                  disabled={i === 0}
                  aria-label={`Move ${t.label} left`}
                  onClick={() => reorder(t.id, arranged[i - 1].id)}
                >
                  ←
                </button>
                <button
                  disabled={i === arranged.length - 1}
                  aria-label={`Move ${t.label} right`}
                  onClick={() => reorder(t.id, arranged[i + 1].id)}
                >
                  →
                </button>
              </li>
            ))}
          </ol>
          <button onClick={() => setEditing(false)}>Done</button>
        </div>
      )}
      <div
        className="acme-tab-strip"
        role="tablist"
        aria-label="Application tabs"
        ref={strip}
      >
        {arranged.map((t, i) => {
          const selected =
            pathname === t.href ||
            (t.id !== "overview" && pathname.startsWith(t.href + "/"));
          return (
            <Link
              key={t.id}
              to={t.href}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              draggable={false}
              data-acme-tab-id={t.id}
              data-drop={drop === t.id}
              onPointerDown={(e) => {
                suppressClick.current = false;
                if (e.button !== 0 || e.pointerType === "touch") return;
                dragging.current = {
                  id: t.id,
                  x: e.clientX,
                  y: e.clientY,
                  target: t.id,
                  active: false,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = dragging.current;
                if (!d) return;
                if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 6)
                  d.active = true;
                if (!d.active) return;
                e.preventDefault();
                const bounds = strip.current?.getBoundingClientRect();
                if (bounds && strip.current) {
                  if (e.clientX > bounds.right - 30)
                    strip.current.scrollLeft += 20;
                  else if (e.clientX < bounds.left + 30)
                    strip.current.scrollLeft -= 20;
                }
                const target = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest<HTMLElement>("[data-acme-tab-id]")
                  ?.dataset.acmeTabId;
                if (target) {
                  d.target = target;
                  setDrop(target);
                }
              }}
              onPointerUp={(e) => {
                const d = dragging.current;
                dragging.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
                if (d?.active) {
                  suppressClick.current = true;
                  reorder(d.id, d.target);
                }
                setDrop("");
              }}
              onPointerCancel={() => {
                dragging.current = null;
                setDrop("");
              }}
              onClick={(e) => {
                if (suppressClick.current) {
                  e.preventDefault();
                  suppressClick.current = false;
                }
              }}
              onKeyDown={(e) => {
                const direction =
                  e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
                if (direction) {
                  e.preventDefault();
                  const target =
                    arranged[
                      (i + direction + arranged.length) % arranged.length
                    ];
                  if (e.ctrlKey && e.shiftKey) reorder(t.id, target.id);
                  else
                    (
                      strip.current?.children[
                        (i + direction + arranged.length) % arranged.length
                      ] as HTMLElement
                    )?.focus();
                } else if (e.key === "Home" || e.key === "End") {
                  e.preventDefault();
                  (
                    strip.current?.children[
                      e.key === "Home" ? 0 : arranged.length - 1
                    ] as HTMLElement
                  )?.focus();
                }
              }}
            >
              <Icon id={t.id} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </section>,
    host
  );
}
