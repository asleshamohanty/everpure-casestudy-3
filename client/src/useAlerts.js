import { useEffect, useRef, useState } from "react";
import { api } from "./api";

// Keeps a live WebSocket open, collects alerts, and reconnects if the line drops.
export function useAlerts(token, enabled) {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState("off"); // off | connecting | live | reconnecting
  const lastId = useRef("a-0");

  useEffect(() => {
    // New login (or logout): start from a clean slate so no user sees another user's alerts
    setAlerts([]);
    lastId.current = "a-0";
    if (!enabled) {
      setStatus("off");
      return;
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
        // Catch up on anything missed while disconnected
        try {
          const missed = await api(`/alerts?since=${lastId.current}`, token);
          add(missed.alerts);
        } catch { /* history is a bonus; live stream still works */ }
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === "alert") add([msg]);
      };
      socket.onclose = (event) => {
        if (stopped || event.code === 4401 || event.code === 4403) return setStatus("off");
        retry = setTimeout(connect, delay);           // try again...
        delay = Math.min(delay * 2, 15000);           // ...waiting longer each time (backoff)
        setStatus("reconnecting");
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [token, enabled]);

  return { alerts, status };
}
