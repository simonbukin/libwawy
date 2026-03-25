"use client";

import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DetectorInstance = any;

interface ScannerProps {
  onScan: (isbn: string) => void;
  onError?: (error: string) => void;
}

export default function Scanner({ onScan, onError }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<DetectorInstance>(null);
  const rafRef = useRef<number>(0);
  const hasScannedRef = useRef(false);

  const [isInitializing, setIsInitializing] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Stable refs so the effect doesn't re-run when parent re-renders
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        // barcode-detector/pure: uses native BarcodeDetector where available,
        // falls back to ZXing-C++ WASM otherwise
        const { BarcodeDetector: Detector } = await import(
          /* webpackIgnore: true */ "barcode-detector/pure"
        ) as { BarcodeDetector: any };

        const detector = new Detector({
          formats: ["ean_13", "ean_8", "upc_a"],
        });
        detectorRef.current = detector;

        // Request rear camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();

        if (mounted) {
          setIsInitializing(false);
          scanLoop(video, detector);
        }
      } catch (err) {
        if (!mounted) return;
        const msg =
          err instanceof Error ? err.message : "Failed to start camera";
        setPermissionError(msg);
        setIsInitializing(false);
        onErrorRef.current?.(msg);
      }
    }

    function scanLoop(video: HTMLVideoElement, detector: DetectorInstance) {
      if (!mounted || hasScannedRef.current) return;

      rafRef.current = requestAnimationFrame(async () => {
        if (!mounted || hasScannedRef.current) return;

        try {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const barcodes = await detector.detect(video);

            for (const barcode of barcodes) {
              const raw = barcode.rawValue;
              const cleaned = raw.replace(/[^0-9X]/gi, "");

              if (cleaned.length === 13 || cleaned.length === 10) {
                hasScannedRef.current = true;
                streamRef.current?.getTracks().forEach((t) => t.stop());
                onScanRef.current(cleaned);
                return;
              }
            }
          }
        } catch {
          // detect() can throw on some frames — just retry next frame
        }

        scanLoop(video, detector);
      });
    }

    init();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative rounded-2xl overflow-hidden border-2 border-[#B8A9D4]/30 bg-black">
      {isInitializing && !permissionError && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#B8A9D4] border-t-transparent animate-spin" />
          <p className="text-[#8A7F85] text-sm">Starting camera...</p>
        </div>
      )}

      {permissionError && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-[#F5C6AA]/20 flex items-center justify-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#D4956F"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <p className="text-white font-medium text-sm">Camera access needed</p>
          <p className="text-white/60 text-xs">
            Allow camera access to scan barcodes. Check your browser settings if
            the prompt didn&apos;t appear.
          </p>
        </div>
      )}

      {/* Camera feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        className={`w-full aspect-[4/3] object-cover ${
          isInitializing || permissionError ? "hidden" : ""
        }`}
      />

      {/* Scan region overlay */}
      {!isInitializing && !permissionError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Dimmed edges */}
          <div className="absolute inset-0 bg-black/30" />
          {/* Clear scan window */}
          <div className="relative w-[75%] max-w-[320px] h-[140px] rounded-xl overflow-hidden">
            <div
              className="absolute inset-0 rounded-xl"
              style={{
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.3)",
              }}
            />
            {/* Corner markers */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/80 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/80 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/80 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/80 rounded-br-lg" />
            {/* Scanning line animation */}
            <div className="absolute left-4 right-4 h-0.5 bg-[#B8A9D4]/80 animate-pulse top-1/2" />
          </div>
          {/* Hint text */}
          <p className="absolute bottom-4 text-white/70 text-xs">
            Align barcode within the frame
          </p>
        </div>
      )}
    </div>
  );
}
