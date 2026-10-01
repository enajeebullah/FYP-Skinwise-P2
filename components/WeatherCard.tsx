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
    <div className="weather-dashboard-card">
      <div className="weather-dashboard-heading">
        <span className="weather-dashboard-heading-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M7 18h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 9.5 4.3 4.3 0 0 0 7 18Z" />
            <path d="m8 4 1 1.5M16 4l-1 1.5" />
          </svg>
        </span>
        <h2>Live Weather Context</h2>
        <span className="weather-info-mark" title="Weather adjusts skincare guidance when available." aria-label="Weather adjusts skincare guidance when available.">i</span>
      </div>

      {status === "loading" && (
        <div className="weather-loading" role="status">
          <span className="weather-loading-orb" aria-hidden="true" />
          <span>Reading local conditions…</span>
        </div>
      )}

      {status === "done" && weather && (
        <>
          <div className="weather-metrics">
            <div className="weather-metric weather-temperature">
              <span className="weather-metric-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M14 14.8V5a3 3 0 0 0-6 0v9.8a5 5 0 1 0 6 0Z" />
                  <path d="M11 12v6" />
                </svg>
              </span>
              <span className="weather-metric-copy">
                <strong>{weather.temperatureC.toFixed(0)}°C</strong>
                <small>Temperature</small>
              </span>
            </div>
            <div className="weather-metric weather-humidity">
              <span className="weather-metric-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 3s6 6.5 6 11a6 6 0 1 1-12 0c0-4.5 6-11 6-11Z" />
                  <path d="M9 15a3 3 0 0 0 3 3" />
                </svg>
              </span>
              <span className="weather-metric-copy">
                <strong>{weather.humidityPct.toFixed(0)}%</strong>
                <small>Humidity</small>
              </span>
            </div>
            <div className="weather-metric weather-uv">
              <span className="weather-metric-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              </span>
              <span className="weather-metric-copy">
                <strong>{weather.uvIndex.toFixed(1)}</strong>
                <small>UV Index · {uvRiskLabel(weather.uvIndex)} risk</small>
              </span>
            </div>
            <div className="weather-illustration" aria-hidden="true">
              <span className="weather-sun" />
              <span className="weather-cloud" />
            </div>
          </div>

          <div className="weather-advice">
            <span className="weather-advice-icon" aria-hidden="true">☼</span>
            <div>
              <p>Today&rsquo;s Advice</p>
              <ul>
              {weatherAdvice(weather).map((line, i) => (
                  <li key={i}>{line}</li>
              ))}
              </ul>
            </div>
          </div>
        </>
      )}

      {status === "denied" && (
        <div className="weather-unavailable">
          <p>
            Location access was declined, so the routine below uses skin-type
            and severity only (no weather adjustment).
          </p>
          <button
            onClick={requestWeather}
            className="focus-ring"
          >
            Allow location access
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="weather-unavailable">
          <p>
            Couldn&rsquo;t reach the weather service. The routine below skips
            weather adjustment.
          </p>
          <button
            onClick={requestWeather}
            className="focus-ring"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
