
"use client";

import { useCallback, useEffect, useState } from "react";
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
  submission_number?: number;
  tiktok_username: string;
  submission_type: "trade" | "start_sit";
  give_players: Player[];
  get_players: Player[];
  players: Player[];
  status: "pending" | "accepted" | "declined";
  processed_at: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

const gold = "#e8c77d";

function queueName(username: string) {
  return username.length > 8
    ? `${username.slice(0, 8)}...`
    : username;
}

function PlayerBar({ player }: { player: Player }) {
  return (
    <div className="player-bar">
      {player.imageUrl ? (
        <img
          src={player.imageUrl}
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="player-placeholder">?</div>
      )}
      <div className="player-info">
        <strong>{player.name}</strong>
        <span>{player.position} · {player.team}</span>
      </div>
    </div>
  );
}

function SubmissionChip({ number }: { number?: number }) {
  return (
    <div className="chip-wrap">
      <div className="chip">
        <div className="chip-inner">
          <div className="chip-label">SUBMISSION</div>
          <div className="chip-number">
            #{number ?? "—"}
          </div>
          <div className="chip-bottom">ASK XO</div>
        </div>
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
  const [resetting, setResetting] = useState(false);
  const [view, setView] = useState<"pending" | "history">("pending");

  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);

  function playCashSound() {
    if (muted || volume === 0) return;

    const sound = new Audio("/sounds/cash-register.mp3");
    sound.volume = volume / 100;

    void sound.play().catch((error) => {
      console.warn("Could not play cash-register sound:", error);
    });
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
      setSubmissions((data || []) as Submission[]);
    }

    setLoading(false);
  }, []);

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
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) {
      setSubmissions([]);
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
          table: "submissions"
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

    setLoggingIn(true);
    setLoginError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
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
  }

  async function endStream() {
    if (!supabase || resetting || processingId) return;

    const confirmed = window.confirm(
      "END STREAM?\n\nThis permanently deletes every submission in Pending and History and restarts numbering at #1.\n\nThis cannot be undone."
    );

    if (!confirmed) return;

    setResetting(true);
    setLoadError("");

    const { error } = await supabase.rpc("reset_askxo_submissions");

    if (error) {
      console.error("Stream reset failed:", error);
      setLoadError(
        "End Stream failed. Check that the Supabase reset function has been created."
      );
      alert("End Stream failed. Your submissions have not been cleared.");
      setResetting(false);
      return;
    }

    setSubmissions([]);
    setView("pending");
    setResetting(false);

    alert(
      "STREAM ENDED!\n\nPending and History are empty. Your next submission will be #1."
    );

    await loadSubmissions();
  }

  async function processSubmission(
    item: Submission,
    status: "accepted" | "declined"
  ) {
    if (!supabase) return;

    setProcessingId(item.id);

    const { error } = await supabase
      .from("submissions")
      .update({
        status,
        processed_at: new Date().toISOString()
      })
      .eq("id", item.id);

    if (error) {
      console.error(error);
      alert("Couldn't update this submission. Please try again.");
    } else {
      if (status === "accepted") {
        playCashSound();
      }

      await loadSubmissions();
    }

    setProcessingId("");
  }

  const pending = submissions
    .filter((item) => item.status === "pending")
    .sort((a, b) =>
      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime()
    );

  const history = submissions
    .filter((item) => item.status !== "pending")
    .sort((a, b) =>
      new Date(b.processed_at || b.created_at).getTime() -
      new Date(a.processed_at || a.created_at).getTime()
    );

  const currentSubmission = pending[0] ?? null;
  const nextUp = pending.slice(1, 5);

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: 16,
    color: "#fff",
    fontFamily: "Arial, sans-serif",
    background:
      "radial-gradient(ellipse at center, #173c2c 0%, #0c241b 70%, #080e0b 100%)"
  };

  const buttonStyle: React.CSSProperties = {
    border: "1px solid #9d8049",
    borderRadius: 8,
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: 800,
    letterSpacing: 1,
    fontSize: 11
  };

  if (!supabase) {
    return (
      <main style={pageStyle}>
        <h1>ASK <span style={{ color: gold }}>XO</span></h1>
        <p>Supabase environment variables are missing. Check Vercel settings.</p>
      </main>
    );
  }

  if (checkingLogin) {
    return (
      <main style={pageStyle}>
        <h1>ASK <span style={{ color: gold }}>XO</span></h1>
        <p>Checking secure login...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="login-page" style={pageStyle}>
        <section className="login-panel">
          <h1 className="brand">
            ASK <span>XO</span>
          </h1>
          <p className="eyebrow">PRIVATE STREAMER DASHBOARD</p>
          <h2>Streamer Login</h2>

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

            {loginError && <p className="error">{loginError}</p>}

            <button
              type="submit"
              disabled={loggingIn}
              className="gold-button login-button"
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
      <div className="casino-table">
        <header className="top-bar">
          <div>
            <h1 className="brand">
              ASK <span>XO</span>
            </h1>
            <p className="eyebrow">THE WEEKEND XO TABLE</p>
          </div>

          <div className="top-controls">
            <div className="sound-control">
              <button
                className="small-control"
                onClick={() => setMuted(!muted)}
                title={muted ? "Unmute sound" : "Mute sound"}
              >
                {muted ? "🔇 MUTED" : "🔊 SOUND"}
              </button>

              <input
                aria-label="Sound volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />

              <span className="volume-number">{volume}%</span>
            </div>

            <button
              className="end-stream-button"
              onClick={endStream}
              disabled={resetting || loading || !!processingId}
            >
              {resetting ? "ENDING..." : "END STREAM"}
            </button>

            <button className="small-control" onClick={handleLogout}>
              LOG OUT
            </button>
          </div>
        </header>

        <div className="table-status">
          <span className="status-dot" />
          STREAM CONTROL CENTER
          <span className="status-divider">|</span>
          {pending.length} WAITING
          <span className="status-divider">|</span>
          {history.length} COMPLETED
        </div>

        <nav className="view-tabs">
          <button
            className={view === "pending" ? "tab active-tab" : "tab"}
            onClick={() => setView("pending")}
          >
            LIVE TABLE ({pending.length})
          </button>
          <button
            className={view === "history" ? "tab active-tab" : "tab"}
            onClick={() => setView("history")}
          >
            HISTORY ({history.length})
          </button>
          <button
            className="tab refresh-tab"
            onClick={loadSubmissions}
            disabled={loading || resetting}
          >
            {loading ? "LOADING..." : "↻ REFRESH"}
          </button>
        </nav>

        {loadError && <div className="error-banner">{loadError}</div>}

        {view === "pending" ? (
          <>
            <section className="main-table-area">
              {loading && !currentSubmission ? (
                <div className="empty-table">Loading submissions...</div>
              ) : currentSubmission ? (
                <>
                  <div className="current-heading">
                    <span className="gold-line" />
                    CURRENT SUBMISSION
                    <span className="gold-line" />
                  </div>

                  <div className="current-submission">
                    <div className="submission-content">
                      <div className="submission-topline">
                        <div>
                          <div className="username">
                            {currentSubmission.tiktok_username}
                          </div>
                          <div className="submission-time">
                            {new Date(
                              currentSubmission.created_at
                            ).toLocaleString()}
                          </div>
                        </div>
                        <span className="pending-badge">PENDING</span>
                      </div>

                      <h2 className="question-title">
                        {currentSubmission.submission_type === "trade"
                          ? "TRADE QUESTION"
                          : "START / SIT QUESTION"}
                      </h2>

                      {currentSubmission.submission_type === "trade" ? (
                        <div className="trade-grid">
                          <div className="trade-side give-side">
                            <h3>THEY GIVE</h3>
                            {currentSubmission.give_players?.length ? (
                              currentSubmission.give_players.map(
                                (player, index) => (
                                  <PlayerBar
                                    key={player.id || index}
                                    player={player}
                                  />
                                )
                              )
                            ) : (
                              <p className="no-players">No players listed</p>
                            )}
                          </div>

                          <div className="trade-side get-side">
                            <h3>THEY GET</h3>
                            {currentSubmission.get_players?.length ? (
                              currentSubmission.get_players.map(
                                (player, index) => (
                                  <PlayerBar
                                    key={player.id || index}
                                    player={player}
                                  />
                                )
                              )
                            ) : (
                              <p className="no-players">No players listed</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="start-sit-area">
                          <h3>PLAYERS TO COMPARE</h3>
                          {currentSubmission.players?.map(
                            (player, index) => (
                              <PlayerBar
                                key={player.id || index}
                                player={player}
                              />
                            )
                          )}
                        </div>
                      )}

                      <div className="decision-buttons">
                        <button
                          disabled={!!processingId || resetting}
                          onClick={() =>
                            processSubmission(currentSubmission, "accepted")
                          }
                          className="accept-button"
                        >
                          {processingId === currentSubmission.id
                            ? "PROCESSING..."
                            : "✓ ACCEPT"}
                        </button>

                        <button
                          disabled={!!processingId || resetting}
                          onClick={() =>
                            processSubmission(currentSubmission, "declined")
                          }
                          className="decline-button"
                        >
                          {processingId === currentSubmission.id
                            ? "PROCESSING..."
                            : "✕ DECLINE"}
                        </button>
                      </div>
                    </div>

                    <SubmissionChip
                      number={currentSubmission.submission_number}
                    />
                  </div>
                </>
              ) : (
                <div className="empty-table">
                  <div className="empty-chip">XO</div>
                  <h2>THE TABLE IS WAITING</h2>
                  <p>No pending submissions right now.</p>
                  <span>New questions will appear here automatically.</span>
                </div>
              )}
            </section>

            <section className="queue-section">
              <div className="queue-label">NEXT UP</div>

              {Array.from({ length: 4 }).map((_, index) => {
                const item = nextUp[index];

                return (
                  <div
                    className={item ? "queue-name" : "queue-name queue-empty"}
                    key={item?.id || `empty-${index}`}
                    title={item?.tiktok_username || "Waiting for submission"}
                  >
                    {item
                      ? queueName(item.tiktok_username)
                      : "WAITING..."}
                  </div>
                );
              })}
            </section>

            <p className="queue-note">
              NEXT FOUR SUBMISSIONS · FIRST IN, FIRST UP
            </p>
          </>
        ) : (
          <section className="history-area">
            <div className="current-heading">
              <span className="gold-line" />
              COMPLETED SUBMISSIONS
              <span className="gold-line" />
            </div>

            {history.length === 0 ? (
              <div className="empty-table">
                <h2>NO HISTORY YET</h2>
                <p>Accepted and declined submissions will appear here.</p>
              </div>
            ) : (
              history.map((item) => (
                <article className="history-item" key={item.id}>
                  <div className="history-top">
                    <div>
                      <strong className="username">
                        {item.tiktok_username}
                      </strong>
                      <p className="submission-time">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="history-right">
                      <span className="history-number">
                        #{item.submission_number ?? "—"}
                      </span>
                      <span
                        className={
                          item.status === "accepted"
                            ? "accepted-badge"
                            : "declined-badge"
                        }
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <h3 className="history-type">
                    {item.submission_type === "trade"
                      ? "TRADE QUESTION"
                      : "START / SIT QUESTION"}
                  </h3>

                  {item.submission_type === "trade" ? (
                    <div className="trade-grid">
                      <div className="trade-side give-side">
                        <h3>THEY GIVE</h3>
                        {item.give_players?.map((player, index) => (
                          <PlayerBar
                            key={player.id || index}
                            player={player}
                          />
                        ))}
                      </div>
                      <div className="trade-side get-side">
                        <h3>THEY GET</h3>
                        {item.get_players?.map((player, index) => (
                          <PlayerBar
                            key={player.id || index}
                            player={player}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="start-sit-area">
                      {item.players?.map((player, index) => (
                        <PlayerBar
                          key={player.id || index}
                          player={player}
                        />
                      ))}
                    </div>
                  )}
                </article>
              ))
            )}
          </section>
        )}

        <footer className="table-footer">
          ASK XO <span>·</span> PRIVATE STREAMER CONTROL
        </footer>
      </div>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  * {
    box-sizing: border-box;
  }

  .casino-table {
    width: 100%;
    min-height: calc(100vh - 32px);
    max-width: 1800px;
    margin: 0 auto;
    padding: 24px;
    border: 5px solid #9d7a3d;
    border-radius: 34px;
    outline: 2px solid #d6b76e;
    outline-offset: -12px;
    background:
      radial-gradient(ellipse at 50% 42%, rgba(50,112,75,.48), transparent 65%),
      repeating-linear-gradient(115deg, rgba(255,255,255,.012) 0px, rgba(255,255,255,.012) 1px, transparent 2px, transparent 5px),
      radial-gradient(ellipse at center, #20543b 0%, #123b2b 62%, #0b2a1e 100%);
    box-shadow:
      inset 0 0 0 5px #192019,
      inset 0 0 70px rgba(0,0,0,.6),
      0 20px 70px rgba(0,0,0,.65);
    position: relative;
    overflow: hidden;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    padding: 4px 12px 20px;
    border-bottom: 1px solid rgba(232,199,125,.38);
  }

  .brand {
    color: #f3f1eb;
    font-size: clamp(30px, 4vw, 43px);
    font-weight: 900;
    letter-spacing: 3px;
    margin: 0;
    text-shadow: 0 2px 8px rgba(0,0,0,.5);
  }

  .brand span {
    color: ${gold};
  }

  .eyebrow {
    color: #c9b98f;
    font-size: 10px;
    letter-spacing: 4px;
    margin: 7px 0 0;
  }

  .top-controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .sound-control {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    background: rgba(0,0,0,.24);
    border: 1px solid rgba(232,199,125,.42);
    border-radius: 9px;
  }

  .sound-control input {
    width: 85px;
    accent-color: ${gold};
    cursor: pointer;
  }

  .volume-number {
    min-width: 34px;
    color: #e5d5ad;
    font-size: 10px;
  }

  .small-control, .end-stream-button {
    padding: 10px 12px;
    border-radius: 8px;
    background: linear-gradient(#343a35, #171d19);
    color: #f4ead2;
    border: 1px solid #92794d;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 1px;
    cursor: pointer;
  }

  .end-stream-button {
    background: linear-gradient(#853c32, #4e211d);
    border-color: #c17b62;
    color: #fff2e8;
  }

  button:disabled {
    opacity: .45;
    cursor: not-allowed;
  }

  .table-status {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    padding: 16px 8px 10px;
    color: #e3d2a9;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #78d28d;
    box-shadow: 0 0 10px #78d28d;
  }

  .status-divider {
    color: #8d7950;
  }

  .view-tabs {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 9px;
    margin: 8px 0 20px;
  }

  .tab {
    padding: 10px 16px;
    border-radius: 7px;
    border: 1px solid rgba(232,199,125,.45);
    background: rgba(0,0,0,.22);
    color: #e8d8b5;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 1px;
    cursor: pointer;
  }

  .active-tab {
    color: #17140e;
    background: linear-gradient(135deg, #f0d99c, #b58b49);
    border-color: #f5dda1;
    box-shadow: 0 0 13px rgba(232,199,125,.2);
  }

  .refresh-tab {
    margin-left: 10px;
  }

  .main-table-area {
    min-height: 380px;
    padding: 12px 0 20px;
  }

  .current-heading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    color: #f0dba8;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 4px;
    text-align: center;
    margin: 8px 0 22px;
  }

  .gold-line {
    width: min(15vw, 130px);
    height: 1px;
    background: linear-gradient(90deg, transparent, #d4b46d);
  }

  .gold-line:last-child {
    transform: rotate(180deg);
  }

  .current-submission {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 210px;
    align-items: center;
    gap: 25px;
    max-width: 1250px;
    margin: 0 auto;
    padding: 24px;
    border: 1px solid rgba(226,195,128,.55);
    border-radius: 20px;
    background: linear-gradient(145deg, rgba(8,26,18,.82), rgba(15,48,33,.82));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.07),
      0 12px 30px rgba(0,0,0,.24);
  }

  .submission-content {
    min-width: 0;
  }

  .submission-topline, .history-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .username {
    color: #f1d38e;
    font-size: 21px;
    font-weight: 900;
    overflow-wrap: anywhere;
  }

  .submission-time {
    color: #b5b7ad;
    font-size: 11px;
    margin: 5px 0;
  }

  .pending-badge, .accepted-badge, .declined-badge {
    padding: 7px 12px;
    border: 1px solid #d3b16b;
    border-radius: 30px;
    color: #f0d89f;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 1px;
  }

  .question-title {
    color: #f2e9d5;
    font-size: 14px;
    letter-spacing: 3px;
    margin: 22px 0 13px;
  }

  .trade-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 13px;
  }

  .trade-side {
    min-width: 0;
    padding: 13px;
    border-radius: 12px;
  }

  .trade-side h3, .start-sit-area h3 {
    font-size: 12px;
    letter-spacing: 2px;
    margin: 0 0 12px;
  }

  .give-side {
    background: rgba(75,35,32,.48);
    border: 1px solid rgba(187,105,89,.55);
  }

  .give-side h3 {
    color: #e7a49a;
  }

  .get-side {
    background: rgba(24,67,43,.55);
    border: 1px solid rgba(113,175,123,.55);
  }

  .get-side h3 {
    color: #a4e1ad;
  }

  .player-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    margin-bottom: 7px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 8px;
    background: rgba(0,0,0,.28);
    min-width: 0;
  }

  .player-bar img, .player-placeholder {
    width: 43px;
    height: 43px;
    flex-shrink: 0;
    border-radius: 50%;
    object-fit: cover;
    background: #38483e;
    border: 1px solid rgba(232,199,125,.4);
  }

  .player-placeholder {
    display: grid;
    place-items: center;
    color: #e8c77d;
    font-weight: 900;
  }

  .player-info {
    min-width: 0;
  }

  .player-info strong {
    display: block;
    color: #fff;
    font-size: 13px;
    overflow-wrap: anywhere;
  }

  .player-info span {
    display: block;
    color: #c3c5bd;
    font-size: 10px;
    margin-top: 4px;
  }

  .no-players {
    color: #c5bda9;
    font-size: 12px;
  }

  .start-sit-area {
    max-width: 700px;
    padding: 15px;
    border: 1px solid rgba(232,199,125,.35);
    border-radius: 12px;
    background: rgba(0,0,0,.2);
  }

  .start-sit-area h3 {
    color: #e8c77d;
  }

  .decision-buttons {
    display: flex;
    gap: 12px;
    margin-top: 17px;
  }

  .decision-buttons button {
    flex: 1;
    padding: 14px;
    border-radius: 9px;
    color: white;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 2px;
    cursor: pointer;
  }

  .accept-button {
    border: 1px solid #8ac69b;
    background: linear-gradient(135deg, #28764a, #16452e);
    box-shadow: 0 4px 14px rgba(0,0,0,.2);
  }

  .decline-button {
    border: 1px solid #c98275;
    background: linear-gradient(135deg, #8b4038, #542622);
    box-shadow: 0 4px 14px rgba(0,0,0,.2);
  }

  .chip-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .chip {
    width: 190px;
    height: 190px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    padding: 13px;
    background:
      repeating-conic-gradient(
        from 0deg,
        #e7d29d 0deg 9deg,
        #76572c 9deg 13deg,
        #e7d29d 13deg 22deg
      );
    box-shadow:
      0 12px 28px rgba(0,0,0,.6),
      inset 0 0 0 3px #f4dfaa,
      inset 0 0 0 7px #6b512e;
  }

  .chip-inner {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 3px double #d9bd7c;
    background:
      radial-gradient(circle at 35% 28%, #3b4540, #141a17 70%);
    box-shadow: inset 0 0 20px rgba(0,0,0,.8);
  }

  .chip-label, .chip-bottom {
    color: #d9c18b;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 3px;
  }

  .chip-number {
    color: #f6dfaa;
    font-size: 43px;
    font-weight: 900;
    text-shadow: 0 2px 10px rgba(0,0,0,.8);
    margin: 5px 0;
  }

  .empty-table {
    min-height: 310px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #d9cba9;
    border: 1px dashed rgba(232,199,125,.35);
    border-radius: 16px;
    background: rgba(0,0,0,.12);
    padding: 25px;
  }

  .empty-table h2 {
    color: #f0d89f;
    letter-spacing: 3px;
    font-size: 16px;
  }

  .empty-table p, .empty-table span {
    color: #c0c5bc;
    font-size: 12px;
  }

  .empty-chip {
    display: grid;
    place-items: center;
    width: 75px;
    height: 75px;
    border-radius: 50%;
    border: 5px dashed #c9a762;
    color: #f0d89f;
    font-size: 22px;
    font-weight: 900;
  }

  .queue-section {
    display: grid;
    grid-template-columns: 120px repeat(4, minmax(0, 1fr));
    gap: 10px;
    align-items: stretch;
    margin-top: 24px;
    padding: 12px;
    border: 1px solid #b18b50;
    border-radius: 12px;
    background: linear-gradient(90deg, rgba(8,19,13,.88), rgba(19,54,37,.85));
    box-shadow: inset 0 0 15px rgba(0,0,0,.3);
  }

  .queue-label, .queue-name {
    min-width: 0;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 9px;
    border-radius: 7px;
    text-align: center;
    overflow: hidden;
  }

  .queue-label {
    background: linear-gradient(135deg, #f0d99c, #b58b49);
    color: #211b10;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1px;
  }

  .queue-name {
    border: 1px solid rgba(232,199,125,.48);
    background: rgba(37,78,54,.8);
    color: #fff3d7;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .queue-empty {
    color: #a8b4a8;
    border-style: dashed;
    background: rgba(0,0,0,.14);
    font-size: 10px;
    letter-spacing: 1px;
  }

  .queue-note {
    color: #bca77c;
    font-size: 9px;
    text-align: center;
    letter-spacing: 2px;
    margin: 9px 0 0;
  }

  .history-area {
    max-width: 1250px;
    margin: 0 auto;
    padding: 10px 0 25px;
  }

  .history-item {
    margin-bottom: 14px;
    padding: 18px;
    border: 1px solid rgba(232,199,125,.3);
    border-radius: 12px;
    background: rgba(4,19,12,.65);
  }

  .history-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .history-number {
    color: #e8c77d;
    font-weight: 900;
  }

  .accepted-badge {
    color: #a4e1ad;
    border-color: #5d9c6d;
  }

  .declined-badge {
    color: #e7a49a;
    border-color: #a65e53;
  }

  .history-type {
    color: #e8c77d;
    font-size: 11px;
    letter-spacing: 2px;
    margin: 16px 0 10px;
  }

  .table-footer {
    padding: 25px 0 5px;
    text-align: center;
    color: #bba77d;
    font-size: 10px;
    letter-spacing: 3px;
  }

  .table-footer span {
    color: #f0d89f;
    padding: 0 5px;
  }

  .error-banner {
    margin: 12px 0;
    padding: 12px;
    border: 1px solid #b45c50;
    border-radius: 8px;
    color: #ffd0c8;
    background: rgba(100,25,20,.5);
    font-size: 12px;
  }

  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .login-panel {
    width: 100%;
    max-width: 420px;
    padding: 30px;
    border: 2px solid #a8874c;
    border-radius: 18px;
    background: linear-gradient(145deg, #172a20, #101713);
    box-shadow: 0 15px 50px rgba(0,0,0,.5);
  }

  .login-panel .brand {
    text-align: center;
    font-size: 42px;
  }

  .login-panel .eyebrow {
    text-align: center;
    margin-bottom: 28px;
  }

  .login-panel h2 {
    text-align: center;
    color: #f1dfb8;
    margin-bottom: 24px;
  }

  .login-panel label {
    display: block;
    color: #e5d4ad;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 2px;
    margin: 15px 0 7px;
  }

  .login-panel input {
    width: 100%;
    padding: 14px;
    border: 1px solid #6d715e;
    border-radius: 8px;
    background: #101a14;
    color: white;
    outline: none;
  }

  .login-button {
    width: 100%;
    margin-top: 20px;
    padding: 14px;
    border: 0;
    border-radius: 8px;
    background: linear-gradient(135deg, #f0d99c, #b58b49);
    color: #20190e;
    font-weight: 900;
    letter-spacing: 1px;
    cursor: pointer;
  }

  .error {
    color: #ff9999;
    font-size: 12px;
  }

  @media (max-width: 800px) {
    .casino-table {
      padding: 17px;
      border-width: 3px;
      border-radius: 22px;
    }

    .current-submission {
      grid-template-columns: 1fr;
    }

    .chip-wrap {
      grid-row: 1;
    }

    .chip {
      width: 130px;
      height: 130px;
    }

    .chip-number {
      font-size: 31px;
    }

    .trade-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .top-controls {
      justify-content: flex-start;
      width: 100%;
    }

    .sound-control {
      flex-wrap: wrap;
    }

    .queue-section {
      grid-template-columns: 1fr 1fr;
    }

    .queue-label {
      grid-column: 1 / -1;
    }

    .queue-name {
      min-height: 42px;
    }

    .decision-buttons {
      flex-direction: column;
    }

    .current-submission {
      padding: 15px;
    }

    .table-status {
      font-size: 9px;
      letter-spacing: 1px;
    }

    .refresh-tab {
      margin-left: 0;
    }
  }
`;
