import { setUserStatusAction } from "@/actions/admin";
import {
  InstrumentLimitsDialog,
  type SerInstrumentWithDefaults,
} from "@/components/admin/instrument-limits-dialog";
import {
  TrainingHistoryDialog,
  type SerInstrument,
  type SerTraining,
} from "@/components/admin/training-history-dialog";
import type { SerUserInstrumentLimit } from "@/lib/booking";
import { Button } from "@/components/ui/button";

type Props = {
  userId: string;
  username: string;
  status: "ACTIVE" | "DEACTIVATED" | "PENDING";
  isAdminUser: boolean;
  canEditTraining: boolean;
  instruments: SerInstrument[];
  instrumentsWithDefaults: SerInstrumentWithDefaults[];
  trainings: SerTraining[];
  instrumentLimits: SerUserInstrumentLimit[];
};

export function UserManagementBoxes({
  userId,
  username,
  status,
  isAdminUser,
  canEditTraining,
  instruments,
  instrumentsWithDefaults,
  trainings,
  instrumentLimits,
}: Props) {
  const accountLocked = isAdminUser;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 ${accountLocked ? "opacity-60" : ""}`}>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</h3>
        <div className="mt-2">
          {accountLocked ? (
            <Button size="sm" variant="danger" className="w-full" disabled>
              Deactivate
            </Button>
          ) : status === "PENDING" ? (
            <Button size="sm" variant="secondary" className="w-full" disabled>
              Pending approval
            </Button>
          ) : status === "ACTIVE" ? (
            <form action={setUserStatusAction}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="status" value="DEACTIVATED" />
              <Button size="sm" variant="danger" className="w-full">
                Deactivate
              </Button>
            </form>
          ) : (
            <form action={setUserStatusAction}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="status" value="ACTIVE" />
              <Button size="sm" variant="secondary" className="w-full">
                Reactivate
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Training</h3>
        <div className="mt-2">
          <TrainingHistoryDialog
            userId={userId}
            username={username}
            isAdminUser={isAdminUser}
            canEditTraining={canEditTraining}
            instruments={instruments}
            trainings={trainings}
          />
        </div>
      </div>

      <div className={`rounded-lg border border-slate-200 bg-slate-50 p-3 ${isAdminUser ? "opacity-60" : ""}`}>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Limits</h3>
        <div className="mt-2">
          <InstrumentLimitsDialog
            userId={userId}
            username={username}
            isAdminUser={isAdminUser}
            canEdit={!isAdminUser}
            instruments={instrumentsWithDefaults}
            limits={instrumentLimits}
          />
        </div>
      </div>
    </div>
  );
}
