import { NavLink, useLocation } from "react-router-dom";
import { Dices, ReceiptText, Banknote, CircleUser, Trophy } from "lucide-react";

const tabs = [
  { to: "/",             label: "Game",    Icon: Dices       },
  { to: "/history",      label: "History", Icon: ReceiptText },
  { to: "/leaderboard",  label: "Top",     Icon: Trophy      },
  { to: "/wallet",       label: "Wallet",  Icon: Banknote    },
  { to: "/profile",      label: "Profile", Icon: CircleUser  },
];

export function BottomNav() {
  const { pathname } = useLocation();
  // Disable all navigation while user is on the cartela selection page
  const locked = pathname.startsWith("/play");

  return (
    <nav style={styles.nav}>
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={locked ? "#" : to}
          end={to === "/"}
          onClick={locked ? (e) => e.preventDefault() : undefined}
          style={({ isActive }) => ({
            ...styles.tab,
            color: locked
              ? "rgba(255,255,255,0.18)"
              : isActive
                ? "var(--accent-orange)"
                : "var(--text-secondary)",
            pointerEvents: locked ? "none" : "auto",
            opacity: locked ? 0.4 : 1,
          })}
        >
          <Icon size={22} strokeWidth={1.8} />
          <span style={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    height: "var(--nav-height)",
    backgroundColor: "var(--bg-nav)",
    borderTop: "1px solid var(--border-subtle)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    zIndex: 100,
  },
  tab: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "3px",
    textDecoration: "none",
    flex: 1,
    paddingTop: "8px",
    paddingBottom: "8px",
    transition: "color 0.15s, opacity 0.15s",
  },
  label: {
    fontSize: "11px",
    fontWeight: 500,
  },
};
