import { Check } from "lucide-react";
export default function EntrySteps({ current }) {
  const steps = ["TOURNAMENT", "PLAYER DETAILS", "CHECKOUT"];
  return (
    <div className="entry-steps">
      {steps.map((label, index) => (
        <div
          key={label}
          className={`${index + 1 === current ? "active" : ""} ${index + 1 < current ? "done" : ""}`}
        >
          <span>
            {index + 1 < current ? <Check size={13} /> : `0${index + 1}`}
          </span>
          <strong>{label}</strong>
          {index < 2 && <i />}
        </div>
      ))}
    </div>
  );
}
