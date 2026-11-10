
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@supabase/supabase-js";

type Player = {
  id?: string;
  name: string;
  position?: string;
  team?: string;
  imageUrl?: string;
};

type Submission = {
  id: string;
  submission_number: number;
  created_at: string;
  tiktok_username: string;
  submission_type: "trade" | "start_sit";
  give_players: Player[];
  get_players: Player[];
  players: Player[];
  status: "pending" | "accepted" | "declined";
  processed_at: string | null;
};

type SoundType = "incoming" | "swipe" | "accepted" | "declined";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export default function AdminPage() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [incomingId, setIncomingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(45);

  const audioRef = useRef<AudioContext | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);

  // Check whether the admin is logged in.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load submissions from Supabase.
  const loadSubmissions = useCallback(async () => {
    if (!session) return;

    const { data, error: fetchError } = await supabase
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const rows = (data || []) as Submission[];

    if (firstLoadRef.current) {
      knownIdsRef.current = new Set(rows.map((item) => item.id));
      firstLoadRef.current = false;
    } else {
      const newItems = rows.filter(
        (item) =>
          !knownIdsRef.current.has(item.id) &&
          item.status === "pending"
      );

      if (newItems.length > 0) {
        const newest = newItems[newItems.length - 1];
        setIncomingId(newest.id);
        void playSound("incoming");

        window.setTimeout(() => {
          setIncomingId(null);
        }, 1800);
      }

      rows.forEach((item) => knownIdsRef.current.add(item.id));
    }

    setSubmissions(rows);
    setError("");
  }, [session]);

  // Refresh when logged in and listen for new submissions.
  useEffect(() => {
    if (!session) {
      setSubmissions([]);
      return;
    }

    void loadSubmissions();

    const channel = supabase
      .channel("askxo-submissions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
        },
        () => {
          void loadSubmissions();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [session, loadSubmissions]);

  // Browser-generated sound effects.
  async function playSound(type: SoundType) {
    if (muted || volume === 0 || typeof window === "undefined") return;

    try {
      if (!audioRef.current) {
        audioRef.current = new window.AudioContext();
      }

      const ctx = audioRef.current;

      if (ctx.state !== "running") {
        await ctx.resume();
      }

      if (ctx.state !== "running") return;

      const master = ctx.createGain();
      master.gain.value = (volume / 100) * 0.65;
      master.connect(ctx.destination);

      function tone(
        frequency: number,
        delay: number,
        duration: number,
        wave: OscillatorType = "sine",
        endFrequency?: number
      ) {
        const start = ctx.currentTime + delay;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.type = wave;
        oscillator.frequency.setValueAtTime(frequency, start);

        if (endFrequency) {
          oscillator.frequency.exponentialRampToValueAtTime(
            endFrequency,
            start + duration
          );
        }

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          start + duration
        );

        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
      }

      if (type === "incoming") {
        tone(660, 0, 0.25);
        tone(880, 0.13, 0.35);
        tone(1100, 0.26, 0.4);
      }

      if (type === "swipe") {
        tone(500, 0, 0.3, "sawtooth", 100);
      }

      if (type === "accepted") {
  // Cash-register CHA-CHING!
  tone(1318, 0, 0.38, "sine", 1760);
  tone(1976, 0.09, 0.48, "triangle", 2637);
  tone(988, 0.20, 0.38, "sine", 1318);
  tone(1568, 0.34, 0.55, "sine", 2093);
  tone(392, 0.05, 0.16, "triangle");
}

      if (type === "declined") {
        tone(440, 0, 0.25, "triangle");
        tone(330, 0.16, 0.3, "triangle");
        tone(220, 0.32, 0.4, "triangle");
      }

      window.setTimeout(() => master.disconnect(), 1600);
    } catch (soundError) {
      console.warn("Sound could not play:", soundError);
    }
  }

  async function playActionSounds(status: "accepted" | "declined") {
    await playSound("swipe");
    await new Promise((resolve) => window.setTimeout(resolve, 110));
    await playSound(status);
  }

  // Admin login.
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setLoginError(authError.message);
    }

    setLoggingIn(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSubmissions([]);
  }

  // Accept or decline a submission.
  async function processSubmission(
    item: Submission,
    status: "accepted" | "declined"
  ) {
    if (processingId) return;

    setProcessingId(item.id);
    setExitingId(item.id);
    void playActionSounds(status);

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    const { error: updateError } = await supabase
      .from("submissions")
      .update({
        status,
        processed_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (updateError) {
      setError(updateError.message);
      setExitingId(null);
      setProcessingId(null);
      return;
    }

    setExitingId(null);
    setProcessingId(null);
    await loadSubmissions();
  }

  const pending = submissions.filter(
    (item) => item.status === "pending"
  );

  const history = submissions
    .filter((item) => item.status !== "pending")
    .sort(
      (a, b) =>
        new Date(b.processed_at || b.created_at).getTime() -
        new Date(a.processed_at || a.created_at).getTime()
    );

  const displayedSubmissions =
    activeTab === "pending" ? pending : history;

  function formatDate(date: string) {
    return new Date(date).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <main className="login-screen">
        <div className="login-box">LOADING ASKXO...</div>
        <style>{styles}</style>
      </main>
    );
  }

  // Login screen.
  if (!session) {
    return (
      <main className="login-screen">
        <style>{styles}</style>

        <form className="login-box" onSubmit={handleLogin}>
          <div className="login-logo">ASK<span>XO</span></div>
          <p className="login-subtitle">PRIVATE ADMIN ACCESS</p>

          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Admin email"
            required
          />

          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />

          {loginError && (
            <p className="error-message">{loginError}</p>
          )}

          <button
            className="login-button"
            type="submit"
            disabled={loggingIn}
          >
            {loggingIn ? "SIGNING IN..." : "ENTER DASHBOARD"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <style>{styles}</style>

      <header className="dashboard-header">
        <div>
          <div className="brand">ASK<span>XO</span></div>
          <div className="header-subtitle">WEEKEND XO ADMIN</div>
        </div>

        <div className="header-controls">
          <div className="sound-controls">
            <button
              className="sound-toggle"
              onClick={() => setMuted(!muted)}
              title={muted ? "Unmute sounds" : "Mute sounds"}
            >
              {muted ? "🔇" : "🔊"}
            </button>

            <input
              aria-label="Sound volume"
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(event) =>
                setVolume(Number(event.target.value))
              }
            />

            <span className="volume-number">{volume}%</span>
          </div>

          <button className="logout-button" onClick={handleLogout}>
            LOG OUT
          </button>
        </div>
      </header>

      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">THE CONTROL ROOM</p>
          <h1>Submission <span>Desk</span></h1>
          <p className="heading-description">
            Review trades and lineup questions from the XO community.
          </p>
        </div>

        <button
          className="refresh-button"
          onClick={() => void loadSubmissions()}
        >
          ↻ REFRESH
        </button>
      </section>

      {error && <div className="error-banner">{error}</div>}

      <nav className="tabs">
        <button
          className={activeTab === "pending" ? "tab active" : "tab"}
          onClick={() => setActiveTab("pending")}
        >
          PENDING
        </button>

        <button
          className={activeTab === "history" ? "tab active" : "tab"}
          onClick={() => setActiveTab("history")}
        >
          HISTORY
        </button>
      </nav>

      <section className="poker-table">
        {displayedSubmissions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-xo">XO</div>
            <h2>
              {activeTab === "pending"
                ? "No pending submissions"
                : "No completed submissions yet"}
            </h2>
            <p>
              {activeTab === "pending"
                ? "New questions will appear here when viewers submit them."
                : "Accepted and declined submissions will be saved here."}
            </p>
          </div>
        ) : (
          <div className="submission-list">
            {displayedSubmissions.map((item) => (
              <article
                key={item.id}
                className={[
                  "submission-card",
                  exitingId === item.id ? "card-exiting" : "",
                  incomingId === item.id ? "card-incoming" : "",
                ].join(" ")}
              >
                <div className="playing-card-corner corner-top">
                  <strong>{item.submission_number ?? "—"}</strong>
                  <span>♠</span>
                </div>

                <div className="playing-card-corner corner-bottom">
                  <strong>{item.submission_number ?? "—"}</strong>
                  <span>♠</span>
                </div>

                <div className="submission-top">
                  <div className="viewer-info">
                    <span className="viewer-label">SUBMITTED BY</span>
                    <h2 className="username">
                      @{item.tiktok_username}
                    </h2>
                    <span className="submission-date">
                      {formatDate(item.created_at)}
                    </span>
                  </div>

                  <span className={`status-badge status-${item.status}`}>
                    {item.status.toUpperCase()}
                  </span>
                </div>

                <div className="card-brand-line">
                  <span>ASKXO</span>
                  <span>SUBMISSION #{item.submission_number ?? "—"}</span>
                </div>

                <div className="card-divider" />

                {item.submission_type === "trade" ? (
                  <>
                    <div className="question-title">
                      <span className="question-type">TRADE QUESTION</span>
                      <h3>Should this trade happen?</h3>
                    </div>

                    <div className="trade-grid">
                      <div className="trade-side">
                        <h4 className="side-heading">THEY GIVE</h4>

                        {item.give_players?.length ? (
                          item.give_players.map((player, index) => (
                            <PlayerBar
                              key={`${player.id || player.name}-${index}`}
                              player={player}
                            />
                          ))
                        ) : (
                          <p className="no-players">No players listed</p>
                        )}
                      </div>

                      <div className="trade-middle">⇄</div>

                      <div className="trade-side">
                        <h4 className="side-heading">THEY GET</h4>

                        {item.get_players?.length ? (
                          item.get_players.map((player, index) => (
                            <PlayerBar
                              key={`${player.id || player.name}-${index}`}
                              player={player}
                            />
                          ))
                        ) : (
                          <p className="no-players">No players listed</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="question-title">
                      <span className="question-type">START / SIT QUESTION</span>
                      <h3>Who should they start?</h3>
                    </div>

                    <div className="start-sit-panel">
                      {item.players?.length ? (
                        item.players.map((player, index) => (
                          <PlayerBar
                            key={`${player.id || player.name}-${index}`}
                            player={player}
                          />
                        ))
                      ) : (
                        <p className="no-players">
                          No players listed
                        </p>
                      )}
                    </div>
                  </>
                )}

                {item.status === "pending" ? (
                  <div className="action-buttons">
                    <button
                      className="decline-button"
                      disabled={processingId !== null}
                      onClick={() =>
                        void processSubmission(item, "declined")
                      }
                    >
                      DECLINE
                    </button>

                    <button
                      className="accept-button"
                      disabled={processingId !== null}
                      onClick={() =>
                        void processSubmission(item, "accepted")
                      }
                    >
                      ACCEPT
                    </button>
                  </div>
                ) : (
                  <div className="completed-label">
                    {item.status === "accepted"
                      ? "✓ ACCEPTED"
                      : "✕ DECLINED"}
                    {item.processed_at &&
                      ` · ${formatDate(item.processed_at)}`}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="dashboard-footer">
        WEEKEND XO <span>·</span> ASKXO ADMIN
      </footer>
    </main>
  );
}

function PlayerBar({ player }: { player: Player }) {
  return (
    <div className="player-bar">
      {player.imageUrl ? (
        <img
          className="player-image"
          src={player.imageUrl}
          alt={player.name}
        />
      ) : (
        <div className="player-placeholder">XO</div>
      )}

      <div className="player-details">
        <strong>{player.name}</strong>
        <span>
          {[player.position, player.team].filter(Boolean).join(" · ") ||
            "PLAYER"}
        </span>
      </div>
    </div>
  );
}

const styles = `
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: #080a09;
  color: #f5f1e8;
  font-family: Arial, Helvetica, sans-serif;
}

button, input {
  font: inherit;
}

button {
  cursor: pointer;
}

.login-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(ellipse at center, #18241d 0%, #080a09 70%);
}

.login-box {
  width: 100%;
  max-width: 410px;
  padding: 42px 34px;
  border: 1px solid #b99b65;
  border-radius: 18px;
  background: linear-gradient(145deg, #191b19, #0d0f0e);
  box-shadow: 0 20px 70px rgba(0,0,0,.5);
}

.login-logo, .brand {
  font-family: Georgia, serif;
  font-size: 38px;
  font-weight: 900;
  letter-spacing: 5px;
  color: #f5f1e8;
}

.login-logo span, .brand span {
  color: #c9ad78;
}

.login-subtitle {
  margin: 8px 0 32px;
  color: #c9ad78;
  font-size: 10px;
  letter-spacing: 3px;
}

.login-box label {
  display: block;
  margin: 18px 0 8px;
  color: #d3c4a6;
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.login-box input {
  width: 100%;
  padding: 14px;
  border: 1px solid #514632;
  border-radius: 8px;
  outline: none;
  background: #090b0a;
  color: white;
}

.login-box input:focus {
  border-color: #c9ad78;
}

.login-button {
  width: 100%;
  margin-top: 25px;
  padding: 15px;
  border: 1px solid #e0c894;
  border-radius: 8px;
  background: linear-gradient(135deg, #e0c894, #a98a53);
  color: #15140f;
  font-weight: 900;
  letter-spacing: 1.5px;
}

.login-button:disabled {
  opacity: .6;
}

.error-message {
  color: #ff9999;
  font-size: 13px;
}

.admin-page {
  min-height: 100vh;
  padding: 30px 5%;
  background:
    radial-gradient(ellipse at 50% 0%, #1c241f 0%, #0b0e0c 48%, #080a09 100%);
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(201,173,120,.28);
}

.brand {
  font-size: 31px;
}

.header-subtitle {
  margin-top: 5px;
  color: #b99b65;
  font-size: 9px;
  letter-spacing: 3px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 18px;
}

.sound-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1px solid #4b4639;
  border-radius: 30px;
  background: #141714;
}

.sound-toggle {
  border: 0;
  background: transparent;
  color: white;
  font-size: 18px;
}

.sound-controls input {
  width: 90px;
  accent-color: #c9ad78;
}

.volume-number {
  min-width: 34px;
  color: #d9c9a8;
  font-size: 10px;
}

.logout-button, .refresh-button {
  padding: 10px 15px;
  border: 1px solid #9c8050;
  border-radius: 7px;
  background: transparent;
  color: #d9c9a8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
}

.dashboard-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  padding: 42px 0 30px;
}

.eyebrow {
  margin: 0 0 9px;
  color: #c9ad78;
  font-size: 10px;
  letter-spacing: 3px;
}

.dashboard-heading h1 {
  margin: 0;
  font-family: Georgia, serif;
  font-size: clamp(32px, 5vw, 48px);
  font-weight: 500;
}

.dashboard-heading h1 span {
  color: #c9ad78;
}

.heading-description {
  color: #a7a79f;
  font-size: 13px;
}

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.tab {
  padding: 12px 25px;
  border: 1px solid #62543b;
  border-radius: 7px;
  background: #141714;
  color: #c5b99f;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.5px;
}

.tab.active {
  border-color: #d0b47b;
  background: linear-gradient(135deg, #d8c18f, #a78a53);
  color: #17150f;
}

.poker-table {
  min-height: 260px;
  padding: clamp(14px, 3vw, 34px);
  border: 5px double #b99b65;
  border-radius: 22px;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(255,255,255,.018) 0px,
      rgba(255,255,255,.018) 2px,
      transparent 2px,
      transparent 5px
    ),
    radial-gradient(ellipse at center, #18543b, #0b3425 78%);
  box-shadow:
    inset 0 0 0 4px rgba(201,173,120,.12),
    inset 0 0 65px rgba(0,0,0,.45),
    0 15px 45px rgba(0,0,0,.35);
}

.submission-list {
  display: grid;
  gap: 26px;
  max-width: 1050px;
  margin: 0 auto;
}

.submission-card {
  position: relative;
  overflow: hidden;
  padding: 28px 30px 48px;
  border: 2px solid #c9ad78;
  border-radius: 16px;
  background: linear-gradient(145deg, #f6f1e5, #e8dfcc);
  color: #17251e;
  box-shadow:
    0 12px 32px rgba(0,0,0,.35),
    inset 0 0 0 3px rgba(255,255,255,.45);
  transition: opacity .35s ease, transform .35s ease, box-shadow .35s ease;
}

.card-exiting {
  opacity: 0;
  transform: translateX(55px) scale(.97);
}

.card-incoming {
  animation: incomingGlow 1.5s ease;
}

@keyframes incomingGlow {
  0% {
    box-shadow: 0 0 0 rgba(220,190,125,0);
  }
  35% {
    box-shadow: 0 0 35px rgba(220,190,125,.8);
  }
  100% {
    box-shadow: 0 12px 32px rgba(0,0,0,.35);
  }
}

.playing-card-corner {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  color: #183d2d;
  font-family: Georgia, serif;
}

.playing-card-corner strong {
  font-size: 25px;
  font-weight: 900;
}

.playing-card-corner span {
  margin-top: 3px;
  color: #b08c51;
  font-size: 20px;
}

.corner-top {
  top: 13px;
  left: 17px;
}

.corner-bottom {
  right: 17px;
  bottom: 12px;
  transform: rotate(180deg);
}

.submission-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  padding-left: 48px;
}

.viewer-label {
  color: #826a43;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 2px;
}

.username {
  margin: 5px 0;
  color: #183d2d;
  font-size: 20px;
}

.submission-date {
  color: #746e61;
  font-size: 11px;
}

.status-badge {
  padding: 8px 12px;
  border: 1px solid currentColor;
  border-radius: 20px;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1px;
}

.status-pending {
  color: #896a32;
}

.status-accepted {
  color: #28633e;
}

.status-declined {
  color: #9c4141;
}

.card-brand-line {
  display: flex;
  justify-content: space-between;
  margin-top: 25px;
  color: #8b744c;
  font-family: Georgia, serif;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 2px;
}

.card-divider {
  height: 1px;
  margin: 12px 0 22px;
  background: linear-gradient(90deg, transparent, #b99b65, transparent);
}

.question-title {
  margin-bottom: 17px;
}

.question-type {
  color: #766d5e;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 2px;
}

.question-title h3 {
  margin: 6px 0 0;
  color: #183d2d;
  font-family: Georgia, serif;
  font-size: 22px;
  font-weight: 500;
}

.trade-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: stretch;
  gap: 14px;
  padding: 16px;
  border: 3px solid #c9ad78;
  border-radius: 15px;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(255,255,255,.018) 0px,
      rgba(255,255,255,.018) 2px,
      transparent 2px,
      transparent 5px
    ),
    radial-gradient(ellipse at center, #18543b, #0b3425 75%);
  box-shadow: inset 0 0 35px rgba(0,0,0,.4);
}

.trade-side {
  min-width: 0;
  padding: 13px;
  border: 1px solid #b89b67;
  border-radius: 10px;
  background: rgba(5,28,20,.72);
}

.side-heading {
  margin: 0 0 12px;
  color: #e6d2a6;
  font-size: 10px;
  letter-spacing: 2px;
}

.trade-middle {
  display: flex;
  align-items: center;
  color: #e6d2a6;
  font-size: 25px;
}

.player-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  margin-bottom: 9px;
  padding: 8px;
  border: 1px solid #55564e;
  border-radius: 7px;
  background: linear-gradient(135deg, #292d2a, #111412);
  color: white;
}

.player-bar:last-child {
  margin-bottom: 0;
}

.player-image, .player-placeholder {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  border-radius: 6px;
  object-fit: cover;
  background: #333a34;
}

.player-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #d6c18f;
  font-family: Georgia, serif;
  font-weight: 900;
}

.player-details {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.player-details strong {
  overflow: hidden;
  color: #fff;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-details span {
  color: #c9ad78;
  font-size: 9px;
  letter-spacing: 1px;
}

.no-players {
  color: #ded6c5;
  font-size: 12px;
}

.start-sit-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 15px;
  border: 2px solid #c9ad78;
  border-radius: 12px;
  background: radial-gradient(ellipse at center, #18543b, #0b3425);
}

.start-sit-panel .player-bar {
  margin: 0;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 22px;
}

.accept-button, .decline-button {
  min-width: 130px;
  padding: 13px 22px;
  border-radius: 7px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 2px;
  transition: transform .2s ease, box-shadow .2s ease;
}

.accept-button:hover, .decline-button:hover {
  transform: translateY(-2px);
}

.accept-button {
  border: 1px solid #e4cc98;
  background: linear-gradient(135deg, #e0c894, #aa8950);
  color: #17150f;
  box-shadow: 0 4px 15px rgba(169,137,80,.2);
}

.decline-button {
  border: 1px solid #b99b65;
  background: linear-gradient(135deg, #252825, #101210);
  color: #e6d2a6;
}

.accept-button:disabled, .decline-button:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.completed-label {
  margin-top: 20px;
  color: #66563b;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1px;
  text-align: right;
}

.empty-state {
  padding: 55px 20px;
  text-align: center;
}

.empty-xo {
  color: #d5bd8b;
  font-family: Georgia, serif;
  font-size: 50px;
  letter-spacing: 7px;
}

.empty-state h2 {
  color: #f1e8d4;
  font-family: Georgia, serif;
  font-weight: 500;
}

.empty-state p {
  color: #b8c2b9;
  font-size: 13px;
}

.error-banner {
  margin: 15px 0;
  padding: 12px;
  border: 1px solid #a34b4b;
  border-radius: 7px;
  background: rgba(130,35,35,.2);
  color: #ffc1c1;
  font-size: 12px;
}

.dashboard-footer {
  padding: 25px 0 5px;
  color: #8f8c7e;
  font-size: 9px;
  letter-spacing: 3px;
  text-align: center;
}

.dashboard-footer span {
  color: #c9ad78;
}

@media (max-width: 700px) {
  .admin-page {
    padding: 20px 14px;
  }

  .dashboard-header {
    align-items: flex-start;
  }

  .header-controls {
    flex-direction: column;
    align-items: flex-end;
    gap: 10px;
  }

  .sound-controls input {
    width: 65px;
  }

  .dashboard-heading {
    align-items: flex-start;
  }

  .refresh-button {
    margin-top: 20px;
  }

  .submission-card {
    padding: 23px 15px 45px;
  }

  .trade-grid {
    grid-template-columns: 1fr;
  }

  .trade-middle {
    justify-content: center;
    transform: rotate(90deg);
  }

  .start-sit-panel {
    grid-template-columns: 1fr;
  }

  .action-buttons {
    gap: 8px;
  }

  .accept-button, .decline-button {
    min-width: 0;
    flex: 1;
    padding: 13px 8px;
  }
}
`;
