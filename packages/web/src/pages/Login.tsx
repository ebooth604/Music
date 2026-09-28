import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, auth } from "../api/client";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const request = async () => {
    setErr("");
    try {
      const r = await api.requestMagicLink(email);
      setSent(true);
      if (r.devToken) setToken(r.devToken); // dev convenience: server echoes the token when no SMTP is configured
    } catch (e: any) { setErr(e.message); }
  };
  const verify = async () => {
    try { const r = await api.verifyMagicLink(token); auth.token = r.token; nav("/"); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="panel" style={{ maxWidth: 440, margin: "60px auto" }}>
      <h1>Sign in</h1>
      <p className="muted">Use Sign in with Apple from the iOS/macOS apps, or email here.</p>
      <label>Email</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      <div className="actions"><button onClick={request} disabled={!email}>Send magic link</button></div>
      {sent && (
        <>
          <label>Paste the token from your email</label>
          <input value={token} onChange={(e) => setToken(e.target.value)} />
          <div className="actions"><button onClick={verify} disabled={!token}>Verify</button></div>
        </>
      )}
      {err && <p className="bad">{err}</p>}
    </div>
  );
}
