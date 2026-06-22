import Link from "next/link";
import { LAB_SUBTITLE, PRODUCT_NAME } from "@/lib/branding";

type Props = {
  /** Show “Kherani Lab Bookings” under BenchTime. Default true. */
  showSubtitle?: boolean;
  /** Link logo to home. Default false in auth cards. */
  linked?: boolean;
  className?: string;
};

export function BrandLogo({ showSubtitle = true, linked = false, className = "" }: Props) {
  const inner = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-600 text-sm font-black tracking-tight text-white shadow-sm"
        aria-hidden
      >
        BT
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-base font-bold tracking-tight text-slate-900">{PRODUCT_NAME}</div>
        {showSubtitle && (
          <div className="truncate text-xs font-medium text-slate-500">{LAB_SUBTITLE}</div>
        )}
      </div>
    </div>
  );

  if (linked) {
    return (
      <Link href="/" className="rounded-lg outline-offset-2 hover:opacity-90">
        {inner}
      </Link>
    );
  }

  return inner;
}
