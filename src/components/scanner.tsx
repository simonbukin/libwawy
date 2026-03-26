"use client";

import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ScannerProps {
  onScan: (isbn: string) => void;
  onError?: (error: string) => void;
}

export default function Scanner({ onScan, onError }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const hasScannedRef = useRef(false);

  const [status, setStatus] = useState<
    "loading" | "camera_starting" | "scanning" | "error"
  >("loading");
  const [errorDetail, setErrorDetail] = useState("");

  // Stable refs
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let mounted = true;
    let detector: any = null;

    async function start() {
      // Step 1: Check if getUserMedia is available at all
      if (!navigator.mediaDevices?.getUserMedia) {
        fail(
          "Camera API not available. Make sure you're using HTTPS and a supported browser (Safari, Chrome)."
        );
        return;
      }

      // Step 2: Load barcode detector
      try {
        setStatus("loading");
        const mod = await import("barcode-detector/pure");
        const Detector = mod.BarcodeDetector;
        detector = new Detector({
          formats: ["ean_13", "ean_8", "upc_a"],
        });
      } catch (err) {
        fail(
          `Barcode detector failed to load: ${err instanceof Error ? err.message : "unknown error"}`
        );
        return;
      }

      if (!mounted) return;

      // Step 3: Request camera
      try {
        setStatus("camera_starting");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;

        video.srcObject = stream;

        // Wait for video to be ready — needed for Safari
        await new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error("Video failed to load"));
          // Timeout after 5s
          setTimeout(() => reject(new Error("Video load timeout")), 5000);
        });

        await video.play();

        if (!mounted) return;
        setStatus("scanning");
        scanLoop(video, detector);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("NotAllowed") || msg.includes("Permission")) {
          fail(
            "Camera permission denied. Please allow camera access in your browser settings and reload."
          );
        } else if (msg.includes("NotFound") || msg.includes("DevicesNotFound")) {
          fail("No camera found on this device.");
        } else if (msg.includes("NotReadable") || msg.includes("TrackStartError")) {
          fail(
            "Camera is in use by another app. Close other apps using the camera and try again."
          );
        } else {
          fail(`Camera error: ${msg}`);
        }
      }
    }

    function fail(message: string) {
      if (!mounted) return;
      setErrorDetail(message);
      setStatus("error");
      onErrorRef.current?.(message);
    }

    function scanLoop(video: HTMLVideoElement, det: any) {
      if (!mounted || hasScannedRef.current) return;

      rafRef.current = requestAnimationFrame(async () => {
        if (!mounted || hasScannedRef.current) return;

        try {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const barcodes = await det.detect(video);
            for (const barcode of barcodes) {
              const cleaned = barcode.rawValue.replace(/[^0-9X]/gi, "");
              if (cleaned.length === 13 || cleaned.length === 10) {
                hasScannedRef.current = true;
                streamRef.current?.getTracks().forEach((t) => t.stop());
                onScanRef.current(cleaned);
                return;
              }
            }
          }
        } catch {
          // detect() can throw on odd frames — retry
        }

        scanLoop(video, det);
      });
    }

    start();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative rounded-2xl overflow-hidden border-2 border-lavender/30 bg-black">
      {/* Loading / Starting states */}
      {(status === "loading" || status === "camera_starting") && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-lavender border-t-transparent animate-spin" />
          <p className="text-muted text-sm">
            {status === "loading" ? "Loading scanner..." : "Starting camera..."}
          </p>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-peach/20 flex items-center justify-center">
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
          <p className="text-white font-medium text-sm">Camera not available</p>
          <p className="text-white/60 text-xs leading-relaxed">{errorDetail}</p>
        </div>
      )}

      {/* Camera feed — always in DOM so Safari can attach the stream */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full aspect-[4/3] object-cover ${
          status !== "scanning" ? "hidden" : ""
        }`}
      />

      {/* Scan overlay */}
      {status === "scanning" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-[75%] max-w-[320px] h-[140px] rounded-xl">
            <div
              className="absolute inset-0 rounded-xl"
              style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.3)" }}
            />
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-card/80 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-card/80 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-card/80 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-card/80 rounded-br-lg" />
            <div className="absolute left-4 right-4 h-0.5 bg-lavender/80 animate-pulse top-1/2" />
          </div>
          <p className="absolute bottom-4 text-white/70 text-xs">
            Align barcode within the frame
          </p>
        </div>
      )}
    </div>
  );
}
