"use client";

import { useEffect, useRef, useState } from "react";
import usePlacesAutocomplete, { getGeocode } from "use-places-autocomplete";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const SCRIPT_ID = "google-maps-places-script";

function inputStyle(): React.CSSProperties {
  return { width: "100%", padding: "6px 8px", fontSize: 12, border: "0.5px solid var(--border-lo)", borderRadius: 4, fontFamily: "inherit" };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

type AddressParts = { city: string; state: string; zip: string };

function partsFromComponents(
  components: google.maps.GeocoderAddressComponent[]
): AddressParts {
  const get = (type: string, short = false) => {
    const c = components.find((x) => x.types.includes(type));
    return c ? (short ? c.short_name : c.long_name) : "";
  };
  const city =
    get("locality") || get("sublocality") || get("postal_town") || get("administrative_area_level_2");
  return {
    city,
    state: get("administrative_area_level_1", true),
    zip: get("postal_code"),
  };
}

/**
 * Address + City/State/ZIP fields with US-only Google Places autocomplete on the
 * street address. Selecting a suggestion fills city/state/zip. When no
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured (or the script fails to load) it
 * gracefully degrades to plain text inputs. All fields keep their `name`
 * attributes so the surrounding <form>'s FormData read is unaffected.
 */
export default function AddressAutocompleteFields() {
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    if (typeof window !== "undefined" && window.google?.maps?.places) {
      setScriptReady(true);
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => setScriptReady(true));
      existing.addEventListener("error", () => setScriptFailed(true));
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => setScriptFailed(true);
    document.head.appendChild(script);
  }, []);

  if (!GOOGLE_MAPS_API_KEY || scriptFailed) {
    return <PlainFields />;
  }
  if (!scriptReady) {
    return <PlainFields placeholderHint="Loading address search…" />;
  }
  return <AutocompleteFields />;
}

function PlainFields({ placeholderHint }: { placeholderHint?: string }) {
  return (
    <>
      <Field label="Address">
        <input
          name="address"
          required
          style={inputStyle()}
          placeholder={placeholderHint || "2247 Meadowbrook Blvd."}
        />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 90px", gap: 8 }}>
        <Field label="City"><input name="city" required placeholder="e.g. Cleveland" style={inputStyle()} /></Field>
        <Field label="State"><input name="state" required placeholder="OH" maxLength={2} style={inputStyle()} /></Field>
        <Field label="ZIP"><input name="zip" required placeholder="44106" style={inputStyle()} /></Field>
      </div>
    </>
  );
}

function AutocompleteFields() {
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: "us" },
      types: ["address"],
    },
    debounce: 250,
  });

  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [zip, setZip] = useState("");
  const [showList, setShowList] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowList(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleSelect = async (description: string) => {
    setValue(description, false);
    clearSuggestions();
    setShowList(false);
    try {
      const results = await getGeocode({ address: description });
      if (results[0]) {
        const parts = partsFromComponents(results[0].address_components);
        if (parts.city) setCity(parts.city);
        if (parts.state) setStateVal(parts.state);
        if (parts.zip) setZip(parts.zip);
      }
    } catch {
      // Geocode failed — leave city/state/zip for manual entry.
    }
  };

  return (
    <>
      <Field label="Address">
        <div ref={wrapRef} style={{ position: "relative" }}>
          <input
            name="address"
            required
            autoComplete="off"
            disabled={!ready}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setShowList(true);
            }}
            onFocus={() => setShowList(true)}
            style={inputStyle()}
            placeholder="Start typing a US address…"
          />
          {showList && status === "OK" && (
            <ul
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                margin: 0,
                padding: 0,
                listStyle: "none",
                background: "#fff",
                border: "0.5px solid var(--border-lo)",
                borderRadius: 4,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                zIndex: 1200,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {data.map((sug) => (
                <li key={sug.place_id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(sug.description)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "7px 10px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    {sug.description}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 90px", gap: 8 }}>
        <Field label="City">
          <input name="city" required placeholder="e.g. Cleveland" style={inputStyle()} value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="State">
          <input name="state" required placeholder="OH" maxLength={2} style={inputStyle()} value={stateVal} onChange={(e) => setStateVal(e.target.value)} />
        </Field>
        <Field label="ZIP">
          <input name="zip" required placeholder="44106" style={inputStyle()} value={zip} onChange={(e) => setZip(e.target.value)} />
        </Field>
      </div>
    </>
  );
}
