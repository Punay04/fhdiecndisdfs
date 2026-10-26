import { useAppContext } from "../AppContext";

/** Which auction the desk bids into decides which forecast was available to it. */
export function GateSelect() {
  const { meta, gate, setGate } = useAppContext();
  return (
    <div className="field">
      <span id="gate-label">Auction gate closure (day before delivery)</span>
      <div className="segmented" role="group" aria-labelledby="gate-label">
        {meta.gates.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={gate === g.id}
            title={g.description}
            onClick={() => setGate(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
    </div>
  );
}
