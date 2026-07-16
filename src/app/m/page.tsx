"use client";

// Onboarding — seen ONCE per device. Phone number → looked up in the masters
// (master control decides the role) → confirm → identity saved on the device.
// Every launch after this goes straight to the person's view, zero clicks.
// Testing escape: /m?reset=1 clears the device identity.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, SUPERVISORS } from "@/lib/store";
import { getIdentity, setIdentity, clearIdentity, roleHome, normPhone, MobileRole } from "@/lib/identity";
import { LogoMark } from "@/components/Brand";

const ROLE_HI: Record<MobileRole, string> = { driver: "ड्राइवर", operator: "ऑपरेटर", supervisor: "सुपरवाइज़र" };

export default function Onboarding() {
  const router = useRouter();
  const { state } = useApp();
  const [phone, setPhone] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [ready, setReady] = useState(false);

  // already onboarded → straight to their view (unless ?reset=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") === "1") {
      clearIdentity();
      setReady(true);
      return;
    }
    const id = getIdentity();
    if (id) router.replace(roleHome(id.role));
    else setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // lookup across the masters — the master control decides who you are
  const match = useMemo(() => {
    const p = normPhone(phone);
    if (p.length < 10) return null;
    const d = state.drivers.find((x) => normPhone(x.phone) === p);
    if (d) return { personId: d.id, role: "driver" as MobileRole, name: d.name, nameLocal: d.nameHi };
    const o = state.operators.find((x) => normPhone(x.phone) === p);
    if (o) return { personId: o.id, role: "operator" as MobileRole, name: o.name };
    const s = SUPERVISORS.find((x) => normPhone(x.phone) === p);
    if (s) return { personId: s.id, role: "supervisor" as MobileRole, name: s.name };
    return null;
  }, [phone, state.drivers, state.operators]);

  useEffect(() => {
    setNotFound(normPhone(phone).length === 10 && !match);
  }, [phone, match]);

  const confirm = () => {
    if (!match) return;
    setIdentity({ ...match, setAt: new Date().toISOString() });
    router.replace(roleHome(match.role));
  };

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-[#101A28] text-[#EAF0F8] flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-[360px] flex flex-col items-center gap-7">
        <div className="flex flex-col items-center gap-3">
          <LogoMark size={72} />
          <p className="text-[26px] font-extrabold tracking-tight">
            <span className="text-[#E8641B]">NG</span> Marshal
          </p>
        </div>

        {!match ? (
          <>
            <div className="text-center">
              <p className="text-[24px] font-extrabold">अपना फ़ोन नंबर डालें</p>
              <p className="text-[14px] text-[#8FA0B5] mt-1.5">Enter your phone number · एक ही बार</p>
            </div>
            <input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 12))}
              placeholder="98250 11223"
              className="w-full bg-[#1A2739] border-2 border-[#2A3A50] focus:border-[#E8641B] rounded-2xl px-5 py-5 text-center text-[30px] font-extrabold tracking-[0.08em] tabular-nums outline-none placeholder-[#3d4f68]"
            />
            {notFound && (
              <div className="w-full bg-[#1A2739] border-2 border-[#D64545]/60 rounded-2xl p-4 text-center">
                <p className="text-[18px] font-extrabold text-[#FF9E9E]">नंबर नहीं मिला</p>
                <p className="text-[13px] text-[#C6D2E2] mt-1">अपने supervisor से बात करें — master control में आपका नंबर जुड़वाएँ</p>
              </div>
            )}
          </>
        ) : (
          <div className="w-full flex flex-col items-center gap-6">
            <div className="text-center">
              <p className="text-[34px] font-extrabold leading-tight">नमस्ते {match.nameLocal ?? match.name.split(" ")[0]}!</p>
              <p className="text-[20px] font-bold text-[#4CD584] mt-2">आप {ROLE_HI[match.role]} हैं</p>
              <p className="text-[13px] text-[#8FA0B5] mt-1">{match.name} · {match.role}</p>
            </div>
            <button
              onClick={confirm}
              className="w-full bg-[#1E9E5A] rounded-full py-5 text-[22px] font-extrabold text-white active:scale-[0.98]"
            >
              शुरू करो →
            </button>
            <button onClick={() => setPhone("")} className="text-[13px] text-[#8FA0B5]">गलत नंबर? वापस</button>
          </div>
        )}

        <p className="text-[11px] text-[#5C6B80] text-center">आपकी पहचान master control से आती है — रोल चुनने की ज़रूरत नहीं</p>
      </div>
    </main>
  );
}
