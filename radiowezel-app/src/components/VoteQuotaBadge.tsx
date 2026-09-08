import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRealtime } from "@/hooks/useRealtime";
import { ThumbsUp } from "lucide-react";

export function VoteQuotaBadge() {
  const { user } = useAuth();
  const [quota, setQuota] = useState<{ remaining: number; perUser: number } | null>(null);

  const refresh = useCallback(() => {
    if (!user) {
      setQuota(null);
      return;
    }
    api
      .getVoteQuota()
      .then((value) => setQuota({ remaining: value.remaining, perUser: value.perUser }))
      .catch(() => setQuota(null));
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtime(["votes:changed"], refresh);

  if (!user || !quota) {
    return null;
  }

  return (
    <div
      className="flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-1 text-xs sm:text-sm tabular-nums shrink-0"
      title={`Pozostało ${quota.remaining} z ${quota.perUser} głosów w okresie limitu`}
    >
      <ThumbsUp className="h-3.5 w-3.5 shrink-0" />
      <span>
        {quota.remaining}/{quota.perUser}
      </span>
    </div>
  );
}
