"use client";

import { useEffect, useState } from "react";
import { fetchWeather, type WeatherData } from "@/lib/weather";

interface WeatherCardProps {
  onWeatherReady: (weather: WeatherData | null) => void;
}

type Status = "idle" | "loading" | "done" | "denied" | "error";

// Standard WHO UV Index categories, simplified to 3 tiers for display.
function uvRiskLabel(uv: number): string {
  if (uv < 3) return "Low risk";
  if (uv < 6) return "Moderate risk";
  return "High risk";
}

function weatherAdvice(weather: WeatherData): string[] {
  const advice: string[] = [];
  if (weather.humidityPct >= 60) {
    advice.push("High humidity today — a lightweight, oil-free moisturizer works best.");
  } else if (weather.humidityPct < 30) {
    advice.push("Low humidity today — a richer moisturizer helps prevent extra dryness.");
  }
  if (weather.uvIndex >= 3) {
    advice.push("UV is elevated — sunscreen is strongly recommended before going outside.");
  } else {
    advice.push("UV is low right now, but daily sunscreen is still recommended.");
  }
  return advice;
}

export default function WeatherCard({ onWeatherReady }: WeatherCardProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [weather, setWeather] = useState<WeatherData | null>(null);

  async function requestWeather() {
    setStatus("loading");
    try {
      const data = await fetchWeather();
      setWeather(data);
      setStatus("done");
      onWeatherReady(data);
    } catch (err: any) {
      if (err?.code === 1) {
        setStatus("denied");
      } else {
        setStatus("error");
      }
      onWeatherReady(null);
    }
  }

  useEffect(() => {
    requestWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-2xl border border-line bg-panel panel-elevated p-6">
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted mb-3">
        Live weather context
      </p>

      {status === "loading" && (
        <p className="text-sm text-muted animate-pulseSoft">Reading local conditions…</p>
      )}

      {status === "done" && weather && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="font-display text-2xl">{weather.temperatureC.toFixed(0)}°C</p>
              <p className="text-xs text-muted mt-0.5">Temperature</p>
            </div>
            <div>
              <p className="font-display text-2xl">{weather.humidityPct.toFixed(0)}%</p>
              <p className="text-xs text-muted mt-0.5">Humidity</p>
            </div>
            <div>
              <p className="font-display text-2xl">{weather.uvIndex.toFixed(1)}</p>
              <p className="text-xs text-muted mt-0.5">UV index · {uvRiskLabel(weather.uvIndex)}</p>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-line/60">
            <p className="text-xs font-mono uppercase tracking-wide text-muted mb-2">
              Today&rsquo;s advice
            </p>
            <ul className="space-y-1">
              {weatherAdvice(weather).map((line, i) => (
                <li key={i} className="text-sm text-ink/75">
                  • {line}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {status === "denied" && (
        <div>
          <p className="text-sm text-ink/75">
            Location access was declined, so the routine below uses skin-type
            and severity only (no weather adjustment).
          </p>
          <button
            onClick={requestWeather}
            className="focus-ring mt-3 text-sm font-medium underline underline-offset-4"
          >
            Allow location access
          </button>
        </div>
      )}

      {status === "error" && (
        <div>
          <p className="text-sm text-ink/75">
            Couldn&rsquo;t reach the weather service. The routine below skips
            weather adjustment.
          </p>
          <button
            onClick={requestWeather}
            className="focus-ring mt-3 text-sm font-medium underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
