import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Overview from "./pages/Overview.jsx";
import Videos from "./pages/Videos.jsx";
import CalibrationList from "./pages/CalibrationList.jsx";
import CalibrationWizard from "./pages/CalibrationWizard.jsx";
import Monitor from "./pages/Monitor.jsx";
import Violations from "./pages/Violations.jsx";
import Analytics from "./pages/Analytics.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="videos" element={<Videos />} />
        <Route path="calibration" element={<CalibrationList />} />
        <Route path="calibration/:videoId" element={<CalibrationWizard />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="monitor/:runId" element={<Monitor />} />
        <Route path="violations" element={<Violations />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
