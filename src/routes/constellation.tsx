import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/constellation")({
  head: () => ({
    meta: [
      { title: "Command Constellation — C.A.P.I.S.M." },
      { name: "description", content: "Command Constellation — canonical knowledge-graph visualization for C.A.P.I.S.M." },
    ],
  }),
  component: Constellation,
});

function Constellation() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#050508" }}>
      <iframe
        src="/constellation.html"
        title="Command Constellation"
        style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#050508" }}
      />
    </div>
  );
}
