import { useEffect, useState } from "react";
import { Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const TIP_KEY = "agdash-theme-tip-seen";

function tipAlreadySeen() {
  try {
    return localStorage.getItem(TIP_KEY) === "1";
  } catch {
    // localStorage bloqueado: não insiste com o balão
    return true;
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    setMounted(true);
    setShowTip(!tipAlreadySeen());
  }, []);

  const dismissTip = () => {
    setShowTip(false);
    try {
      localStorage.setItem(TIP_KEY, "1");
    } catch {
      // sem persistência: o balão volta na próxima sessão, sem quebrar nada
    }
  };

  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Usar tema claro" : "Usar tema escuro";

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          dismissTip();
          setTheme(isDark ? "light" : "dark");
        }}
        title={label}
        aria-label={label}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border",
          "bg-card text-muted-foreground transition-colors",
          "hover:bg-muted hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        )}
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {showTip && (
        <div
          role="status"
          className="absolute right-0 top-full z-50 mt-2.5 w-64 rounded-lg border border-sky-200 dark:border-sky-800/70 bg-sky-50 dark:bg-sky-950/60 p-3 pr-7 shadow-sm"
        >
          <span
            aria-hidden
            className="absolute -top-[7px] right-2.5 h-3 w-3 rotate-45 border-l border-t border-sky-200 dark:border-sky-800/70 bg-sky-50 dark:bg-sky-950/60"
          />
          <button
            type="button"
            onClick={dismissTip}
            aria-label="Fechar aviso"
            className="absolute right-1.5 top-1.5 rounded p-0.5 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-950/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <p className="text-xs leading-relaxed text-sky-700 dark:text-sky-300">
            nova adição: agora, dá para deixar em modo escuro. teste e veja qual a sua preferência. de
            nada, maria! :)
          </p>
        </div>
      )}
    </div>
  );
}

export default ThemeToggle;
