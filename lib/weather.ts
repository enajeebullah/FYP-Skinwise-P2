"use client";

export interface WeatherData {
  temperatureC: number;
  humidityPct: number;
  uvIndex: number;
  locationLabel: string;
}

/**
 * Uses Open-Meteo instead of OpenWeatherMap: it needs no API key, which
 * matters here because this app runs entirely client-side — any key baked
 * into the frontend bundle would be visible to anyone who opens dev tools.
 * Open-Meteo's free tier covers exactly what the routine engine needs:
 * current temperature, relative humidity, and UV index.
 */
export async function fetchWeather(): Promise<WeatherData> {
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation isn't supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      maximumAge: 10 * 60 * 1000,
    });
  });

  const { latitude, longitude } = position.coords;

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,uv_index&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather service unavailable.");
  const json = await res.json();

  return {
    temperatureC: json.current.temperature_2m,
    humidityPct: json.current.relative_humidity_2m,
    uvIndex: json.current.uv_index,
    locationLabel: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
  };
}
