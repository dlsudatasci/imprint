import { useState, useEffect } from "react";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/util/mongodb";
import { ObjectId } from "mongodb";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

import Page from "@/ui/page";
import { Card, Container, Badge, Skeleton } from "@/ui";
import AccountsTab from "@/features/admin/AccountsTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "contributors", label: "Contributors" },
  { key: "pool", label: "Pool Status" },
  { key: "nasa-tlx", label: "NASA-TLX" },
  { key: "quality", label: "Quality" },
  { key: "retraining", label: "Retraining" },
  { key: "accounts", label: "Accounts" },
];

function StatCard({ label, value, sub }) {
  return (
    <Card padding="md">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="text-3xl font-extrabold text-ink tracking-tight mt-1">
        {value ?? <Skeleton className="h-8 w-20" />}
      </p>
      {sub && <p className="text-xs text-subtle mt-1">{sub}</p>}
    </Card>
  );
}

function OverviewTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card padding="md" key={i}>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Contributors" value={data.totalContributors} />
        <StatCard label="Total Annotations" value={data.totalAnnotations.toLocaleString()} />
        <StatCard label="Annotations Today" value={data.annotationsToday} />
        <StatCard label="Active Today" value={data.activeContributorsToday} />
      </div>

      <h3 className="font-display text-lg font-bold text-ink">Session Health</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Sessions" value={data.totalSessions} />
        <StatCard label="Completion Rate" value={`${data.completionRate}%`} />
        <StatCard label="Abandonment Rate" value={`${data.abandonmentRate}%`} />
        <StatCard
          label="Avg Duration"
          value={
            data.avgSessionDurationMs != null
              ? `${(data.avgSessionDurationMs / 60000).toFixed(1)} min`
              : "N/A"
          }
        />
      </div>

      {data.modelVersions.length > 0 && (
        <>
          <h3 className="font-display text-lg font-bold text-ink">Model Versions</h3>
          <Card padding="md">
            <div className="space-y-2">
              {data.modelVersions.map((m) => (
                <div key={m.version} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-body">{m.version}</span>
                  <Badge tone="info">{m.count} sessions</Badge>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ContributorsTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/admin/contributors")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) {
    return (
      <Card padding="md">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-4 py-3 font-semibold text-muted">Username</th>
              <th className="px-4 py-3 font-semibold text-muted">Role</th>
              <th className="px-4 py-3 font-semibold text-muted text-right">Annotations</th>
              <th className="px-4 py-3 font-semibold text-muted text-right">Sessions</th>
              <th className="px-4 py-3 font-semibold text-muted text-right">Avg Time/Image</th>
              <th className="px-4 py-3 font-semibold text-muted">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {data.contributors.map((c) => (
              <tr key={c.userId} className="border-b border-line-card last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{c.username}</td>
                <td className="px-4 py-3">
                  <Badge tone={c.role === "annotator" ? "success" : "info"}>
                    {c.role === "annotator" ? "Annotator" : "Contributor"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-body">{c.totalAnnotations}</td>
                <td className="px-4 py-3 text-right text-body">{c.sessionCount}</td>
                <td className="px-4 py-3 text-right text-body">
                  {c.avgTimePerImageMs != null
                    ? `${(c.avgTimePerImageMs / 1000).toFixed(1)}s`
                    : "-"}
                </td>
                <td className="px-4 py-3 text-subtle">
                  {c.lastActive
                    ? new Date(c.lastActive).toLocaleDateString()
                    : "-"}
                </td>
              </tr>
            ))}
            {data.contributors.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No contributors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PoolTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/admin/pool")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card padding="md" key={i}>
            <Skeleton className="h-6 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {data.exhaustionWarnings.length > 0 && (
        <Card padding="md" className="border-warning">
          <h4 className="font-bold text-warning text-sm mb-2">Exhaustion Warnings</h4>
          <div className="space-y-1">
            {data.exhaustionWarnings.map((w) => (
              <p key={w.city} className="text-sm text-body">
                <span className="font-medium">{w.city}</span>: only{" "}
                <span className="font-bold text-warning">{w.served}</span> served images remaining
              </p>
            ))}
          </div>
        </Card>
      )}

      <h3 className="font-display text-lg font-bold text-ink">Pool by City</h3>
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 font-semibold text-muted">City</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Served</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Reserve</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.cities.map((c) => (
                <tr key={c.city} className="border-b border-line-card last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{c.city}</td>
                  <td className="px-4 py-3 text-right text-body">{c.served}</td>
                  <td className="px-4 py-3 text-right text-body">{c.reserve}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">
                    {c.served + c.reserve}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <h3 className="font-display text-lg font-bold text-ink">Image Coverage</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="0 annotations" value={data.coverage["0"] ?? 0} />
        <StatCard label="1 annotation" value={data.coverage["1"] ?? 0} />
        <StatCard label="2 annotations" value={data.coverage["2"] ?? 0} />
        <StatCard label="3+ annotations" value={data.coverage["3+"] ?? 0} />
      </div>
    </div>
  );
}

function NasaTlxTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/admin/nasa-tlx-summary")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card padding="md" key={i}>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>
    );
  }

  const scaleLabels = {
    mentalDemand: "Mental Demand",
    physicalDemand: "Physical Demand",
    temporalDemand: "Temporal Demand",
    performance: "Performance",
    effort: "Effort",
    frustration: "Frustration",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Submitted" value={data.totalSubmitted} />
        <StatCard label="Dismissed" value={data.totalDismissed} />
        <StatCard label="Total Responses" value={data.totalResponses} />
        <StatCard label="Dismissal Rate" value={`${data.dismissalRate}%`} />
      </div>

      {data.totalSubmitted > 0 && (
        <>
          <h3 className="font-display text-lg font-bold text-ink">Average Scores</h3>
          <Card padding="md">
            <div className="space-y-4">
              {Object.entries(scaleLabels).map(([key, label]) => {
                const val = data.averages?.[key];
                return (
                  <div key={key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-body">{label}</span>
                      <span className="font-bold text-ink">
                        {val != null ? val : "-"}
                      </span>
                    </div>
                    <div className="h-2 bg-line rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: val != null ? `${val}%` : "0%" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function QualityTab() {
  const [refData, setRefData] = useState(null);
  const [degData, setDegData] = useState(null);
  const [agrData, setAgrData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/quality/reference-performance").then((r) => r.json()),
      fetch("/api/admin/quality/degenerate").then((r) => r.json()),
      fetch("/api/admin/quality/agreement").then((r) => r.json()),
    ])
      .then(([ref, deg, agr]) => {
        setRefData(ref);
        setDegData(deg);
        setAgrData(agr);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card padding="md" key={i}><Skeleton className="h-20 w-full" /></Card>
        ))}
      </div>
    );
  }

  const FLAG_LABELS = {
    all_obstructs_yes: "All obstructions marked Yes",
    all_obstructs_no: "All obstructions marked No",
    constant_severity: "Same severity on every box",
    identical_scene_ratings: "Identical scene ratings across images",
    impossibly_fast: "Impossibly fast submissions",
  };

  return (
    <div className="space-y-8">
      {/* Degenerate flags */}
      <div>
        <h3 className="font-display text-lg font-bold text-ink mb-3">Degenerate Behavior Flags</h3>
        {degData?.flaggedContributors?.length > 0 ? (
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-4 py-3 font-semibold text-muted">Username</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">Annotations</th>
                    <th className="px-4 py-3 font-semibold text-muted">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {degData.flaggedContributors.map((c) => (
                    <tr key={c.userId} className="border-b border-line-card last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{c.username}</td>
                      <td className="px-4 py-3 text-right text-body">{c.annotationCount}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.flags.map((f, i) => (
                            <Badge key={i} tone="danger">
                              {FLAG_LABELS[f.type] || f.type}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card padding="md">
            <p className="text-muted text-sm">
              No degenerate behavior detected ({degData?.scannedCount ?? 0} contributors scanned).
            </p>
          </Card>
        )}
      </div>

      {/* Reference performance */}
      <div>
        <h3 className="font-display text-lg font-bold text-ink mb-1">Reference Performance</h3>
        <p className="text-muted text-sm mb-3">
          {refData?.imagesWithGroundTruth ?? 0} of {refData?.referenceImageCount ?? 0} reference images have annotator ground truth.
          {refData?.answerKey && (
            <>
              {" "}Boxes are scored against an answer key merged from {refData.answerKey.annotatorsPerImage
                ? refData.answerKey.annotatorsPerImage.min === refData.answerKey.annotatorsPerImage.max
                  ? refData.answerKey.annotatorsPerImage.min
                  : `${refData.answerKey.annotatorsPerImage.min} to ${refData.answerKey.annotatorsPerImage.max}`
                : 0} annotators per image: {refData.answerKey.objects} objects boxed by more than half of them,
              with {refData.answerKey.uncertain} uncertain objects set aside ({refData.answerKey.categoryTies} of them
              category ties). Obstruction agreement is averaged across annotators.
            </>
          )}
        </p>
        {refData?.contributors?.length > 0 ? (
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-4 py-3 font-semibold text-muted">Username</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">Ref. Images</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">Precision</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">Recall</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">F1</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">Obstruction</th>
                  </tr>
                </thead>
                <tbody>
                  {refData.contributors.map((c) => (
                    <tr key={c.userId} className="border-b border-line-card last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{c.username}</td>
                      <td className="px-4 py-3 text-right text-body">{c.referenceImagesScored}</td>
                      <td className="px-4 py-3 text-right text-body">{c.avgPrecision != null ? `${(c.avgPrecision * 100).toFixed(1)}%` : "-"}</td>
                      <td className="px-4 py-3 text-right text-body">{c.avgRecall != null ? `${(c.avgRecall * 100).toFixed(1)}%` : "-"}</td>
                      <td className="px-4 py-3 text-right font-bold text-ink">{c.avgF1 != null ? `${(c.avgF1 * 100).toFixed(1)}%` : "-"}</td>
                      <td className="px-4 py-3 text-right text-body">
                        {c.avgObstructionAgreement != null ? `${(c.avgObstructionAgreement * 100).toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card padding="md">
            <p className="text-muted text-sm">No reference performance data yet.</p>
          </Card>
        )}
      </div>

      {/* Multi-contributor agreement */}
      <div>
        <h3 className="font-display text-lg font-bold text-ink mb-1">Multi-Contributor Agreement</h3>
        <p className="text-muted text-sm mb-3">
          {agrData?.sharedImageCount ?? 0} images annotated by 2+ contributors.
        </p>
        {agrData?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <StatCard label="Mean F1" value={`${(agrData.summary.meanF1 * 100).toFixed(1)}%`} />
            <StatCard
              label="Mean Obstruction"
              value={agrData.summary.meanObstructionAgreement != null
                ? `${(agrData.summary.meanObstructionAgreement * 100).toFixed(1)}%`
                : "N/A"}
            />
            <StatCard
              label="Mean Scene"
              value={agrData.summary.meanSceneAgreement != null
                ? `${(agrData.summary.meanSceneAgreement * 100).toFixed(1)}%`
                : "N/A"}
            />
          </div>
        )}
        {agrData?.pairs?.length > 0 ? (
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-4 py-3 font-semibold text-muted">Pair</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">Shared Images</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">Avg F1</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">Obstruction</th>
                    <th className="px-4 py-3 font-semibold text-muted text-right">Scene</th>
                  </tr>
                </thead>
                <tbody>
                  {agrData.pairs.map((p, i) => (
                    <tr key={i} className="border-b border-line-card last:border-0">
                      <td className="px-4 py-3 font-medium text-ink">{p.userA} / {p.userB}</td>
                      <td className="px-4 py-3 text-right text-body">{p.sharedImages}</td>
                      <td className="px-4 py-3 text-right font-bold text-ink">{(p.avgF1 * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right text-body">
                        {p.avgObstructionAgreement != null ? `${(p.avgObstructionAgreement * 100).toFixed(1)}%` : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-body">
                        {p.avgSceneAgreement != null ? `${(p.avgSceneAgreement * 100).toFixed(1)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card padding="md">
            <p className="text-muted text-sm">No multi-contributor agreement data yet.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function RetrainingTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/admin/retraining")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card padding="md" key={i}>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Retraining Cycles" value={data.cycleCount} />
        <StatCard label="Total Images" value={data.totalImages.toLocaleString()} />
        <StatCard
          label="Completed Annotations"
          value={data.totalCompletedAnnotations.toLocaleString()}
        />
        <StatCard
          label="Next Cycle At"
          value={data.nextRetrainingAt.toLocaleString()}
          sub={
            data.annotationsUntilNext > 0
              ? `${data.annotationsUntilNext.toLocaleString()} to go`
              : "Ready now"
          }
        />
      </div>

      <h3 className="font-display text-lg font-bold text-ink">Model Version Distribution</h3>
      {data.versionDistribution.length > 0 ? (
        <Card padding="md">
          <div className="space-y-3">
            {data.versionDistribution.map((v) => {
              const pct = data.totalImages > 0
                ? ((v.count / data.totalImages) * 100).toFixed(1)
                : 0;
              return (
                <div key={v.version}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-body">{v.version}</span>
                    <span className="text-muted">
                      {v.count.toLocaleString()} images ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card padding="md">
          <p className="text-muted text-sm">No model version data.</p>
        </Card>
      )}

      <h3 className="font-display text-lg font-bold text-ink">Retraining History</h3>
      {data.retrainingCycles.length > 0 ? (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-3 font-semibold text-muted">Version</th>
                  <th className="px-4 py-3 font-semibold text-muted">Date</th>
                  <th className="px-4 py-3 font-semibold text-muted text-right">Predictions</th>
                  <th className="px-4 py-3 font-semibold text-muted text-right">Updated</th>
                  <th className="px-4 py-3 font-semibold text-muted text-right">Cleared</th>
                  <th className="px-4 py-3 font-semibold text-muted text-right">Missing</th>
                </tr>
              </thead>
              <tbody>
                {data.retrainingCycles.map((c, i) => (
                  <tr key={i} className="border-b border-line-card last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">
                      <Badge tone="info">{c.modelVersion}</Badge>
                    </td>
                    <td className="px-4 py-3 text-body">
                      {new Date(c.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-body">
                      {c.predictionsInFile ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-body">
                      {c.imagesUpdated ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-body">
                      {c.imagesCleared ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-body">
                      {c.imagesMissing ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card padding="md">
          <p className="text-muted text-sm">
            No retraining cycles recorded yet. Run{" "}
            <code className="text-xs bg-line rounded px-1 py-0.5">
              scripts/update-predictions.mjs
            </code>{" "}
            after each retraining cycle.
          </p>
        </Card>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <Page title="Admin Dashboard - Imprint" contribute>
      <section className="pt-8 pb-12">
        <Container>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-ink tracking-tight mb-6">
            Admin Dashboard
          </h1>

          <div className="flex gap-1 border-b border-line mb-6 overflow-x-auto">
            {TABS.map((tab) => (
              // eslint-disable-next-line react/forbid-elements -- tab indicator uses custom border-bottom styling
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors
                  border-b-2 -mb-px cursor-pointer
                  ${activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-body"
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" && <OverviewTab />}
          {activeTab === "contributors" && <ContributorsTab />}
          {activeTab === "pool" && <PoolTab />}
          {activeTab === "nasa-tlx" && <NasaTlxTab />}
          {activeTab === "quality" && <QualityTab />}
          {activeTab === "retraining" && <RetrainingTab />}
          {activeTab === "accounts" && <AccountsTab />}
        </Container>
      </section>
    </Page>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session?.user?._id) {
    return { redirect: { destination: "/login", permanent: false } };
  }

  const { db } = await connectToDatabase();
  const user = await db
    .collection("users")
    .findOne({ _id: new ObjectId(session.user._id) }, { projection: { role: 1 } });

  if (!user || user.role !== "admin") {
    return { redirect: { destination: "/contribute", permanent: false } };
  }

  return { props: { session } };
}
