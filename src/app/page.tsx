"use client";

import Link from "next/link";
import { useApp, SITE, SHIFT } from "@/lib/store";
import { Wordmark } from "@/components/Brand";
import { fmtInr } from "@/lib/incentive";

const ROLES = [
  {
    href: "/console",
    tag: "WEB CONSOLE",
    title: "Command Center",
    desc: "Live board, planning & imports, incentive ledger, issues, reports",
    cta: "Open console",
    accent: true,
  },
  {
    href: "/driver",
    tag: "MOBILE · PILOT PREVIEW",
    title: "Driver App",
    desc: "Money meter, job offers, ticket camera — ड्राइवर के लिए",
    cta: "Open driver view",
    accent: false,
  },
  {
    href: "/console?tab=masters",
    tag: "SETUP",
    title: "Masters & Settings",
    desc: "Vendors, ITV & driver masters, daily mapping, rate card",
    cta: "Manage masters",
    accent: false,
  },
  {
    href: "/console?tab=planning",
    tag: "DOCS / DATA",
    title: "Imports & Planning",
    desc: "Pendency & cutoff files, ITV assignment board, auto-forward feed",
    cta: "Open planning",
    accent: false,
  },
];

const FEATURES = [
  { icon: "📥", t: "Three-channel ingestion", d: "Auto-forwarded emails, file/photo import, audited manual entry — pendency, cutoffs and masters refresh on a regular cadence." },
  { icon: "🗺️", t: "Live pendency vs deployment", d: "Terminal-wise pending TEUs, aging and scan streams beside the ITVs you've actually assigned — gaps show red." },
  { icon: "🚚", t: "Pick-and-send assignment", d: "Assign the actual ITV to terminal × movement from a global multi-vendor pool with eligibility tags and driver notes." },
  { icon: "✅", t: "Verified trips", d: "GPS cycle + terminal ticket OCR + yard record — a trip only counts when the three agree. No TOS access needed." },
  { icon: "₹", t: "Incentive engine", d: "Per-TEU rate card with night, boost and milestone rules. Versioned settings; live meter for the driver, ledger and approvals for you." },
  { icon: "🛠️", t: "Issues & audit", d: "Standby, gate rejections, breakdowns, plan changes — typed, owned, escalated. Every manual entry stamped who/when/why." },
];

export default function Home() {
  const { state } = useApp();
  const running = 60 + state.vehicles.filter((v) => v.status === "running").length;
  const completed = state.trips.filter((t) => t.state === "completed");
  const liveTeu = SHIFT.teuDoneBase + completed.filter((t) => t.id >= 1000).reduce((a, t) => a + t.teu, 0);
  const poolImp = state.pool.filter((c) => (c.direction ?? "import") === "import").length;
  const poolExp = state.pool.filter((c) => c.direction === "export").length;
  const openIssues = state.issues.filter((i) => i.status !== "resolved").length;
  const paidToday = state.trips.reduce((a, t) => a + (t.earnings?.total ?? 0), 0);

  return (
    <main className="min-h-screen w-full">
      {/* nav */}
      <nav className="bg-white border-b border-[#D8DEE7]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Wordmark />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-[#177A47] bg-[#E3F4EB] rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1E9E5A] inline-block" /> {SITE.name} · live
            </span>
            <Link href="/console" className="bg-[#1F3864] text-white text-[13px] font-bold px-4 py-2 rounded-lg hover:bg-[#2E5395]">
              Open console
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="bg-[#1F3864] text-white border-b-4 border-[#E8641B]">
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">
          <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#FFB07A] mb-3">
            Container yard ITV management · pilot
          </p>
          <h1 className="text-[clamp(28px,4.5vw,44px)] font-extrabold leading-[1.1] max-w-[22ch] [text-wrap:balance]">
            Every trip verified. Every rupee visible. Every ITV accounted for.
          </h1>
          <p className="text-[#C9D4E6] mt-4 max-w-[62ch] text-[15px]">
            One system from the terminal&apos;s pendency email to the driver&apos;s incentive — planning, live tracking,
            issue evidence and payouts, without needing the port&apos;s TOS.
          </p>
          <div className="flex gap-3 mt-7 flex-wrap">
            <Link href="/console" className="bg-[#E8641B] text-white font-bold text-[14px] px-5 py-2.5 rounded-lg hover:brightness-110">
              Command center →
            </Link>
            <Link href="/driver" className="border border-[#4A5F85] text-[#C9D4E6] font-bold text-[14px] px-5 py-2.5 rounded-lg hover:bg-white/5">
              Driver app preview
            </Link>
          </div>

          {/* live stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[#2E4470] rounded-xl overflow-hidden mt-10 border border-[#2E4470]">
            {[
              { k: "ITVs running", v: `${running}`, s: `of ${SHIFT.itvsAllotted} allotted` },
              { k: "TEUs this shift", v: `${liveTeu}`, s: `target ${SITE.shiftTeuTarget}` },
              { k: "Container pool", v: `${poolImp}`, s: `import · ${poolExp} export` },
              { k: "Incentives accrued", v: fmtInr(paidToday), s: "verified trips" },
              { k: "Open issues", v: `${openIssues}`, s: "owned & tracked" },
            ].map((x) => (
              <div key={x.k} className="bg-[#24365A] px-4 py-3.5">
                <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#8FA3C7]">{x.k}</p>
                <p className="text-[24px] font-extrabold tabular-nums leading-tight mt-0.5">{x.v}</p>
                <p className="text-[11px] text-[#8FA3C7]">{x.s}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* role entry points */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-[13px] font-bold tracking-[0.12em] uppercase text-[#5C6B80] mb-4">Workspaces</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <Link
              key={r.title}
              href={r.href}
              className={`group bg-white rounded-xl border p-5 hover:shadow-lg transition-shadow ${
                r.accent ? "border-[#E8641B]/50 border-t-4 border-t-[#E8641B]" : "border-[#D8DEE7] border-t-4 border-t-[#1F3864]"
              }`}
            >
              <p className="text-[10px] font-bold tracking-[0.12em] text-[#5C6B80] uppercase">{r.tag}</p>
              <h3 className="text-[17px] font-bold mt-1.5">{r.title}</h3>
              <p className="text-[13px] text-[#5C6B80] mt-1.5 min-h-[40px]">{r.desc}</p>
              <p className="text-[13px] font-bold text-[#1F3864] mt-3 group-hover:text-[#E8641B]">{r.cta} →</p>
            </Link>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="bg-white border-y border-[#D8DEE7]">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <h2 className="text-[13px] font-bold tracking-[0.12em] uppercase text-[#5C6B80] mb-5">What the system does</h2>
          <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.t} className="flex gap-3.5">
                <span className="flex-none w-10 h-10 rounded-lg bg-[#EDF0F4] grid place-items-center text-[18px] font-extrabold text-[#E8641B]">
                  {f.icon}
                </span>
                <div>
                  <h3 className="text-[15px] font-bold">{f.t}</h3>
                  <p className="text-[13px] text-[#5C6B80] mt-1">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#5C6B80]">
        <Wordmark compact />
        <span>
          Navin Group · O&amp;M Tech · pilot v0.5 · backend:{" "}
          <b className="text-[#1F3864]">{process.env.NEXT_PUBLIC_BACKEND === "supabase" ? "shared (Supabase)" : "local device"}</b>
        </span>
        <span>{SHIFT.label}</span>
      </footer>
    </main>
  );
}
