
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type Player = {
  id: string;
  name: string;
  position: string;
  team: string;
  imageUrl: string;
};

type QuestionType = "Trade" | "Start/Sit";

type PlayerPickerProps = {
  label: string;
  players: Player[];
  value: string;
  excludedIds: string[];
  onChange: (id: string) => void;
};

function PlayerPicker({
  label,
  players,
  value,
  excludedIds,
  onChange
}: PlayerPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = players.find((p) => p.id === value);

  const matches = query.trim()
    ? players.filter((player) =>
        player.name.toLowerCase().includes(query.toLowerCase()) &&
        (!excludedIds.includes(player.id) || player.id === value)
      ).slice(0, 8)
    : [];

  return (
    <div style={{ marginBottom: 18, position: "relative" }}>
      <label>{label}</label>

      {selected && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 10,
          background: "#252525",
          border: "1px solid #e8b84d",
          borderRadius: 10,
          marginBottom: 8
        }}>
          <img
            src={selected.imageUrl}
            alt=""
            onError={(e) => {
              e.currentTarget.style.visibility = "hidden";
            }}
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              objectFit: "cover",
              background: "#444"
            }}
          />

          <div style={{ flex: 1 }}>
            <strong>{selected.name}</strong>
            <div style={{ color: "#aaa", fontSize: 12 }}>
              {selected.position} · {selected.team}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            style={{
              width: "auto",
              padding: 8,
              background: "#444",
              color: "white"
            }}
          >
            Remove
          </button>
        </div>
      )}

      <input
        type="search"
        value={query}
        placeholder="Type a player's name..."
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />

      {open && query.trim() !== "" && (
        <div style={{
          background: "#202020",
          border: "1px solid #444",
          borderRadius: 10,
          maxHeight: 320,
          overflowY: "auto",
          marginTop: -8,
          marginBottom: 12,
          position: "relative",
          zIndex: 10
        }}>
          {matches.length > 0 ? (
            matches.map((player) => (
              <button
                type="button"
                key={player.id}
                onClick={() => {
                  onChange(player.id);
                  setQuery("");
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: 10,
                  background: "transparent",
                  color: "white",
                  borderBottom: "1px solid #383838",
                  borderRadius: 0,
                  textAlign: "left",
                  letterSpacing: 0
                }}
              >
                <img
                  src={player.imageUrl}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.visibility = "hidden";
                  }}
                  style={{
                    width: 45,
                    height: 45,
                    borderRadius: "50%",
                    objectFit: "cover",
                    background: "#444"
                  }}
                />

                <span style={{ flex: 1 }}>
                  <strong>{player.name}</strong>
                  <span style={{
                    display: "block",
                    fontSize: 11,
                    color: "#aaa",
                    marginTop: 3
                  }}>
                    {player.position} · {player.team}
                  </span>
                </span>

                <span style={{ color: "#e8b84d" }}>+</span>
              </button>
            ))
          ) : (
            <p style={{
              padding: 15,
              color: "#aaa",
              fontSize: 13
            }}>
              No matching players found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [tiktok, setTiktok] = useState("");
  const [type, setType] = useState<QuestionType | null>(null);
  const [comments, setComments] = useState("");

  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [playerError, setPlayerError] = useState("");
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [sending, setSending] = useState<string[]>([""]);
  const [receiving, setReceiving] = useState<string[]>([""]);
  const [startSit, setStartSit] = useState<string[]>(["", ""]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      setLoadingPlayers(true);
      setPlayerError("");

      try {
        const response = await fetch("/api/players");

        if (!response.ok) {
          throw new Error("Player database could not load.");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Invalid player data.");
        }

        if (!cancelled) {
          setPlayers(data);
        }
      } catch {
        if (!cancelled) {
          setPlayerError(
            "We couldn't load the ESPN player list. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingPlayers(false);
        }
      }
    }

    loadPlayers();

    return () => {
      cancelled = true;
    };
  }, [retry]);

  function addPlayer(
    list: string[],
    setter: (value: string[]) => void,
    max: number
  ) {
    if (list.length < max) {
      setter([...list, ""]);
    }
  }

  function updatePlayer(
    list: string[],
    setter: (value: string[]) => void,
    index: number,
    value: string
  ) {
    setter(list.map((p, i) => i === index ? value : p));
  }

  function removePlayer(
    list: string[],
    setter: (value: string[]) => void,
    index: number
  ) {
    if (list.length > 1) {
      setter(list.filter((_, i) => i !== index));
    }
  }

  function chooseQuestion(question: QuestionType) {
    if (!tiktok.trim()) {
      alert("Please enter your TikTok username first.");
      return;
    }

    setType(question);
    setStep(2);
  }

  async function submitQuestion() {
    if (submitting) return;

    if (!tiktok.trim()) {
      alert("Please enter your TikTok username.");
      return;
    }

    const username = tiktok.trim().startsWith("@")
      ? tiktok.trim()
      : "@" + tiktok.trim();

    if (!type) {
      alert("Please choose a question type.");
      return;
    }

    let givePlayers: Player[] = [];
    let getPlayers: Player[] = [];
    let selectedPlayers: Player[] = [];

    if (type === "Trade") {
      const send = sending.filter(Boolean);
      const receive = receiving.filter(Boolean);

      if (!send.length || !receive.length) {
        alert("Choose at least one player on each side.");
        return;
      }

      givePlayers = send
        .map(id => players.find(p => p.id === id))
        .filter((p): p is Player => Boolean(p));

      getPlayers = receive
        .map(id => players.find(p => p.id === id))
        .filter((p): p is Player => Boolean(p));

      if (
        givePlayers.length !== send.length ||
        getPlayers.length !== receive.length
      ) {
        alert("One of the selected players could not be found. Please select them again.");
        return;
      }
    } else {
      const selected = startSit.filter(Boolean);

      if (selected.length < 2 || selected.length > 5) {
        alert("Choose between 2 and 5 players.");
        return;
      }

      selectedPlayers = selected
        .map(id => players.find(p => p.id === id))
        .filter((p): p is Player => Boolean(p));

      if (selectedPlayers.length !== selected.length) {
        alert("One of the selected players could not be found. Please select them again.");
        return;
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      alert("The submission system is not configured yet. Please try again later.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase
        .from("submissions")
        .insert({
          tiktok_username: username,
          submission_type: type === "Trade" ? "trade" : "start_sit",
          give_players: givePlayers,
          get_players: getPlayers,
          players: selectedPlayers,
          comments: comments.trim() || null
        });

      if (error) {
        console.error("Supabase submission error:", error);
        alert("Your question could not be submitted. Please try again.");
        return;
      }

      alert("Your question has been submitted!");

      setStep(1);
      setTiktok("");
      setType(null);
      setComments("");
      setSending([""]);
      setReceiving([""]);
      setStartSit(["", ""]);
    } catch (error) {
      console.error("Submission error:", error);
      alert("Something went wrong while submitting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const allSelected = [...sending, ...receiving];

  const addButtonStyle = {
    background: "#292929",
    color: "#e8b84d",
    border: "1px solid #555",
    padding: 11,
    marginTop: 5
  };

  const backButtonStyle = {
    background: "#292929",
    color: "white",
    marginBottom: 20
  };

  const commentsBox = (
    <div style={{ marginTop: 24, marginBottom: 18 }}>
      <label>TEAM DETAILS / COMMENTS (OPTIONAL)</label>
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        placeholder="Add your team record, injuries, matchups, concerns, or anything else we should know..."
        rows={5}
        maxLength={1500}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: 14,
          marginTop: 8,
          borderRadius: 10,
          border: "1px solid #555",
          background: "#202020",
          color: "white",
          font: "inherit",
          resize: "vertical"
        }}
      />
      <div style={{
        textAlign: "right",
        color: "#888",
        fontSize: 11,
        marginTop: 5
      }}>
        {comments.length}/1500
      </div>
    </div>
  );

  return (
    <main>
      <header>
        <h1>ASK<span>XO</span></h1>
        <p>THE FANTASY QUESTION CENTER</p>
      </header>

      {step === 1 && (
        <section className="panel">
          <h2>Welcome to ASKXO</h2>

          <label>YOUR EXACT TIKTOK @</label>
          <input
            value={tiktok}
            onChange={e => setTiktok(e.target.value)}
            placeholder="@yourtiktokusername"
          />

          <h3>WHAT ARE YOU ASKING?</h3>

          <button
            onClick={() => chooseQuestion("Trade")}
            style={{ marginBottom: 14 }}
          >
            ↔ TRADE QUESTION
          </button>

          <button
            onClick={() => chooseQuestion("Start/Sit")}
          >
            ★ START / SIT QUESTION
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="panel">
          <button
            style={backButtonStyle}
            onClick={() => setStep(1)}
          >
            ← BACK
          </button>

          {loadingPlayers && (
            <p className="empty">Loading ESPN players...</p>
          )}

          {playerError && (
            <div>
              <p style={{ color: "#ff9999" }}>{playerError}</p>
              <button onClick={() => setRetry(r => r + 1)}>
                TRY AGAIN
              </button>
            </div>
          )}

          {!loadingPlayers && !playerError && players.length > 0 && (
            <>
              {type === "Trade" && (
                <>
                  <h2>Submit Your Trade</h2>
                  <p>Search and select up to 4 players on each side.</p>

                  <h3>YOU SEND</h3>

                  {sending.map((id, index) => (
                    <div key={`send-${index}`}>
                      <PlayerPicker
                        label={`Player ${index + 1}`}
                        players={players}
                        value={id}
                        excludedIds={allSelected}
                        onChange={value =>
                          updatePlayer(sending, setSending, index, value)
                        }
                      />

                      {sending.length > 1 && (
                        <button
                          style={addButtonStyle}
                          onClick={() =>
                            removePlayer(sending, setSending, index)
                          }
                        >
                          REMOVE PLAYER
                        </button>
                      )}
                    </div>
                  ))}

                  {sending.length < 4 && (
                    <button
                      style={addButtonStyle}
                      onClick={() =>
                        addPlayer(sending, setSending, 4)
                      }
                    >
                      + ADD PLAYER
                    </button>
                  )}

                  <h3>YOU RECEIVE</h3>

                  {receiving.map((id, index) => (
                    <div key={`receive-${index}`}>
                      <PlayerPicker
                        label={`Player ${index + 1}`}
                        players={players}
                        value={id}
                        excludedIds={allSelected}
                        onChange={value =>
                          updatePlayer(receiving, setReceiving, index, value)
                        }
                      />

                      {receiving.length > 1 && (
                        <button
                          style={addButtonStyle}
                          onClick={() =>
                            removePlayer(receiving, setReceiving, index)
                          }
                        >
                          REMOVE PLAYER
                        </button>
                      )}
                    </div>
                  ))}

                  {receiving.length < 4 && (
                    <button
                      style={addButtonStyle}
                      onClick={() =>
                        addPlayer(receiving, setReceiving, 4)
                      }
                    >
                      + ADD PLAYER
                    </button>
                  )}

                  {commentsBox}

                  <button
                    style={{ marginTop: 22 }}
                    onClick={submitQuestion}
                    disabled={submitting}
                  >
                    {submitting ? "SUBMITTING..." : "SUBMIT TRADE QUESTION"}
                  </button>
                </>
              )}

              {type === "Start/Sit" && (
                <>
                  <h2>Start / Sit Question</h2>
                  <p>Choose between 2 and 5 players to compare.</p>

                  {startSit.map((id, index) => (
                    <div key={`start-${index}`}>
                      <PlayerPicker
                        label={`Player ${index + 1}`}
                        players={players}
                        value={id}
                        excludedIds={startSit}
                        onChange={value =>
                          updatePlayer(startSit, setStartSit, index, value)
                        }
                      />

                      {startSit.length > 2 && (
                        <button
                          style={addButtonStyle}
                          onClick={() =>
                            removePlayer(startSit, setStartSit, index)
                          }
                        >
                          REMOVE PLAYER
                        </button>
                      )}
                    </div>
                  ))}

                  {startSit.length < 5 && (
                    <button
                      style={addButtonStyle}
                      onClick={() =>
                        addPlayer(startSit, setStartSit, 5)
                      }
                    >
                      + ADD PLAYER
                    </button>
                  )}

                  {commentsBox}

                  <button
                    style={{ marginTop: 22 }}
                    onClick={submitQuestion}
                    disabled={submitting}
                  >
                    {submitting ? "SUBMITTING..." : "SUBMIT START / SIT QUESTION"}
                  </button>
                </>
              )}
            </>
          )}
        </section>
      )}

      <footer>ASKXO · YOUR FANTASY QUESTIONS ANSWERED</footer>
    </main>
  );
}
