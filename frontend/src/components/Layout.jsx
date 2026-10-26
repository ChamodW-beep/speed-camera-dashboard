import { NavLink, Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { Activity, ChartColumn, LayoutDashboard, Ruler, Settings, TriangleAlert, Video } from "lucide-react";
import { api } from "../api.js";
import { usePoll, useUploader } from "../hooks.js";
import UploadButton from "./UploadButton.jsx";
import { Notice } from "./ui.jsx";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true, sub: "Where things stand" },
  { to: "/videos", label: "Videos", icon: Video, sub: "Your footage" },
  { to: "/calibration", label: "Calibration", icon: Ruler, sub: "Teach the app the size of the road" },
  { to: "/monitor", label: "Live monitor", icon: Activity, sub: "Watch speeds being measured" },
  { to: "/violations", label: "Violations", icon: TriangleAlert, sub: "Vehicles over the limit" },
  { to: "/analytics", label: "Analytics", icon: ChartColumn, sub: "Patterns in the traffic" },
  { to: "/settings", label: "Settings", icon: Settings, sub: "Limit, units and detection" },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <svg width="38" height="38" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1c2328" />
        <rect x="14.5" y="4" width="3" height="7" fill="#f2b705" />
        <rect x="14.5" y="13" width="3" height="7" fill="#f2b705" />
        <rect x="14.5" y="22" width="3" height="6" fill="#f2b705" />
      </svg>
      <div className="leading-tight">
        <p className="font-display text-[22px] font-semibold tracking-wide text-ink">SpeedWatch</p>
        <p className="text-[13px] text-ink-3">Road speed from video</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const health = usePoll(api.health, 4000, []);
  const overview = usePoll(api.overview, 4000, []);
  const uploader = useUploader((video) => navigate("/calibration/" + video.id));

  const online = Boolean(health.data) && !health.error;
  const activeRun = overview.data ? overview.data.active_run : null;
  const current =
    NAV.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))) || NAV[0];

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-line bg-white px-4 py-5 md:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-8 flex flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                "flex items-center gap-3 border-l-4 px-3 py-2.5 text-[16px] transition-colors " +
                (isActive
                  ? "border-marking bg-paper font-medium text-ink"
                  : "border-transparent text-ink-2 hover:bg-paper hover:text-ink")
              }
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto rounded-lg bg-paper px-3 py-2.5 text-[14px] text-ink-2">
          <div className="flex items-center gap-2">
            <span className={"h-2.5 w-2.5 rounded-full " + (online ? "bg-sign" : "bg-alert")} />
            {online ? "Backend connected" : "Backend not reachable"}
          </div>
        </div>
      </aside>

      <div className="md:pl-[248px]">
        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-3 py-2 md:hidden" aria-label="Main">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                "whitespace-nowrap rounded-md px-3 py-1.5 text-[15px] " +
                (isActive ? "bg-asphalt text-white" : "text-ink-2")
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-white px-6 py-4 md:px-9">
          <div>
            <h1 className="text-[32px] leading-none text-ink">{current.label}</h1>
            <p className="mt-1 text-[15px] text-ink-2">{current.sub}</p>
          </div>
          <div className="flex items-center gap-3">
            {activeRun ? (
              <Link
                to={"/monitor/" + activeRun}
                className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[15px] text-ink hover:bg-paper"
              >
                <span className="live-dot h-2.5 w-2.5 rounded-full bg-marking" />
                Measuring now
              </Link>
            ) : null}
            <UploadButton uploader={uploader} />
          </div>
        </header>

        <main className="space-y-5 px-6 py-6 md:px-9 md:py-8">
          {!online && !health.loading ? (
            <Notice tone="error">
              The backend isn't running. Open a terminal in the project folder and run <b>./start.sh</b>, then refresh
              this page.
            </Notice>
          ) : null}
          {online && health.data.detector === "missing" ? (
            <Notice tone="warn">
              The detection library (ultralytics) isn't installed in the backend. In <b>backend</b>, activate the
              environment and run <b>pip install -r requirements.txt</b>. Until then, videos can be uploaded and
              calibrated but not measured.
            </Notice>
          ) : null}
          {uploader.error ? (
            <Notice tone="error" onClose={uploader.dismiss}>
              {uploader.error}
            </Notice>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
