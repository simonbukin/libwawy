"use client";

import { useEffect, useRef, useState } from "react";

interface ScannerProps {
  onScan: (isbn: string) => void;
  onError?: (error: string) => void;
}

export default function Scanner({ onScan, onError }: ScannerProps) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const scannerInstanceRef = useRef<unknown>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initScanner() {
      try {
        const { Html5QrcodeScanner } = await import("html5-qrcode");

        if (!mounted) return;

        const scanner = new Html5QrcodeScanner(
          "barcode-scanner",
          {
            fps: 10,
            qrbox: { width: 280, height: 160 },
            aspectRatio: 1.6,
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: true,
          },
          false
        );

        scannerInstanceRef.current = scanner;

        scanner.render(
          (decodedText: string) => {
            // ISBN-13 is 13 digits, ISBN-10 is 10 digits
            const cleaned = decodedText.replace(/[^0-9X]/gi, "");
            if (cleaned.length === 13 || cleaned.length === 10) {
              onScan(cleaned);
            }
          },
          (errorMessage: string) => {
            // Ignore continuous scanning errors (they fire on every frame without a barcode)
            if (errorMessage.includes("No barcode")) return;
            if (errorMessage.includes("NotFoundException")) return;
          }
        );

        if (mounted) {
          setIsInitializing(false);
        }
      } catch (err) {
        if (mounted) {
          const message =
            err instanceof Error ? err.message : "Failed to initialize scanner";
          setPermissionError(message);
          setIsInitializing(false);
          onError?.(message);
        }
      }
    }

    initScanner();

    return () => {
      mounted = false;
      if (scannerInstanceRef.current) {
        try {
          (scannerInstanceRef.current as { clear: () => Promise<void> })
            .clear()
            .catch(() => {});
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [onScan, onError]);

  return (
    <div className="relative">
      {isInitializing && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#B8A9D4] border-t-transparent animate-spin" />
          <p className="text-[#8A7F85] text-sm">Starting camera...</p>
        </div>
      )}

      {permissionError && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 px-6 text-center">
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
          <p className="text-[#3D3539] font-medium text-sm">Camera access needed</p>
          <p className="text-[#8A7F85] text-xs">
            Please allow camera access to scan barcodes. You may need to update
            your browser permissions.
          </p>
        </div>
      )}

      <div
        id="barcode-scanner"
        ref={scannerRef}
        className="rounded-2xl overflow-hidden border-2 border-[#B8A9D4]/30 [&_video]:rounded-xl"
      />
    </div>
  );
}
