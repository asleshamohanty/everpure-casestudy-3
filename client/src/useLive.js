import { useEffect, useRef, useState } from "react";
import { api } from "./api";

// Keeps a live WebSocket open. It delivers three kinds of message:
//   alert      -> added to the alert list
//   snapshot   -> new telemetry arrived: pages refresh their data
//   ownership  -> an admin reassigned a report: pages refresh their data
// Reconnects with backoff if the line drops, then fetches any alerts it missed.
// Viewers are not allowed on the socket, so for them we poll every 3 seconds instead.
export function useLive(token, canConnect) {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState("off"); // off | connecting | live | reconnecting | polling
  const [tick, setTick] = useState(0);          // bump this -> pages reload
  const [clock, setClock] = useState(null);     // { snapshot, total, at }
  const lastId = useRef("a-0");

  useEffect(() => {
    // New login (or logout): start from a clean slate so no user sees another user's alerts
    setAlerts([]);
    setClock(null);
    lastId.current = "a-0";
    if (!token) {
      setStatus("off");
      return;
    }

    if (!canConnect) {
      setStatus("polling");
      const timer = setInterval(() => setTick((t) => t + 1), 3000);
      return () => clearInterval(timer);
    }

    let socket;
    let retry;
    let stopped = false;
    let delay = 1000;

    const add = (list) => {
      if (list.length === 0) return;
      lastId.current = list[list.length - 1].id;
      setAlerts((prev) => [...list.slice().reverse(), ...prev].slice(0, 200)); // newest first
    };

    const connect = () => {
      setStatus((s) => (s === "off" ? "connecting" : "reconnecting"));
      const proto = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${location.host}/ws/alerts?token=${token}`);

      socket.onopen = async () => {
        setStatus("live");
        delay = 1000;
        setTick((t) => t + 1); // refresh pages after (re)connecting
        try {
          const missed = await api(`/alerts?since=${lastId.current}`, token);
          add(missed.alerts);
        } catch { /* history is a bonus; the live stream still works */ }
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "alert") add([msg]);
        if (msg.type === "snapshot") {
          setClock({ snapshot: msg.snapshot, total: msg.total, at: msg.at });
          setTick((t) => t + 1);
        }
        if (msg.type === "ownership") setTick((t) => t + 1);
      };
      socket.onclose = (event) => {
        if (stopped || event.code === 4401 || event.code === 4403) return setStatus("off");
        retry = setTimeout(connect, delay);  // try again...
        delay = Math.min(delay * 2, 15000);  // ...waiting longer each time (backoff)
        setStatus("reconnecting");
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [token, canConnect]);

  return { alerts, status, tick, clock };
}
