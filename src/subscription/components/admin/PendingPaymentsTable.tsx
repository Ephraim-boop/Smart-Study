import { useCallback, useEffect, useState } from 'react';
import { formatPrice } from '../../config/countries';
import {
  adminListPendingPayments,
  adminRejectPayment,
  adminVerifyPayment,
} from '../../lib/subscriptionApi';
import type { PaymentRecord } from '../../types/subscription';

/**
 * Admin-only review queue (Section 12). Lists `pending_verification` payments
 * and lets an authorized administrator verify or reject each one. Every action
 * calls a SECURITY DEFINER RPC that re-checks the admin role and writes an
 * audit log — this table is not itself a permission boundary.
 */
export function PendingPaymentsTable() {
  const [rows, setRows] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await adminListPendingPayments());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pending payments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function verify(id: string) {
    setBusyId(id);
    try {
      await adminVerifyPayment(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verify failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt('Reason for rejection (shown to the student):');
    if (!reason || !reason.trim()) return;
    setBusyId(id);
    try {
      await adminRejectPayment(id, reason);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Pending payment verification</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <p className="mt-2 text-sm text-gray-500">
        Verify only after confirming the transaction in official Orange Money records. Verification
        activates 30 days of Premium and is logged.
      </p>

      {loading ? (
        <p className="mt-4 text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-gray-500">No payments awaiting verification.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Student ID</th>
                <th className="px-3 py-2 font-medium">Country</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Reference</th>
                <th className="px-3 py-2 font-medium">Submitted</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs">{r.userId}</td>
                  <td className="px-3 py-2">{r.country}</td>
                  <td className="px-3 py-2">{formatPrice(r.amount, r.currency)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.transactionReference}</td>
                  <td className="px-3 py-2">{new Date(r.submittedAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void verify(r.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Verify
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void reject(r.id)}
                        className="rounded-lg bg-red-600 px-3 py-1 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
