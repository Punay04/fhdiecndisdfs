import { NavLink, Route, Routes } from "react-router";

import { api } from "./api/client";
import { AppProvider } from "./AppContext";
import { ErrorState, Loading } from "./components/States";
import { useApi } from "./lib/useApi";
import { AccuracyPage } from "./pages/AccuracyPage";
import { DecisionPage } from "./pages/DecisionPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { MethodologyPage } from "./pages/MethodologyPage";

const NAV = [
  { to: "/", label: "Day-ahead decision", end: true },
  { to: "/accuracy", label: "Forecast accuracy", end: false },
  { to: "/explorer", label: "Explorer", end: false },
  { to: "/methodology", label: "Methodology", end: false },
];

export function App() {
  const meta = useApi("meta", api.meta);

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink to="/" className="brand">
            <img src="/favicon.svg" alt="" />
            <span className="brand__name">
              Wind Forecast Monitor
              <span className="brand__tag">GB day-ahead · January 2026 pilot</span>
            </span>
          </NavLink>
          <nav className="nav" aria-label="Main">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="page">
        {meta.error && <ErrorState error={meta.error} />}
        {!meta.data && !meta.error && <Loading />}
        {meta.data && (
          <AppProvider meta={meta.data}>
            <Routes>
              <Route path="/" element={<DecisionPage />} />
              <Route path="/accuracy" element={<AccuracyPage />} />
              <Route path="/explorer" element={<ExplorerPage />} />
              <Route path="/methodology" element={<MethodologyPage />} />
              <Route path="*" element={<DecisionPage />} />
            </Routes>
          </AppProvider>
        )}
      </main>

      <footer className="app-footer">
        <div className="page">
          Data: Elexon BMRS — national wind outturn (FUELHH) and wind generation forecast (WINDFOR).
        </div>
      </footer>
    </>
  );
}
