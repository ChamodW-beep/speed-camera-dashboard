import { Link } from "react-router-dom";
import { Ruler } from "lucide-react";
import { api, url } from "../api.js";
import { usePoll } from "../hooks.js";
import { Badge, buttonClass, EmptyState, PageIntro, Panel, Spinner } from "../components/ui.jsx";

export default function CalibrationList() {
  const { data: videos, loading } = usePoll(api.videos, 0, []);

  return (
    <>
      <PageIntro>
        A video doesn't know how big the road is. Calibration fixes that: you mark four corners of a rectangle on the road and
        type its real width and length. From that, the app works out how many metres each pixel is worth, and corrects for
        perspective so near and far vehicles are measured fairly. Every camera position needs its own calibration.
      </PageIntro>

      {loading && !videos ? <Spinner /> : null}
      {videos && videos.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Ruler}
            title="Nothing to calibrate yet"
            text="Add a video first, then come back here."
            action={
              <Link to="/videos" className={buttonClass("primary")}>
                Go to videos
              </Link>
            }
          />
        </Panel>
      ) : null}
      {videos && videos.length > 0 ? (
        <Panel bodyClass="p-0">
          <ul className="divide-y divide-line-2">
            {videos.map((video) => (
              <li key={video.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <img src={url(video.thumb_url)} alt="" className="h-16 w-28 rounded-md bg-asphalt object-cover" loading="lazy" />
                <div className="min-w-[200px] flex-1">
                  <p className="text-[18px] font-medium text-ink">{video.name}</p>
                  {video.calibrated ? (
                    <p className="text-[14px] text-ink-2">
                      Real size {video.calibration.width_m} m × {video.calibration.length_m} m · about{" "}
                      <span className="num text-[16px]">{video.calibration.meters_per_pixel}</span> m per pixel in the middle of the road
                    </p>
                  ) : (
                    <p className="text-[14px] text-ink-2">Not calibrated yet</p>
                  )}
                </div>
                {video.calibrated ? <Badge tone="good">Calibrated</Badge> : <Badge tone="warn">Needs calibration</Badge>}
                <Link to={"/calibration/" + video.id} className={buttonClass(video.calibrated ? "secondary" : "primary")}>
                  {video.calibrated ? "Review or redo" : "Calibrate"}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
