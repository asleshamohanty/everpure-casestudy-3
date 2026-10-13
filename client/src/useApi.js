import { useEffect, useState } from "react";
import { api } from "./api";

// A small "hook": load data from the API when the page opens.
// Returns { data, error, loading } so every page handles all three states.
export function useApi(path, token) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    api(path, token)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((err) => !cancelled && setState({ data: null, error: err.message, loading: false }));
    return () => { cancelled = true; };
  }, [path, token]);

  return state;
}
