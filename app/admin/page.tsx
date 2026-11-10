
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

const gold = "#e8b84d";

function PlayerBar({ player }: { player: Player }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      background: "#202020",
      border: "1px solid #383838",
      borderRadius: 10,
      padding: 10,
      marginBottom: 8
    }}>
      <img
        src={player.imageUrl}
        alt=""
        onError={(e) => {
          e.currentTarget.style.visibility = "hidden";
        }}
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          objectFit: "cover",
          background: "#444",
          flexShrink: 0
        }}
      />

      <div style={{ minWidth: 0 }}>
        <strong style={{ display: "block", fontSize: 14 }}>
          {player.name}
        </strong>
        <span style={{ color: "#aaa", fontSize: 12 }}>
          {player.position} · {player.team}
        </span>
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
      await loadSubmissions();
    }

    setProcessingId("");
  }

  const pending = submissions.filter(
    item => item.status === "pending"
  );

  const history = submissions.filter(
    item => item.status !== "pending"
  );

  const visibleItems = view === "pending" ? pending : history;

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    background: "#101010",
    color: "white",
    padding: "24px 16px",
    fontFamily: "Arial, sans-serif"
  };

  const buttonStyle: React.CSSProperties = {
    border: "1px solid #555",
    borderRadius: 8,
    padding: "12px 18px",
    cursor: "pointer",
    fontWeight: 800,
    letterSpacing: 1
  };

  if (!supabase) {
    return (
      <main style={pageStyle}>
        <h1>ASK<span style={{ color: gold }}>XO</span></h1>
        <p style={{ color: "#ff9999" }}>
          Supabase environment variables are missing.
          Check your Vercel project settings.
        </p>
      </main>
    );
  }

  if (checkingLogin) {
    return (
      <main style={pageStyle}>
        <h1>ASK<span style={{ color: gold }}>XO</span></h1>
        <p>Checking secure login...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={{
        ...pageStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <section style={{
          width: "100%",
          maxWidth: 420,
          background: "#191919",
          border: "1px solid #80652e",
          borderRadius: 16,
          padding: 28
        }}>
          <h1 style={{
            textAlign: "center",
            fontSize: 42,
            margin: "0 0 5px"
          }}>
            ASK<span style={{ color: gold }}>XO</span>
          </h1>

          <p style={{
            textAlign: "center",
            color: "#aaa",
            letterSpacing: 3,
            fontSize: 11,
            marginBottom: 30
          }}>
            PRIVATE STREAMER DASHBOARD
          </p>

          <h2 style={{ textAlign: "center" }}>
            Streamer Login
          </h2>

          <form onSubmit={handleLogin}>
            <label style={{ display: "block", marginBottom: 7 }}>
              EMAIL
            </label>

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Your Supabase login email"
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 14,
                marginBottom: 18,
                borderRadius: 8,
                border: "1px solid #555",
                background: "#252525",
                color: "white"
              }}
            />

            <label style={{ display: "block", marginBottom: 7 }}>
              PASSWORD
            </label>

            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your password"
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 14,
                marginBottom: 20,
                borderRadius: 8,
                border: "1px solid #555",
                background: "#252525",
                color: "white"
              }}
            />

            {loginError && (
              <p style={{ color: "#ff7777" }}>
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              style={{
                ...buttonStyle,
                width: "100%",
                background: gold,
                color: "#111",
                border: "none"
              }}
            >
              {loggingIn ? "SIGNING IN..." : "ENTER DASHBOARD"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <header style={{
        maxWidth: 1100,
        margin: "0 auto 30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 15,
        flexWrap: "wrap"
      }}>
        <div>
          <h1 style={{
            fontSize: 38,
            margin: 0
          }}>
            ASK<span style={{ color: gold }}>XO</span>
          </h1>
          <p style={{
            color: "#aaa",
            fontSize: 11,
            letterSpacing: 3,
            marginTop: 5
          }}>
            PRIVATE STREAMER DASHBOARD
          </p>
        </div>

        <button
          onClick={handleLogout}
          style={{
            ...buttonStyle,
            background: "#292929",
            color: "white"
          }}
        >
          LOG OUT
        </button>
      </header>

      <section style={{
        maxWidth: 1100,
        margin: "0 auto"
      }}>
        <div style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 24
        }}>
          <div style={{
            flex: 1,
            minWidth: 130,
            background: "#1d1d1d",
            border: "1px solid #80652e",
            borderRadius: 12,
            padding: 18
          }}>
            <div style={{ color: "#aaa", fontSize: 12 }}>
              PENDING QUESTIONS
            </div>
            <strong style={{
              fontSize: 34,
              color: gold
            }}>
              {pending.length}
            </strong>
          </div>

          <div style={{
            flex: 1,
            minWidth: 130,
            background: "#1d1d1d",
            border: "1px solid #383838",
            borderRadius: 12,
            padding: 18
          }}>
            <div style={{ color: "#aaa", fontSize: 12 }}>
              COMPLETED QUESTIONS
            </div>
            <strong style={{ fontSize: 34 }}>
              {history.length}
            </strong>
          </div>
        </div>

        <div style={{
          display: "flex",
          gap: 10,
          marginBottom: 22,
          flexWrap: "wrap"
        }}>
          <button
            onClick={() => setView("pending")}
            style={{
              ...buttonStyle,
              background: view === "pending" ? gold : "#292929",
              color: view === "pending" ? "#111" : "white"
            }}
          >
            PENDING ({pending.length})
          </button>

          <button
            onClick={() => setView("history")}
            style={{
              ...buttonStyle,
              background: view === "history" ? gold : "#292929",
              color: view === "history" ? "#111" : "white"
            }}
          >
            HISTORY ({history.length})
          </button>

          <button
            onClick={loadSubmissions}
            style={{
              ...buttonStyle,
              background: "#292929",
              color: "white",
              marginLeft: "auto"
            }}
          >
            ↻ REFRESH
          </button>
        </div>

        {loading && (
          <p style={{ color: "#aaa" }}>
            Loading submissions...
          </p>
        )}

        {loadError && (
          <p style={{ color: "#ff8888" }}>
            {loadError}
          </p>
        )}

        {!loading && visibleItems.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: 45,
            background: "#191919",
            borderRadius: 12,
            color: "#aaa"
          }}>
            {view === "pending"
              ? "No pending questions. Waiting for the next one..."
              : "No completed questions yet."}
          </div>
        )}

        {visibleItems.map(item => (
          <article
            key={item.id}
            style={{
              background: "#191919",
              border: item.status === "pending"
                ? "1px solid #80652e"
                : "1px solid #383838",
              borderRadius: 14,
              padding: 20,
              marginBottom: 18,
              boxShadow: item.status === "pending"
                ? "0 0 16px rgba(232,184,77,0.08)"
                : "none"
            }}
          >
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap"
            }}>
              <div>
                <strong style={{
                  fontSize: 20,
                  color: gold
                }}>
                  {item.tiktok_username}
                </strong>
                <p style={{
                  color: "#999",
                  fontSize: 12,
                  margin: "5px 0"
                }}>
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </div>

              <span style={{
                color: item.status === "accepted"
                  ? "#65d58a"
                  : item.status === "declined"
                    ? "#ff7777"
                    : gold,
                border: "1px solid currentColor",
                borderRadius: 20,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 800
              }}>
                {item.status.toUpperCase()}
              </span>
            </div>

            <h2 style={{
              fontSize: 17,
              letterSpacing: 2,
              marginTop: 20
            }}>
              {item.submission_type === "trade"
                ? "TRADE QUESTION"
                : "START / SIT QUESTION"}
            </h2>

            {item.submission_type === "trade" ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: 16
              }}>
                <div style={{
                  background: "#251b1b",
                  border: "1px solid #673737",
                  borderRadius: 10,
                  padding: 12
                }}>
                  <h3 style={{
                    color: "#ff8888",
                    letterSpacing: 2,
                    fontSize: 14
                  }}>
                    THEY GIVE
                  </h3>

                  {item.give_players?.map((player, index) => (
                    <PlayerBar
                      key={player.id || index}
                      player={player}
                    />
                  ))}
                </div>

                <div style={{
                  background: "#17251c",
                  border: "1px solid #386b46",
                  borderRadius: 10,
                  padding: 12
                }}>
                  <h3 style={{
                    color: "#65d58a",
                    letterSpacing: 2,
                    fontSize: 14
                  }}>
                    THEY GET
                  </h3>

                  {item.get_players?.map((player, index) => (
                    <PlayerBar
                      key={player.id || index}
                      player={player}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ color: gold }}>
                  PLAYERS TO COMPARE
                </h3>

                {item.players?.map((player, index) => (
                  <PlayerBar
                    key={player.id || index}
                    player={player}
                  />
                ))}
              </div>
            )}

            {item.status === "pending" && (
              <div style={{
                display: "flex",
                gap: 12,
                marginTop: 22
              }}>
                <button
                  disabled={processingId === item.id}
                  onClick={() => processSubmission(item, "accepted")}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    background: "#176b37",
                    color: "white",
                    border: "1px solid #39965c"
                  }}
                >
                  {processingId === item.id ? "..." : "✓ ACCEPT"}
                </button>

                <button
                  disabled={processingId === item.id}
                  onClick={() => processSubmission(item, "declined")}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    background: "#782929",
                    color: "white",
                    border: "1px solid #a34a4a"
                  }}
                >
                  {processingId === item.id ? "..." : "✕ DECLINE"}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>

      <footer style={{
        textAlign: "center",
        color: "#666",
        fontSize: 11,
        letterSpacing: 2,
        marginTop: 50
      }}>
        ASKXO · PRIVATE STREAMER CONTROL
      </footer>
    </main>
  );
}
