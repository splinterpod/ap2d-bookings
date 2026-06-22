"use client";

import { useState } from "react";
import { Input, Label, Select } from "@/components/ui/input";

type Role = "MEMBER" | "GUEST" | "ADMIN";

type Props = {
  defaultRole?: Role;
  guestExpiryDefault?: string;
  roleSelectClassName?: string;
  expiryInputClassName?: string;
  /** Only the account owner may assign ADMIN. */
  allowAdmin?: boolean;
};

export function RoleFormFields({
  defaultRole = "MEMBER",
  guestExpiryDefault = "",
  roleSelectClassName = "w-32",
  expiryInputClassName = "w-40",
  allowAdmin = false,
}: Props) {
  const [role, setRole] = useState<Role>(defaultRole);
  const isGuest = role === "GUEST";

  return (
    <>
      <div>
        <Label>Role</Label>
        <Select
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className={roleSelectClassName}
        >
          <option value="MEMBER">Member</option>
          <option value="GUEST">Guest</option>
          {allowAdmin && <option value="ADMIN">Admin</option>}
        </Select>
      </div>
      <div className={isGuest ? "" : "opacity-50"}>
        <Label>Guest expiry</Label>
        <Input
          type="date"
          name="guestExpiresAt"
          defaultValue={guestExpiryDefault}
          disabled={!isGuest}
          className={expiryInputClassName}
        />
      </div>
    </>
  );
}
