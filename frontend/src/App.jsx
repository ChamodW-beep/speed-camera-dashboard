import { useEffect, useState } from "react";

function App() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    fetch("http://localhost:8000/api/health")
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("backend not reachable"));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Speed Camera Dashboard</h1>
      <p>Backend status: {status}</p>
    </div>
  );
}

export default App;
