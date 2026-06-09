import { NavLink } from "react-router-dom";
import { Gamepad2, History, Wallet, User } from "lucide-react";

const tabs = [
  { to: "/",        label: "Game",    Icon: Gamepad2 },
  { to: "/history", label: "History", Icon: History  },
  { to: "/wallet",  label: "Wallet",  Icon: Wallet   },
  { to: "/profile", label: "Profile", Icon: User     },
];

export function BottomNav() {
  return (
    <nav style={styles.nav}>
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          style={({ isActive }) => ({
            ...styles.tab,
            color: isActive ? "var(--accent-orange)" : "var(--text-secondary)",
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
    transition: "color 0.15s",
  },
  label: {
    fontSize: "11px",
    fontWeight: 500,
  },
};
