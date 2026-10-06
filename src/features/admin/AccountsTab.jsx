/**
 * Admin dashboard: Accounts tab (added 1 Oct 2026).
 *
 * Lists every account with its email, role, sign-up date, profile state and
 * annotation count. An admin can switch a person between contributor and
 * annotator, or delete an account with everything it recorded after seeing what
 * would be removed and typing the username. All checks are repeated on the
 * server in /api/admin/accounts.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Card, Badge, Skeleton, Button, Input, ConfirmDialog, cn } from "@/ui";
import { deletionSummary, roleChangeCopy, deleteCopy } from "./accountDialogs";

async function postAccount(body) {
  const r = await fetch("/api/admin/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.message || `Request failed (${r.status}).`);
  return json;
}

const ROLE_TONE = { admin: "warning", annotator: "success", user: "info" };

export default function AccountsTab() {
  const [accounts, setAccounts] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null); // { tone: "success" | "danger", text }

  const [roleTarget, setRoleTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [preview, setPreview] = useState(null);
  const [typed, setTyped] = useState("");
  const [dialogError, setDialogError] = useState(null);
  const [busy, setBusy] = useState(false);
  // The account whose deletion preview is awaited, so a slow reply for an
  // account the admin has since closed is never shown under another name.
  const previewFor = useRef(null);

  const load = useCallback(() => {
    setLoadError(null);
    return fetch("/api/admin/accounts")
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.message || `Request failed (${r.status}).`);
        setAccounts(json.accounts);
      })
      .catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const closeDialogs = useCallback(() => {
    if (busy) return;
    previewFor.current = null;
    setRoleTarget(null);
    setDeleteTarget(null);
    setPreview(null);
    setTyped("");
    setDialogError(null);
  }, [busy]);

  const openDelete = async (account) => {
    setNotice(null);
    setDialogError(null);
    setTyped("");
    setPreview(null);
    setDeleteTarget(account);
    previewFor.current = account.id;
    try {
      const { counts } = await postAccount({ action: "preview", userId: account.id });
      if (previewFor.current === account.id) setPreview(counts);
    } catch (e) {
      if (previewFor.current === account.id) setDialogError(e.message);
    }
  };

  const confirmRole = async () => {
    const copy = roleChangeCopy(roleTarget);
    setBusy(true);
    setDialogError(null);
    try {
      await postAccount({ action: "role", userId: roleTarget.id, role: copy.nextRole });
      setNotice({ tone: "success", text: `${deleteCopy(roleTarget).expected} is now ${copy.nextRole === "annotator" ? "an annotator" : "a contributor"}.` });
      setRoleTarget(null);
      await load();
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const copy = deleteCopy(deleteTarget);
    setBusy(true);
    setDialogError(null);
    try {
      await postAccount({ action: "delete", userId: deleteTarget.id, confirmName: typed });
      setNotice({ tone: "success", text: `${copy.expected} and everything it recorded have been deleted.` });
      setDeleteTarget(null);
      setPreview(null);
      setTyped("");
      await load();
    } catch (e) {
      setDialogError(e.message);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Card padding="md">
        <p className="text-sm text-danger font-medium" role="alert">Could not load accounts: {loadError}</p>
      </Card>
    );
  }

  if (!accounts) {
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

  const roleCopy = roleTarget ? roleChangeCopy(roleTarget) : null;
  const delCopy = deleteTarget ? deleteCopy(deleteTarget) : null;

  return (
    <div className="space-y-4">
      {notice && (
        <p
          role="status"
          className={cn(
            "text-sm font-medium rounded-control border px-4 py-3",
            notice.tone === "success"
              ? "bg-success-soft text-success border-success-border"
              : "bg-danger-soft text-danger border-danger-border"
          )}
        >
          {notice.text}
        </p>
      )}

      <p className="text-sm text-muted">
        {accounts.length} account{accounts.length === 1 ? "" : "s"}. Admin accounts, including yours, cannot be changed
        or deleted here. A role can change only when the person has no session in progress.
      </p>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-4 py-3 font-semibold text-muted">Username</th>
                <th className="px-4 py-3 font-semibold text-muted">Email</th>
                <th className="px-4 py-3 font-semibold text-muted">Role</th>
                <th className="px-4 py-3 font-semibold text-muted">Joined</th>
                <th className="px-4 py-3 font-semibold text-muted">Profile</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Annotations</th>
                <th className="px-4 py-3 font-semibold text-muted text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-line-card last:border-0 align-middle">
                  <td className="px-4 py-3 font-medium text-ink">
                    {a.username || <span className="text-subtle italic">not chosen yet</span>}
                    {a.isSelf && <span className="text-subtle font-normal"> (you)</span>}
                  </td>
                  <td className="px-4 py-3 text-body break-all">{a.email || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={ROLE_TONE[a.role] || "neutral"}>{a.roleLabel}</Badge>
                      {a.activeSession && <Badge tone="neutral">Session in progress</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-subtle whitespace-nowrap">
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-US") : "-"}
                  </td>
                  <td className="px-4 py-3 text-body">{a.profileComplete ? "Complete" : "Not finished"}</td>
                  <td className="px-4 py-3 text-right text-body">{a.annotations.toLocaleString("en-US")}</td>
                  <td className="px-4 py-3">
                    {a.editable ? (
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="neutral"
                          size="sm"
                          className="whitespace-nowrap"
                          disabled={a.activeSession}
                          title={a.activeSession ? "Available once their session is finished or stopped" : undefined}
                          onClick={() => {
                            setNotice(null);
                            setDialogError(null);
                            setRoleTarget(a);
                          }}
                        >
                          {a.role === "annotator" ? "Make contributor" : "Make annotator"}
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => openDelete(a)}>
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <p className="text-right text-subtle">-</p>
                    )}
                  </td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No accounts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(roleTarget)}
        title={roleCopy?.title || ""}
        description={roleCopy?.description}
        confirmLabel={busy ? "Saving..." : roleCopy?.confirmLabel || "Confirm"}
        confirmDisabled={busy}
        onConfirm={confirmRole}
        onCancel={closeDialogs}
      >
        {dialogError && (
          <p className="text-sm text-danger font-medium" role="alert">
            {dialogError}
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={delCopy?.title || ""}
        description={delCopy?.description}
        confirmLabel={busy ? "Deleting..." : delCopy?.confirmLabel || "Delete"}
        destructive
        confirmDisabled={busy || !preview || typed.trim() !== delCopy?.expected}
        onConfirm={confirmDelete}
        onCancel={closeDialogs}
      >
        <div className="space-y-4">
          {preview ? (
            <div>
              <p className="text-sm font-semibold text-ink mb-1">This will remove:</p>
              <ul className="text-sm text-body list-disc pl-5 space-y-0.5">
                <li>the account ({delCopy?.expected}{deleteTarget?.email && deleteTarget.email !== delCopy?.expected ? `, ${deleteTarget.email}` : ""})</li>
                {deletionSummary(preview).map((r) => (
                  <li key={r.key} className={r.n === 0 ? "text-subtle" : undefined}>
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            !dialogError && <Skeleton className="h-28 w-full" />
          )}
          {preview && (
            <Input
              label={delCopy?.typeLabel}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              disabled={busy}
            />
          )}
          {dialogError && (
            <p className="text-sm text-danger font-medium" role="alert">
              {dialogError}
            </p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
