import { useNavigate } from "react-router-dom";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <main style={{ padding: "2rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "2rem" }}>404</h1>
      <p style={{ marginTop: "0.5rem", opacity: 0.6 }}>Page not found.</p>
      <button onClick={() => navigate("/")} style={{ marginTop: "1rem" }}>
        Go home
      </button>
    </main>
  );
}
