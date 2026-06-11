import { useSoundEnabled } from "@/hooks/useSoundEnabled";
import {
  Trophy, Users, TrendingUp, Volume2, VolumeX, ChevronRight, LogOut, Shield, Bell,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useHistory } from "@/hooks/useHistory";
import { useReferrals } from "@/hooks/useReferrals";
import { LoadingSpinner } from "@/components/ui";

export default function Profile() {
  const { user, isLoading } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: history }  = useHistory(user?.id);
  const { data: referrals } = useReferrals(user?.id);
  const [soundOn, setSoundOn] = useSoundEnabled();
  const [notifOn, setNotifOn] = useState(true);

  if (isLoading) {
    return (
      <div style={styles.centered}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const initials = profile
    ? `${profile.first_name[0]}${profile.last_name?.[0] ?? ""}`.toUpperCase()
    : "?";

  const stats = [
    { icon: <Trophy    size={20} color="#f5a623" />, label: "Games Won",     value: String(history?.totalWon ?? 0),                        accent: "#f5a623" },
    { icon: <Users     size={20} color="#4a90d9" />, label: "Total Invites", value: String(referrals?.totalInvited ?? 0),                   accent: "#4a90d9" },
    { icon: <TrendingUp size={20} color="#00c853" />, label: "Total Earned",  value: `${(referrals?.totalEarnings ?? 0).toLocaleString()} ETB`, accent: "#00c853" },
  ];

  return (
    <div style={styles.page}>
      {/* ── Avatar hero ── */}
      <div style={styles.hero}>
        <div style={styles.avatarRing}>
          <div style={styles.avatar}>
            {profile?.photo_url ? (
              <img src={profile.photo_url} alt="avatar" style={styles.avatarImg} />
            ) : (
              <span style={styles.avatarInitials}>{initials}</span>
            )}
          </div>
        </div>

        <h2 style={styles.name}>
          {profile ? `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}` : "Player"}
        </h2>
        {profile?.username && (
          <p style={styles.username}>@{profile.username}</p>
        )}
        {profile?.referral_code && (
          <p style={styles.referralCode}>Referral: <span style={{ color: "var(--accent-orange)", fontWeight: 700 }}>{profile.referral_code}</span></p>
        )}
      </div>

      {/* ── Stats ── */}
      <div style={styles.statsGrid}>
        {stats.map(({ icon, label, value, accent }) => (
          <div key={label} style={{ ...styles.statCard, borderColor: `${accent}28` }}>
            <div style={{ ...styles.statIcon, background: `${accent}15` }}>{icon}</div>
            <span style={styles.statValue}>{value}</span>
            <span style={styles.statLabel}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Settings ── */}
      <div style={styles.section}>
        <p style={styles.sectionTitle}>Settings</p>

        <div style={styles.settingsList}>
          <ToggleRow
            icon={soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            label="Sound Effects"
            accent="#f5a623"
            checked={soundOn}
            onChange={() => setSoundOn((v) => !v)}
          />
          <div style={styles.divider} />
          <ToggleRow
            icon={<Bell size={18} />}
            label="Notifications"
            accent="#4a90d9"
            checked={notifOn}
            onChange={() => setNotifOn((v) => !v)}
          />
          <div style={styles.divider} />
          <LinkRow icon={<Shield size={18} />} label="Privacy Policy" accent="#00c853" />
        </div>
      </div>

      {/* ── Logout ── */}
      <div style={styles.section}>
        <button style={styles.logoutBtn}>
          <LogOut size={16} color="#ff4842" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

function ToggleRow({ icon, label, accent, checked, onChange }: { icon: React.ReactNode; label: string; accent: string; checked: boolean; onChange: () => void }) {
  return (
    <div style={styles.settingRow}>
      <div style={{ ...styles.settingIcon, background: `${accent}18`, color: accent }}>{icon}</div>
      <span style={styles.settingLabel}>{label}</span>
      <button
        onClick={onChange}
        style={{ ...styles.toggle, background: checked ? "var(--accent-orange)" : "rgba(255,255,255,0.15)", justifyContent: checked ? "flex-end" : "flex-start" }}
        aria-checked={checked} role="switch"
      >
        <span style={styles.toggleKnob} />
      </button>
    </div>
  );
}

function LinkRow({ icon, label, accent }: { icon: React.ReactNode; label: string; accent: string }) {
  return (
    <div style={styles.settingRow}>
      <div style={{ ...styles.settingIcon, background: `${accent}18`, color: accent }}>{icon}</div>
      <span style={styles.settingLabel}>{label}</span>
      <ChevronRight size={16} color="rgba(255,255,255,0.3)" />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:    { minHeight: "100vh", background: "linear-gradient(160deg, #1a1040 0%, #0d0b1e 60%)", paddingBottom: "32px" },
  centered:{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" },
  hero: { background: "linear-gradient(135deg, #3a1c6e 0%, #1a1040 100%)", padding: "36px 20px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" },
  avatarRing: { padding: "3px", borderRadius: "50%", background: "linear-gradient(135deg, #f5a623, #4a90d9)", marginBottom: "4px" },
  avatar: { width: "80px", height: "80px", borderRadius: "50%", background: "linear-gradient(135deg, #2d2060, #1a1040)", border: "3px solid var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg:     { width: "100%", height: "100%", objectFit: "cover" },
  avatarInitials:{ fontSize: "28px", fontWeight: 800, color: "#fff" },
  name:    { fontSize: "20px", fontWeight: 700, color: "#fff" },
  username:{ fontSize: "14px", color: "rgba(255,255,255,0.45)", fontWeight: 500 },
  referralCode:{ fontSize: "12px", color: "rgba(255,255,255,0.4)", fontWeight: 500 },
  statsGrid: { display: "flex", gap: "10px", padding: "20px 20px 4px" },
  statCard: { flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid", borderRadius: "16px", padding: "14px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", backdropFilter: "blur(8px)" },
  statIcon: { width: "38px", height: "38px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" },
  statValue:{ fontSize: "18px", fontWeight: 800, color: "#fff" },
  statLabel:{ fontSize: "10px", color: "rgba(255,255,255,0.45)", fontWeight: 500, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.4px" },
  section:  { padding: "20px 20px 0" },
  sectionTitle: { fontSize: "13px", fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "12px" },
  settingsList:{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", overflow: "hidden" },
  settingRow:  { display: "flex", alignItems: "center", gap: "14px", padding: "15px 16px" },
  settingIcon: { width: "34px", height: "34px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  settingLabel:{ flex: 1, fontSize: "15px", fontWeight: 500, color: "#fff" },
  divider:     { height: "1px", background: "rgba(255,255,255,0.06)", marginLeft: "64px" },
  toggle:      { width: "46px", height: "26px", borderRadius: "13px", border: "none", display: "flex", alignItems: "center", padding: "3px", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 },
  toggleKnob:  { width: "20px", height: "20px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" },
  logoutBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "rgba(255,72,66,0.1)", border: "1px solid rgba(255,72,66,0.25)", borderRadius: "14px", padding: "15px", color: "#ff4842", fontSize: "15px", fontWeight: 600, cursor: "pointer" },
};
