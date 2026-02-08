import { Routes, Route, Navigate } from "react-router";
import { Shell } from "./components/layout/Shell";
import { ProfessionsPage } from "./components/professions/ProfessionsPage";

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="professions" element={<ProfessionsPage />} />
        <Route path="*" element={<Navigate to="/professions" replace />} />
      </Route>
    </Routes>
  );
}
