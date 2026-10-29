import { Card, Badge } from "@/ui";

/**
 * The suggestion threshold τ on the admin Retraining tab (S2, 29 Oct 2026):
 * the value in use, the detector it was chosen for, when, and its validation
 * precision and recall. With nothing stored it says the default is in use.
 * `tau` is tauSummary's shape (validators/tauSetting.mjs).
 */
export default function TauCard({ tau }) {
  if (!tau) return null;
  const chosen = tau.chosenAt
    ? new Date(tau.chosenAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" })
    : null;
  const twoPlaces = (n) => (typeof n === "number" ? n.toFixed(2) : "-");

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted">Suggestion threshold (τ)</p>
          <p className="text-3xl font-extrabold text-ink tracking-tight mt-1" data-testid="tau-value">{tau.value}</p>
        </div>
        {tau.isDefault ? <Badge tone="warning">Default</Badge> : <Badge tone="success">Set</Badge>}
      </div>
      {tau.isDefault ? (
        <p className="text-xs text-subtle mt-2">
          No threshold is stored, so suggestions at or above {tau.value} are shown. Set the one chosen on the validation set with{" "}
          <code className="text-xs bg-line rounded px-1 py-0.5">scripts/set-tau.mjs</code>.
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-subtle">Detector</dt>
          <dd className="text-body font-medium" data-testid="tau-model">{tau.modelVersion ?? "-"}</dd>
          <dt className="text-subtle">Chosen</dt>
          <dd className="text-body">{chosen ?? "-"}</dd>
          <dt className="text-subtle">Validation precision</dt>
          <dd className="text-body">{twoPlaces(tau.validationPrecision)}</dd>
          <dt className="text-subtle">Validation recall</dt>
          <dd className="text-body">{twoPlaces(tau.validationRecall)}</dd>
        </dl>
      )}
    </Card>
  );
}
