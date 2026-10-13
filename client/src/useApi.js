import { useEffect, useState } from "react";
import { api } from "./api";

// Load data from the API when the page opens, and again whenever `refreshKey` changes
// (a new snapshot arrived, or the user changed something). While refreshing, the old
// data stays on screen, so the page updates in place instead of flashing "Loading…".
export function useApi(path, token, refreshKey = 0) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    api(path, token)
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((err) => !cancelled && setState((s) => ({ ...s, error: err.message, loading: false })));
    return () => { cancelled = true; };
  }, [path, token, refreshKey]);

  return state;
}
