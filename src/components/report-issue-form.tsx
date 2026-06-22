"use client";

import { useActionState } from "react";
import { reportIssueAction, type ReportFormState } from "@/actions/report";
import { Label, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

export function ReportIssueForm() {
  const [state, action] = useActionState(reportIssueAction, undefined);

  return (
    <form action={action} className="space-y-3">
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}

      <div>
        <Label htmlFor="report-category">Issue type</Label>
        <Select id="report-category" name="category" defaultValue="webpage" required>
          <option value="webpage">Webpage (site, login, calendar, etc.)</option>
          <option value="software">Software (instrument PC, acquisition, etc.)</option>
          <option value="hardware">Hardware (laser, spectrometer, etc.)</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="report-description">Describe the issue</Label>
        <Textarea
          id="report-description"
          name="description"
          rows={4}
          required
          placeholder="What happened? Include steps to reproduce if you can."
          maxLength={2000}
        />
        <p className="mt-1 text-xs text-slate-500">Sent to lab administrators. At least 10 characters.</p>
      </div>

      <SubmitButton>Submit report</SubmitButton>
    </form>
  );
}
