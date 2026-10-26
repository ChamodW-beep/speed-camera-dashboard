import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useSettings } from "../settings.jsx";
import { Button, Field, inputClass, Notice, Panel, SpeedSign } from "../components/ui.jsx";

export default function SettingsPage() {
  const { values, options, save, refresh } = useSettings();
  const navigate = useNavigate();
  const [form, setForm] = useState(values);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(values), [values]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setMessage(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await save({
        speed_limit: Number(form.speed_limit),
        units: form.units,
        quality: form.quality,
        model: form.model,
        confidence: Number(form.confidence),
      });
      setMessage({ tone: "good", text: "Settings saved. They apply to the next run you start." });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const wipe = async () => {
    if (!window.confirm("Delete ALL videos, runs, vehicles and pictures? This can't be undone.")) return;
    try {
      await api.reset();
      await refresh();
      navigate("/");
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    }
  };

  const limitShown = Math.round(Number(form.speed_limit) || 0);
  const NICE = {
    kmh: "Kilometres per hour (km/h)",
    mph: "Miles per hour (mph)",
    fast: "Fast",
    balanced: "Balanced",
    accurate: "Accurate",
    "yolov8n.pt": "Small (fastest)",
    "yolov8s.pt": "Medium (recommended)",
    "yolov8m.pt": "Large (most accurate)",
  };
  const choices = (list) => (list || []).map((o) => [o, NICE[o] || o]);

  return (
    <div className="max-w-3xl space-y-6">
      <form onSubmit={submit} className="space-y-6">
        <Panel title="Speed limit">
          <div className="flex flex-wrap items-center gap-6">
            <SpeedSign value={limitShown} size={96} />
            <div className="flex-1">
              <Field label="Limit (in km/h)" htmlFor="limit" hint="Vehicles whose top speed is above this are flagged. The limit is always stored in km/h.">
                <input id="limit" type="number" min="10" max="300" step="1" className={inputClass} value={form.speed_limit} onChange={(e) => set("speed_limit", e.target.value)} />
              </Field>
            </div>
          </div>
        </Panel>

        <Panel title="Display">
          <Field label="Show speeds in" htmlFor="units">
            <select id="units" className={inputClass} value={form.units} onChange={(e) => set("units", e.target.value)}>
              {choices(options.units).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </Panel>

        <Panel title="Detection">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Quality" htmlFor="quality" hint="Higher quality sees smaller and farther vehicles but runs slower.">
              <select id="quality" className={inputClass} value={form.quality} onChange={(e) => set("quality", e.target.value)}>
                {choices(options.quality).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model" htmlFor="model" hint="Bigger models are more accurate and slower. The first use downloads the model.">
              <select id="model" className={inputClass} value={form.model} onChange={(e) => set("model", e.target.value)}>
                {choices(options.model).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={"Confidence: " + Number(form.confidence).toFixed(2)} htmlFor="confidence" hint="Lower finds more vehicles but adds false ones.">
              <input id="confidence" type="range" min="0.05" max="0.9" step="0.05" className="w-full accent-[#1c2328]" value={form.confidence} onChange={(e) => set("confidence", e.target.value)} />
            </Field>
          </div>
        </Panel>

        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? "Saving" : "Save settings"}
        </Button>
      </form>

      <Panel title="Danger zone">
        <p className="mb-4 text-[15px] text-ink-2">Remove every video, run, vehicle and picture and start from a clean slate. Your settings are kept.</p>
        <Button variant="danger" onClick={wipe}>
          Delete all data
        </Button>
      </Panel>
    </div>
  );
}
