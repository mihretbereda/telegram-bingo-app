import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Gamepad2,
  TrendingUp,
  ArrowRight,
} from "lucide-react";

type TxType = "deposit" | "withdraw" | "win" | "stake";

interface Transaction {
  id: string;
  type: TxType;
  label: string;
  amount: number;
  date: string;
}

// Placeholder — replace with real Supabase data once wallet tables exist
const MOCK_TXS: Transaction[] = [];

const TX_META: Record<TxType, { icon: React.ReactNode; color: string; bg: string }> = {
  deposit:  { icon: <ArrowDownToLine size={16} />, color: "#00c853", bg: "rgba(0,200,83,0.15)"   },
  withdraw: { icon: <ArrowUpFromLine size={16} />, color: "#ff4842", bg: "rgba(255,72,66,0.15)"  },
  win:      { icon: <TrendingUp      size={16} />, color: "#f5a623", bg: "rgba(245,166,35,0.15)" },
  stake:    { icon: <Gamepad2        size={16} />, color: "#4a90d9", bg: "rgba(74,144,217,0.15)" },
};

export default function Wallet() {
  const [activeTab, setActiveTab] = useState<"all" | "deposit" | "withdraw">("all");

  const mainBalance  = 0;
  const playBalance  = 0;
  const totalBalance = mainBalance + playBalance;

  const filtered = MOCK_TXS.filter(
    (t) => activeTab === "all" || t.type === activeTab,
  );

  return (
    <div style={styles.page}>
      {/* ── Balance hero ── */}
      <div style={styles.hero}>
        <p style={styles.heroLabel}>Total Balance</p>
        <h1 style={styles.heroBalance}>{totalBalance.toLocaleString()} ETB</h1>

        <div style={styles.walletRow}>
          <WalletCard
            label="Main Wallet"
            balance={mainBalance}
            icon={<Banknote size={18} color="#f5a623" />}
            accent="#f5a623"
          />
          <WalletCard
            label="Play Wallet"
            balance={playBalance}
            icon={<Gamepad2 size={18} color="#4a90d9" />}
            accent="#4a90d9"
          />
        </div>

        {/* ── Actions ── */}
        <div style={styles.actions}>
          <button style={{ ...styles.actionBtn, background: "linear-gradient(135deg,#00b140,#00c853)" }}>
            <ArrowDownToLine size={18} />
            <span>Deposit</span>
          </button>
          <button style={{ ...styles.actionBtn, background: "linear-gradient(135deg,#1565c0,#4a90d9)" }}>
            <ArrowUpFromLine size={18} />
            <span>Withdraw</span>
          </button>
        </div>
      </div>

      {/* ── Transactions ── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Transactions</span>
          <button style={styles.seeAll}>
            See all <ArrowRight size={13} />
          </button>
        </div>

        {/* Filter tabs */}
        <div style={styles.filters}>
          {(["all", "deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              style={{
                ...styles.pill,
                ...(activeTab === t ? styles.pillActive : styles.pillInactive),
              }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div style={styles.emptyState}>
            <Banknote size={36} color="rgba(245,166,35,0.4)" strokeWidth={1.5} />
            <p style={styles.emptyText}>No transactions yet</p>
          </div>
        ) : (
          <div style={styles.txList}>
            {filtered.map((tx) => {
              const meta = TX_META[tx.type];
              const isCredit = tx.type === "deposit" || tx.type === "win";
              return (
                <div key={tx.id} style={styles.txCard}>
                  <div style={{ ...styles.txIcon, background: meta.bg, color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div style={styles.txInfo}>
                    <span style={styles.txLabel}>{tx.label}</span>
                    <span style={styles.txDate}>{tx.date}</span>
                  </div>
                  <span style={{ ...styles.txAmount, color: isCredit ? "#00c853" : "#ff4842" }}>
                    {isCredit ? "+" : "-"}{tx.amount} ETB
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WalletCard({
  label, balance, icon, accent,
}: {
  label: string; balance: number; icon: React.ReactNode; accent: string;
}) {
  return (
    <div style={{ ...styles.walletCard, borderColor: `${accent}30` }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <div style={{ ...styles.walletCardIcon, background: `${accent}18` }}>{icon}</div>
        <span style={styles.walletCardLabel}>{label}</span>
      </div>
      <span style={styles.walletCardBalance}>{balance.toLocaleString()}</span>
      <span style={styles.walletCardCurrency}>ETB</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(160deg, #1a1040 0%, #0d0b1e 60%)",
  },

  /* Hero */
  hero: {
    background: "linear-gradient(135deg, #3a1c6e 0%, #1a1040 100%)",
    padding: "32px 20px 24px",
  },
  heroLabel: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.5)",
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "1px",
    marginBottom: "6px",
  },
  heroBalance: {
    fontSize: "36px",
    fontWeight: 800,
    color: "#fff",
    marginBottom: "20px",
  },
  walletRow: {
    display: "flex",
    gap: "12px",
    marginBottom: "20px",
  },
  walletCard: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid",
    borderRadius: "16px",
    padding: "16px",
    backdropFilter: "blur(10px)",
  },
  walletCardIcon: {
    width: "32px",
    height: "32px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  walletCardLabel: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
    fontWeight: 500,
  },
  walletCardBalance: {
    display: "block",
    fontSize: "22px",
    fontWeight: 800,
    color: "#fff",
  },
  walletCardCurrency: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.4)",
  },
  actions: {
    display: "flex",
    gap: "12px",
  },
  actionBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    padding: "14px",
    borderRadius: "14px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: 700,
    border: "none",
    cursor: "pointer",
  },

  /* Transactions */
  section: {
    padding: "24px 20px",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "14px",
  },
  sectionTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#fff",
  },
  seeAll: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    background: "none",
    border: "none",
    color: "var(--accent-orange)",
    fontSize: "13px",
    fontWeight: 600,
    cursor: "pointer",
  },
  filters: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  },
  pill: {
    padding: "6px 18px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
  },
  pillActive: {
    background: "var(--accent-orange)",
    color: "#fff",
  },
  pillInactive: {
    background: "rgba(255,255,255,0.08)",
    color: "rgba(255,255,255,0.45)",
  },
  txList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  txCard: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "14px",
    padding: "14px 16px",
  },
  txIcon: {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  txInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "3px",
  },
  txLabel: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
  },
  txDate: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.4)",
  },
  txAmount: {
    fontSize: "15px",
    fontWeight: 700,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    paddingTop: "48px",
  },
  emptyText: {
    fontSize: "15px",
    color: "rgba(255,255,255,0.4)",
    fontWeight: 500,
  },
};
