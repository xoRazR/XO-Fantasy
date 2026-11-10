
"use client";

import { useEffect, useState } from "react";

type QuestionType = "Trade" | "Start/Sit";

type Submission = {
  id: string;
  tiktok: string;
  type: QuestionType;
  sending: string[];
  receiving: string[];
  players: string[];
  createdAt: string;
};

const players = [
  "Josh Allen",
  "Lamar Jackson",
  "Jalen Hurts",
  "Patrick Mahomes",
  "Joe Burrow",
  "Jayden Daniels",
  "Saquon Barkley",
  "Derrick Henry",
  "Bijan Robinson",
  "Jahmyr Gibbs",
  "Christian McCaffrey",
  "Justin Jefferson",
  "Ja'Marr Chase",
  "CeeDee Lamb",
  "Tyreek Hill",
  "Amon-Ra St. Brown",
  "Puka Nacua",
  "Travis Kelce",
  "Sam LaPorta",
  "George Kittle"
];

export default function Home() {
  const [step, setStep] = useState(1);
  const [tiktok, setTiktok] = useState("");
  const [type, setType] = useState<QuestionType | null>(null);

  const [sending, setSending] = useState<string[]>([""]);
  const [receiving, setReceiving] = useState<string[]>([""]);
  const [startSit, setStartSit] = useState<string[]>(["", ""]);

  const [queue, setQueue] = useState<Submission[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("xo-trades") || "[]"
      );

      setQueue(
        saved.map((item: any) => ({
          id: item.id,
          tiktok: item.tiktok || item.team || "@unknown",
          type: item.type || "Trade",
          sending: item.sending || [],
          receiving: item.receiving || [],
          players: item.players || [],
          createdAt: item.createdAt || ""
        }))
      );
    } catch {
      setQueue([]);
    }
  }, []);

  function saveQueue(updated: Submission[]) {
    setQueue(updated);
    localStorage.setItem("xo-trades", JSON.stringify(updated));
  }

  function addPlayer(
    list: string[],
    setter: (value: string[]) => void,
    max: number
  ) {
    if (list.length < max) setter([...list, ""]);
  }

  function updatePlayer(
    list: string[],
    setter: (value: string[]) => void,
    index: number,
    value: string
  ) {
    setter(list.map((player, i) => i === index ? value : player));
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
    setType(question);
    setStep(2);
  }

  function submitQuestion() {
    if (!tiktok.trim()) {
      alert("Please enter your TikTok username.");
      return;
    }

    if (type === "Trade") {
      const send = sending.filter(Boolean);
      const receive = receiving.filter(Boolean);

      if (!send.length || !receive.length) {
        alert("Choose at least one player on each side.");
        return;
      }

      const submission: Submission = {
        id: crypto.randomUUID(),
        tiktok: tiktok.trim().startsWith("@")
          ? tiktok.trim()
          : "@" + tiktok.trim(),
        type: "Trade",
        sending: send,
        receiving: receive,
        players: [],
        createdAt: new Date().toLocaleTimeString()
      };

      saveQueue([submission, ...queue]);
    } else {
      const selected = startSit.filter(Boolean);

      if (selected.length < 2) {
        alert("Choose at least two players to compare.");
        return;
      }

      const submission: Submission = {
        id: crypto.randomUUID(),
        tiktok: tiktok.trim().startsWith("@")
          ? tiktok.trim()
          : "@" + tiktok.trim(),
        type: "Start/Sit",
        sending: [],
        receiving: [],
        players: selected,
        createdAt: new Date().toLocaleTimeString()
      };

      saveQueue([submission, ...queue]);
    }

    alert("Your question has been submitted!");

    setStep(1);
    setTiktok("");
    setType(null);
    setSending([""]);
    setReceiving([""]);
    setStartSit(["", ""]);
  }

  function removeTrade(id: string) {
    saveQueue(queue.filter((item) => item.id !== id));
  }

  function playerDropdown(
    value: string,
    onChange: (value: string) => void
  ) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose a player</option>
        {players.map((player) => (
          <option key={player} value={player}>
            {player}
          </option>
        ))}
      </select>
    );
  }

  const addButtonStyle = {
    background: "#292929",
    color: "#e8b84d",
    border: "1px solid #555",
    padding: "11px",
    marginTop: "5px"
  };

  const backButtonStyle = {
    background: "#292929",
    color: "white",
    marginBottom: "20px"
  };

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
            onChange={(e) => setTiktok(e.target.value)}
            placeholder="@yourtiktokusername"
          />

          <h3>WHAT ARE YOU ASKING?</h3>

          <button
            onClick={() => chooseQuestion("Trade")}
            style={{ marginBottom: "14px" }}
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

      {step === 2 && type === "Trade" && (
        <section className="panel">
          <button
            style={backButtonStyle}
            onClick={() => setStep(1)}
          >
            ← BACK
          </button>

          <h2>Submit Your Trade</h2>
          <p>Choose up to 4 players on each side.</p>

          <h3>YOU SEND</h3>

          {sending.map((player, index) => (
            <div key={index}>
              {playerDropdown(
                player,
                (value) => updatePlayer(
                  sending, setSending, index, value
                )
              )}
              {sending.length > 1 && (
                <button
                  style={addButtonStyle}
                  onClick={() => removePlayer(
                    sending, setSending, index
                  )}
                >
                  Remove player
                </button>
              )}
            </div>
          ))}

          {sending.length < 4 && (
            <button
              style={addButtonStyle}
              onClick={() => addPlayer(
                sending, setSending, 4
              )}
            >
              + ADD PLAYER
            </button>
          )}

          <h3>YOU RECEIVE</h3>

          {receiving.map((player, index) => (
            <div key={index}>
              {playerDropdown(
                player,
                (value) => updatePlayer(
                  receiving, setReceiving, index, value
                )
              )}
              {receiving.length > 1 && (
                <button
                  style={addButtonStyle}
                  onClick={() => removePlayer(
                    receiving, setReceiving, index
                  )}
                >
                  Remove player
                </button>
              )}
            </div>
          ))}

          {receiving.length < 4 && (
            <button
              style={addButtonStyle}
              onClick={() => addPlayer(
                receiving, setReceiving, 4
              )}
            >
              + ADD PLAYER
            </button>
          )}

          <button
            style={{ marginTop: "22px" }}
            onClick={submitQuestion}
          >
            SUBMIT TRADE QUESTION
          </button>
        </section>
      )}

      {step === 2 && type === "Start/Sit" && (
        <section className="panel">
          <button
            style={backButtonStyle}
            onClick={() => setStep(1)}
          >
            ← BACK
          </button>

          <h2>Start / Sit Question</h2>
          <p>Choose 2 or 3 players you need help deciding between.</p>

          <h3>YOUR PLAYERS</h3>

          {startSit.map((player, index) => (
            <div key={index}>
              {playerDropdown(
                player,
                (value) => updatePlayer(
                  startSit, setStartSit, index, value
                )
              )}

              {startSit.length > 2 && (
                <button
                  style={addButtonStyle}
                  onClick={() => removePlayer(
                    startSit, setStartSit, index
                  )}
                >
                  Remove player
                </button>
              )}
            </div>
          ))}

          {startSit.length < 3 && (
            <button
              style={addButtonStyle}
              onClick={() => addPlayer(
                startSit, setStartSit, 3
              )}
            >
              + ADD PLAYER
            </button>
          )}

          <button
            style={{ marginTop: "22px" }}
            onClick={submitQuestion}
          >
            SUBMIT START / SIT QUESTION
          </button>
        </section>
      )}

      <section className="panel">
        <h2>
          Submission Queue{" "}
          <span className="count">{queue.length}</span>
        </h2>

        {queue.length === 0 && (
          <p className="empty">No questions submitted yet.</p>
        )}

        {queue.map((item) => (
          <article className="trade" key={item.id}>
            <strong>{item.tiktok}</strong>
            <small>{item.createdAt}</small>

            <h3>{item.type.toUpperCase()}</h3>

            {item.type === "Trade" ? (
              <>
                <p><b>SENDS:</b> {item.sending.join(", ")}</p>
                <p><b>RECEIVES:</b> {item.receiving.join(", ")}</p>
              </>
            ) : (
              <p><b>PLAYERS:</b> {item.players.join(", ")}</p>
            )}

            <button
              className="remove"
              onClick={() => removeTrade(item.id)}
            >
              Remove
            </button>
          </article>
        ))}
      </section>

      <footer>ASKXO · YOUR FANTASY QUESTIONS ANSWERED</footer>
    </main>
  );
}
