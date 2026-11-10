
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

type Player = {
  id: string;
  name: string;
  position: string;
  team: string;
  imageUrl: string;
};

type Submission = {
  id: string;
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

const C = {
  black: "#090909",
  panel: "#151515",
  panelLight: "#202020",
  silver: "#d9d9d9",
  white: "#f5f5f5",
  muted: "#999999",
  gold: "#c9ad78",
  goldLight: "#e6d2a6",
  goldDark: "#8e754b",
  green: "#78bd91",
  red: "#d58b8b",
};

function PlayerBar({ player }: { player: Player }) {
  return (
    <div className="player-bar">
      <img
        src={player.imageUrl}
        alt=""
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
      />
      <div className="player-info">
        <strong>{player.name}</strong>
        <span>{player.position} · {player.team}</span>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingLogin, setCheckingLogin] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [processingId, setProcessingId] = useState("");
  const [view, setView] = useState<"pending" | "history">("pending");

  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(45);
  const [newSubmissionId, setNewSubmissionId] = useState("");
  const [exitingId, setExitingId] = useState("");

  const audioRef = useRef<AudioContext | null>(null);
  const previousPendingIds = useRef<Set<string> | null>(null);

  // Create sound effects directly in the browser.
  function playSound(type: SoundType) {
    if (muted || volume === 0 || typeof window === "undefined") return;

    try {
      const AudioContextClass = window.AudioContext;

      if (!audioRef.current) {
        audioRef.current = new AudioContextClass();
      }

      const ctx = audioRef.current;

      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const master = ctx.createGain();
      master.gain.value = volume / 100;
      master.connect(ctx.destination);

      function tone(
        frequency: number,
        start: number,
        duration: number,
        wave: OscillatorType = "sine",
        endFrequency?: number
      ) {
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
        gain.gain.linearRampToValueAtTime(0.25, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          start + duration
        );

        oscillator.connect(gain);
        gain.connect(master);

        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      }

      const now = ctx.currentTime;

      if (type === "incoming") {
        tone(660, now, 0.25);
        tone(880, now + 0.13, 0.35);
        tone(1100, now + 0.26, 0.4);
      }

      if (type === "swipe") {
        tone(500, now, 0.3, "sawtooth", 100);
      }

      if (type === "accepted") {
        tone(520, now, 0.2);
        tone(660, now + 0.12, 0.2);
        tone(880, now + 0.24, 0.35);
      }

      if (type === "declined") {
        tone(440, now, 0.25, "triangle");
        tone(330, now + 0.16, 0.3, "triangle");
        tone(220, now + 0.32, 0.4, "triangle");
      }

      window.setTimeout(() => {
        master.disconnect();
      }, 1200);
    } catch (error) {
      console.warn("Sound could not play:", error);
    }
  }

  function unlockAudio() {
    try {
      if (!audioRef.current) {
        audioRef.current = new window.AudioContext();
      }

      if (audioRef.current.state === "suspended") {
        void audioRef.current.resume();
      }
    } catch {
      // Audio is optional; dashboard remains functional without it.
    }
  }

  const loadSubmissions = useCallback(async () => {
    if (!supabase) return;

    setLoading(true);
    setLoadError("");

    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setLoadError(
        "Couldn't load submissions. Check your Supabase access policies."
      );
    } else {
      const rows = (data || []) as Submission[];
      const pendingIds = new Set(
        rows
          .filter((item) => item.status === "pending")
          .map((item) => item.id)
      );

      if (previousPendingIds.current === null) {
        // First load: don't play an arrival sound for old submissions.
        previousPendingIds.current = pendingIds;
      } else {
        const arrivals = rows.filter(
          (item) =>
            item.status === "pending" &&
            !previousPendingIds.current?.has(item.id)
        );

        if (arrivals.length > 0) {
          const newest = arrivals[arrivals.length - 1];

          setNewSubmissionId(newest.id);
          playSound("incoming");

          window.setTimeout(() => {
            setNewSubmissionId((current) =>
              current === newest.id ? "" : current
            );
          }, 2000);
        }

        previousPendingIds.current = pendingIds;
      }

      setSubmissions(rows);
    }

    setLoading(false);
  }, [muted, volume]);

  useEffect(() => {
    if (!supabase) {
      setCheckingLogin(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingLogin(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) {
      setSubmissions([]);
      previousPendingIds.current = null;
      return;
    }

    loadSubmissions();

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
          loadSubmissions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, loadSubmissions]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!supabase) return;

    unlockAudio();
    setLoggingIn(true);
    setLoginError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginError("Login failed. Check your email and password.");
    }

    setLoggingIn(false);
  }

  async function handleLogout() {
    if (!supabase) return;

    await supabase.auth.signOut();
    setSubmissions([]);
    setPassword("");
    previousPendingIds.current = null;
  }

  async function processSubmission(
    item: Submission,
    status: "accepted" | "declined"
  ) {
    if (!supabase) return;

    unlockAudio();
    setProcessingId(item.id);
    setExitingId(item.id);

    playSound("swipe");
    playSound(status);

    // Give the outgoing card time to animate before updating the database.
    await new Promise((resolve) => window.setTimeout(resolve, 350));

    const { error } = await supabase
      .from("submissions")
      .update({
        status,
        processed_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      console.error(error);
      alert("Couldn't update this submission. Please try again.");
    } else {
      previousPendingIds.current?.delete(item.id);
      await loadSubmissions();
    }

    setExitingId("");
    setProcessingId("");
  }

  const pending = submissions.filter(
    (item) => item.status === "pending"
  );

  const history = submissions.filter(
    (item) => item.status !== "pending"
  );

  const visibleItems = view === "pending" ? pending : history;

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(ellipse at top, #242424 0%, #101010 45%, #070707 100%)",
    color: C.white,
    padding: "26px 16px",
    fontFamily: "Arial, sans-serif",
  };

  const buttonStyle: React.CSSProperties = {
    border: `1px solid ${C.goldDark}`,
    borderRadius: 7,
    padding: "12px 18px",
    cursor: "pointer",
    fontWeight: 800,
    letterSpacing: 1.2,
    transition: "all 180ms ease",
  };

  const panelStyle: React.CSSProperties = {
    background:
      "linear-gradient(145deg, #242424 0%, #171717 45%, #101010 100%)",
    border: `1px solid ${C.goldDark}`,
    borderRadius: 12,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
  };

  if (!supabase) {
    return (
      <main style={pageStyle}>
        <h1>
          ASK<span style={{ color: C.gold }}>XO</span>
        </h1>
        <p style={{ color: C.red }}>
          Supabase environment variables are missing.
          Check your Vercel project settings.
        </p>
      </main>
    );
  }

  if (checkingLogin) {
    return (
      <main style={pageStyle}>
        <div style={{ textAlign: "center", paddingTop: 100 }}>
          <h1>
            ASK<span style={{ color: C.gold }}>XO</span>
          </h1>
          <p style={{ color: C.muted }}>Checking secure login...</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={{
        ...pageStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <section className="login-card">
          <div className="brand-mark">
            ASK<span>XO</span>
          </div>

          <p className="eyebrow">PRIVATE STREAMER DASHBOARD</p>

          <div className="gold-divider" />

          <h2>STREAMER LOGIN</h2>

          <form onSubmit={handleLogin}>
            <label>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your Supabase login email"
              required
            />

            <label>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />

            {loginError && <p className="error-message">{loginError}</p>}

            <button
              type="submit"
              disabled={loggingIn}
              className="gold-button full-button"
            >
              {loggingIn ? "SIGNING IN..." : "ENTER DASHBOARD"}
            </button>
          </form>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header className="top-header">
        <div>
          <h1 className="brand-mark">
            ASK<span>XO</span>
          </h1>
          <p className="eyebrow">PRIVATE STREAMER DASHBOARD</p>
        </div>

        <div className="header-controls">
          <div className="sound-panel">
            <button
              className="sound-toggle"
              onClick={() => {
                unlockAudio();
                setMuted((current) => !current);
              }}
              title={muted ? "Unmute sounds" : "Mute sounds"}
            >
              {muted ? "🔇" : "🔊"} {muted ? "MUTED" : "SOUND ON"}
            </button>

            <input
              aria-label="Sound volume"
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => {
                unlockAudio();
                setVolume(Number(e.target.value));
                if (Number(e.target.value) > 0) setMuted(false);
              }}
            />

            <span>{volume}%</span>
          </div>

          <button
            onClick={handleLogout}
            className="outline-button"
          >
            LOG OUT
          </button>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="welcome-strip">
          <span className="live-dot" />
          STREAM CONTROL CENTER
          <span className="welcome-line" />
          <span className="welcome-small">ASKXO</span>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">PENDING QUESTIONS</span>
            <strong className="gold-number">{pending.length}</strong>
            <span className="stat-foot">AWAITING REVIEW</span>
          </div>

          <div className="stat-card">
            <span className="stat-label">COMPLETED QUESTIONS</span>
            <strong className="silver-number">{history.length}</strong>
            <span className="stat-foot">PROCESSED SUBMISSIONS</span>
          </div>
        </div>

        <div className="queue-heading">
          <div>
            <h2>SUBMISSION QUEUE</h2>
            <p>Review viewer questions and manage your live stream.</p>
          </div>
          <span className="queue-count">
            {pending.length} WAITING
          </span>
        </div>

        <div className="tabs-row">
          <button
            onClick={() => setView("pending")}
            className={view === "pending" ? "tab active-tab" : "tab"}
          >
            PENDING <span>{pending.length}</span>
          </button>

          <button
            onClick={() => setView("history")}
            className={view === "history" ? "tab active-tab" : "tab"}
          >
            HISTORY <span>{history.length}</span>
          </button>

          <button
            onClick={() => {
              unlockAudio();
              loadSubmissions();
            }}
            className="refresh-button"
          >
            ↻ REFRESH
          </button>
        </div>

        {loading && (
          <p className="loading-message">Loading submissions...</p>
        )}

        {loadError && (
          <p className="error-message">{loadError}</p>
        )}

        {!loading && visibleItems.length === 0 && (
          <div className="empty-state">
            <div className="empty-symbol">XO</div>
            <h3>
              {view === "pending"
                ? "THE TABLE IS CLEAR"
                : "NO HISTORY YET"}
            </h3>
            <p>
              {view === "pending"
                ? "Waiting for the next question to come in..."
                : "Completed submissions will appear here."}
            </p>
          </div>
        )}

        <div className="submission-list">
          {visibleItems.map((item) => (
            <article
              key={item.id}
              className={[
                "submission-card",
                item.id === newSubmissionId ? "new-arrival" : "",
                item.id === exitingId ? "exit-card" : "",
              ].join(" ")}
              style={{
                borderColor:
                  item.status === "pending" ? C.goldDark : "#494949",
              }}
            >
              <div className="submission-top">
                <div>
                  <span className="viewer-label">VIEWER SUBMISSION</span>
                  <h3 className="username">
                    @{item.tiktok_username}
                  </h3>
                  <p className="submission-date">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>

                <span className={`status status-${item.status}`}>
                  {item.status.toUpperCase()}
                </span>
              </div>

              <div className="card-divider" />

              <div className="question-heading">
                <span>
                  {item.submission_type === "trade"
                    ? "TRADE QUESTION"
                    : "START / SIT QUESTION"}
                </span>
                <span className="question-type">
                  {item.submission_type === "trade"
                    ? "PLAYER EXCHANGE"
                    : "PLAYER COMPARISON"}
                </span>
              </div>

              {item.submission_type === "trade" ? (
                <div className="trade-grid">
                  <div className="trade-side">
                    <div className="side-heading">
                      <span className="side-icon">−</span>
                      THEY GIVE
                    </div>

                    {item.give_players?.length ? (
                      item.give_players.map((player, index) => (
                        <PlayerBar
                          key={player.id || index}
                          player={player}
                        />
                      ))
                    ) : (
                      <p className="no-players">No players listed</p>
                    )}
                  </div>

                  <div className="trade-middle">
                    <span>XO</span>
                    <small>TRADE</small>
                  </div>

                  <div className="trade-side">
                    <div className="side-heading">
                      <span className="side-icon">+</span>
                      THEY GET
                    </div>

                    {item.get_players?.length ? (
                      item.get_players.map((player, index) => (
                        <PlayerBar
                          key={player.id || index}
                          player={player}
                        />
                      ))
                    ) : (
                      <p className="no-players">No players listed</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="start-sit-panel">
                  <div className="side-heading">
                    PLAYERS TO COMPARE
                  </div>

                  {item.players?.map((player, index) => (
                    <PlayerBar
                      key={player.id || index}
                      player={player}
                    />
                  ))}
                </div>
              )}

              {item.status === "pending" && (
                <div className="action-row">
                  <button
                    disabled={processingId === item.id}
                    onClick={() => processSubmission(item, "accepted")}
                    className="gold-button action-button"
                  >
                    {processingId === item.id ? "..." : "✓ ACCEPT"}
                  </button>

                  <button
                    disabled={processingId === item.id}
                    onClick={() => processSubmission(item, "declined")}
                    className="decline-button action-button"
                  >
                    {processingId === item.id ? "..." : "✕ DECLINE"}
                  </button>
                </div>
              )}

              {item.status !== "pending" && item.processed_at && (
                <p className="processed-date">
                  PROCESSED {new Date(item.processed_at).toLocaleString()}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      <footer className="footer">
        <div className="footer-rule" />
        ASKXO <span>·</span> PRIVATE STREAMER CONTROL
        <div className="footer-rule" />
      </footer>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  * {
    box-sizing: border-box;
  }

  .top-header {
    max-width: 1100px;
    margin: 0 auto 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    border-bottom: 1px solid rgba(201,173,120,0.35);
    padding-bottom: 22px;
  }

  .brand-mark {
    font-size: 42px;
    font-weight: 950;
    letter-spacing: -2px;
    margin: 0;
    color: #f5f5f5;
    text-shadow: 0 2px 14px rgba(255,255,255,0.08);
  }

  .brand-mark span {
    color: #c9ad78;
  }

  .eyebrow {
    color: #a99a7d;
    font-size: 10px;
    letter-spacing: 3px;
    margin: 5px 0 0;
  }

  .header-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }

  .sound-panel {
    display: flex;
    align-items: center;
    gap: 10px;
    background: #171717;
    border: 1px solid #66573d;
    border-radius: 8px;
    padding: 9px 12px;
    color: #c9ad78;
    font-size: 10px;
    letter-spacing: 1px;
  }

  .sound-toggle {
    background: transparent;
    border: none;
    color: #e2d2ad;
    font-size: 10px;
    font-weight: 800;
    cursor: pointer;
    white-space: nowrap;
  }

  .sound-panel input {
    width: 75px;
    accent-color: #c9ad78;
    cursor: pointer;
  }

  .sound-panel span {
    min-width: 30px;
    text-align: right;
  }

  .outline-button {
    border: 1px solid #a58b5e;
    background: linear-gradient(145deg, #262626, #111);
    color: #e3d4b5;
    padding: 12px 16px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1px;
    cursor: pointer;
  }

  .dashboard-content {
    max-width: 1100px;
    margin: 0 auto;
  }

  .welcome-strip {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #c9ad78;
    font-size: 10px;
    letter-spacing: 2px;
    margin-bottom: 20px;
  }

  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #c9ad78;
    box-shadow: 0 0 9px #c9ad78;
  }

  .welcome-line {
    height: 1px;
    background: linear-gradient(90deg, #8e754b, transparent);
    flex: 1;
  }

  .welcome-small {
    color: #777;
    font-size: 9px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 35px;
  }

  .stat-card {
    background:
      linear-gradient(135deg, #282828, #171717 55%, #101010);
    border: 1px solid #756143;
    border-radius: 10px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    min-height: 130px;
    box-shadow: inset 0 1px rgba(255,255,255,0.08);
  }

  .stat-label {
    color: #b5b5b5;
    font-size: 10px;
    letter-spacing: 1.5px;
  }

  .gold-number, .silver-number {
    font-size: 38px;
    line-height: 1.2;
    margin-top: 8px;
  }

  .gold-number {
    color: #d9c397;
    text-shadow: 0 0 15px rgba(201,173,120,0.18);
  }

  .silver-number {
    color: #e0e0e0;
  }

  .stat-foot {
    color: #777;
    font-size: 9px;
    letter-spacing: 1.4px;
    margin-top: 7px;
  }

  .queue-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
    margin-bottom: 20px;
  }

  .queue-heading h2 {
    font-size: 18px;
    letter-spacing: 2px;
    margin: 0;
    color: #eee;
  }

  .queue-heading p {
    color: #888;
    font-size: 12px;
    margin: 7px 0 0;
  }

  .queue-count {
    color: #d9c397;
    border: 1px solid #806b47;
    border-radius: 30px;
    padding: 7px 12px;
    font-size: 10px;
    letter-spacing: 1px;
    white-space: nowrap;
  }

  .tabs-row {
    display: flex;
    align-items: center;
    gap: 9px;
    border-bottom: 1px solid #45403a;
    padding-bottom: 13px;
    margin-bottom: 22px;
    flex-wrap: wrap;
  }

  .tab, .refresh-button {
    border: 1px solid #454545;
    background: #171717;
    color: #aaa;
    padding: 11px 15px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1px;
    cursor: pointer;
  }

  .tab span {
    margin-left: 7px;
    color: #d8c49c;
  }

  .active-tab {
    background: linear-gradient(145deg, #d9c397, #a98c5a);
    color: #17130c;
    border-color: #e3d0a5;
    box-shadow: 0 0 13px rgba(201,173,120,0.13);
  }

  .active-tab span {
    color: #17130c;
  }

  .refresh-button {
    margin-left: auto;
    color: #d9c397;
    border-color: #806b47;
  }

  .submission-list {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .submission-card {
    position: relative;
    overflow: hidden;
    padding: 21px;
    border: 1px solid #806b47;
    border-radius: 11px;
    background:
      linear-gradient(145deg, #252525 0%, #191919 38%, #111 100%);
    box-shadow:
      inset 0 1px rgba(255,255,255,0.07),
      0 10px 28px rgba(0,0,0,0.25);
    animation: card-enter 450ms cubic-bezier(.2,.8,.2,1) both;
  }

  .submission-card.new-arrival {
    animation:
      card-enter 450ms cubic-bezier(.2,.8,.2,1) both,
      gold-arrival 1.7s ease-in-out 1;
  }

  .submission-card.exit-card {
    animation: card-exit 350ms ease-in forwards;
    pointer-events: none;
  }

  .submission-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .viewer-label {
    font-size: 9px;
    color: #9c8965;
    letter-spacing: 2px;
  }

  .username {
    font-size: 22px;
    margin: 5px 0;
    color: #e1cda3;
    letter-spacing: 0.3px;
  }

  .submission-date {
    font-size: 11px;
    color: #858585;
    margin: 0;
  }

  .status {
    border: 1px solid currentColor;
    border-radius: 30px;
    padding: 7px 12px;
    font-size: 9px;
    letter-spacing: 1px;
    font-weight: 900;
  }

  .status-pending {
    color: #d9c397;
  }

  .status-accepted {
    color: #78bd91;
  }

  .status-declined {
    color: #d58b8b;
  }

  .card-divider {
    height: 1px;
    background: linear-gradient(90deg, #a68c5c, #484848, transparent);
    margin: 17px 0;
  }

  .question-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 13px;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 1.8px;
    color: #e1d3b7;
  }

  .question-type {
    font-size: 9px;
    color: #777;
    letter-spacing: 1px;
    font-weight: 500;
  }

  .trade-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
  }

  .trade-side, .start-sit-panel {
    min-width: 0;
    padding: 13px;
    border: 1px solid #796748;
    border-radius: 8px;
    background:
      linear-gradient(145deg, #262626, #171717 65%, #121212);
    box-shadow: inset 0 1px rgba(255,255,255,0.07);
  }

  .side-heading {
    color: #d9c397;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1.8px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .side-icon {
    width: 19px;
    height: 19px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #d9c397;
    color: #171717;
    font-size: 14px;
  }

  .trade-middle {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #c9ad78;
    opacity: 0.8;
  }

  .trade-middle span {
    font-size: 19px;
    font-weight: 900;
    letter-spacing: -1px;
  }

  .trade-middle small {
    font-size: 8px;
    letter-spacing: 2px;
    margin-top: 3px;
  }

  .player-bar {
    display: flex;
    align-items: center;
    gap: 11px;
    background:
      linear-gradient(110deg, #353535, #242424 55%, #1b1b1b);
    border: 1px solid #55504a;
    border-radius: 7px;
    padding: 9px;
    margin-bottom: 8px;
    min-width: 0;
    box-shadow: inset 0 1px rgba(255,255,255,0.05);
  }

  .player-bar:last-child {
    margin-bottom: 0;
  }

  .player-bar img {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    object-fit: cover;
    background: #454545;
    border: 1px solid #b69c6b;
    flex-shrink: 0;
  }

  .player-info {
    min-width: 0;
  }

  .player-info strong {
    display: block;
    color: #f1f1f1;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .player-info span {
    display: block;
    color: #aaa;
    font-size: 11px;
    margin-top: 4px;
  }

  .no-players {
    color: #888;
    font-size: 11px;
  }

  .start-sit-panel {
    max-width: 650px;
  }

  .action-row {
    display: flex;
    gap: 12px;
    margin-top: 19px;
  }

  .action-button {
    flex: 1;
    min-height: 47px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1.5px;
    cursor: pointer;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  .action-button:hover:not(:disabled) {
    transform: translateY(-2px);
  }

  .action-button:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  .gold-button {
    background: linear-gradient(135deg, #ead8b0, #c9ad78 55%, #a58a5d);
    border: 1px solid #f1dfb7;
    color: #17130c;
    font-weight: 900;
    letter-spacing: 1.3px;
    border-radius: 7px;
    cursor: pointer;
    box-shadow: inset 0 1px rgba(255,255,255,0.55);
  }

  .gold-button:hover:not(:disabled) {
    box-shadow: 0 0 17px rgba(201,173,120,0.24);
  }

  .decline-button {
    background: linear-gradient(145deg, #292929, #101010);
    border: 1px solid #b79b6a;
    color: #e3d4b5;
    font-weight: 900;
    letter-spacing: 1.3px;
    border-radius: 7px;
    cursor: pointer;
  }

  .decline-button:hover:not(:disabled) {
    background: #34302a;
    box-shadow: 0 0 14px rgba(201,173,120,0.12);
  }

  .full-button {
    width: 100%;
    padding: 14px;
    margin-top: 10px;
  }

  .processed-date {
    color: #888;
    font-size: 9px;
    letter-spacing: 1px;
    margin: 17px 0 0;
  }

  .empty-state {
    text-align: center;
    padding: 55px 20px;
    background: linear-gradient(145deg, #222, #111);
    border: 1px solid #756143;
    border-radius: 10px;
  }

  .empty-symbol {
    color: #c9ad78;
    font-size: 36px;
    font-weight: 900;
    letter-spacing: -3px;
    opacity: 0.7;
  }

  .empty-state h3 {
    color: #ded0b2;
    font-size: 13px;
    letter-spacing: 2px;
  }

  .empty-state p, .loading-message {
    color: #888;
    font-size: 12px;
  }

  .login-card {
    width: 100%;
    max-width: 420px;
    padding: 32px;
    border: 1px solid #a58b5e;
    border-radius: 12px;
    background: linear-gradient(145deg, #292929, #151515 55%, #101010);
    box-shadow:
      0 20px 70px rgba(0,0,0,0.6),
      inset 0 1px rgba(255,255,255,0.1);
  }

  .login-card .brand-mark {
    text-align: center;
    font-size: 48px;
  }

  .login-card .eyebrow {
    text-align: center;
    margin: 8px 0 20px;
  }

  .gold-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, #c9ad78, transparent);
    margin-bottom: 26px;
  }

  .login-card h2 {
    text-align: center;
    font-size: 15px;
    letter-spacing: 2px;
    color: #e3d4b5;
    margin-bottom: 25px;
  }

  .login-card label {
    display: block;
    color: #c9ad78;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 1.5px;
    margin: 17px 0 8px;
  }

  .login-card input {
    width: 100%;
    padding: 14px;
    border-radius: 6px;
    border: 1px solid #555;
    background: #101010;
    color: #fff;
    outline: none;
  }

  .login-card input:focus {
    border-color: #c9ad78;
    box-shadow: 0 0 8px rgba(201,173,120,0.15);
  }

  .error-message {
    color: #e39b9b;
    font-size: 12px;
  }

  .footer {
    max-width: 1100px;
    margin: 50px auto 0;
    display: flex;
    align-items: center;
    gap: 15px;
    justify-content: center;
    color: #777;
    font-size: 9px;
    letter-spacing: 2px;
  }

  .footer span {
    color: #c9ad78;
  }

  .footer-rule {
    height: 1px;
    width: 50px;
    background: linear-gradient(90deg, transparent, #806b47);
  }

  @keyframes card-enter {
    from {
      opacity: 0;
      transform: translateX(28px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes card-exit {
    from {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateX(-45px) scale(0.97);
    }
  }

  @keyframes gold-arrival {
    0%, 100% {
      box-shadow:
        inset 0 1px rgba(255,255,255,0.07),
        0 10px 28px rgba(0,0,0,0.25);
    }
    35% {
      box-shadow:
        0 0 25px rgba(201,173,120,0.36),
        inset 0 0 20px rgba(201,173,120,0.08);
    }
  }

  @media (max-width: 650px) {
    .stats-grid {
      grid-template-columns: 1fr 1fr;
    }

    .trade-grid {
      grid-template-columns: 1fr;
    }

    .trade-middle {
      flex-direction: row;
      gap: 7px;
      padding: 2px;
    }

    .trade-middle small {
      margin-top: 0;
    }

    .top-header {
      align-items: flex-start;
    }

    .header-controls {
      width: 100%;
      justify-content: space-between;
    }

    .sound-panel {
      flex-wrap: wrap;
    }

    .submission-card {
      padding: 14px;
    }

    .queue-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .action-row {
      gap: 8px;
    }

    .action-button {
      padding: 12px 5px;
      font-size: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .submission-card,
    .submission-card.new-arrival,
    .submission-card.exit-card {
      animation: none;
    }
  }
`;
