import { Outlet, NavLink } from "react-router";
import { motion } from "motion/react";
import { FactionSelector } from "./FactionSelector";

const NAV_ITEMS = [
  { to: "/professions", label: "Professions" },
  { to: "/transfers", label: "Transfers" },
];

export function Shell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--color-slate)] bg-[var(--color-abyss)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1800px] items-center gap-6 px-4 py-2">
          <motion.h1
            className="font-display text-lg font-bold tracking-wider text-[var(--color-cyan)] uppercase"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
          >
            Panopticon
          </motion.h1>

          <nav className="flex gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `font-display rounded px-3 py-1.5 text-xs font-medium tracking-wide uppercase transition-colors ${
                    isActive
                      ? "bg-[var(--color-cyan)]/10 text-[var(--color-cyan)]"
                      : "text-[var(--color-ash)] hover:text-[var(--color-fog)]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto">
            <FactionSelector />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
