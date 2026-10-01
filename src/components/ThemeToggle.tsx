import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Mode = "light" | "dark" | "system";

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try {
      const m = (localStorage.getItem("vdc-theme") as Mode) || "system";
      setMode(m);
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    apply(mode);
    try { localStorage.setItem("vdc-theme", mode); } catch { /* ignore */ }
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => apply("system");
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [mode]);

  const opts: { m: Mode; icon: typeof Sun; label: string }[] = [
    { m: "light", icon: Sun, label: "Light" },
    { m: "dark", icon: Moon, label: "Dark" },
    { m: "system", icon: Monitor, label: "System" },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-sm border border-border p-0.5">
      {opts.map(({ m, icon: I, label }) => (
        <button key={m} role="radio" aria-checked={mode === m} aria-label={label} title={label}
          onClick={() => setMode(m)}
          className={`rounded-sm p-1.5 transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <I className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
