import { Routes, Route, Navigate } from "react-router";
import { Shell } from "./components/layout/Shell";
import { ProfessionsPage } from "./components/professions/ProfessionsPage";
import { TransfersPage } from "./components/transfers/TransfersPage";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="professions" element={<ProfessionsPage />} />
        <Route path="transfers" element={<TransfersPage />} />
        <Route path="*" element={<Navigate to="/professions" replace />} />
      </Route>
    </Routes>
  );
}
