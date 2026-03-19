"use client";

import { useCallback, useRef } from "react";

interface FileUploadProps {
  onFileAccepted: (file: File, previewUrl: string) => void;
  isDraggingOver: boolean;
  setIsDraggingOver: (v: boolean) => void;
}

const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "application/pdf",
];

export default function FileUpload({
  onFileAccepted,
  isDraggingOver,
  setIsDraggingOver,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        alert("Kun PNG, JPG, SVG og PDF filer er understøttet.");
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        alert("Filen er for stor. Maks 50 MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        onFileAccepted(file, result);
      };
      reader.readAsDataURL(file);
    },
    [onFileAccepted]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile, setIsDraggingOver]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(true);
    },
    [setIsDraggingOver]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
    },
    [setIsDraggingOver]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`
        relative cursor-pointer rounded-2xl border-2 border-dashed p-12
        flex flex-col items-center justify-center gap-4
        transition-all duration-200
        ${
          isDraggingOver
            ? "border-[#FFD700] bg-[#FFD700]/10 scale-[1.02]"
            : "border-white/20 bg-white/5 hover:border-[#FFD700]/50 hover:bg-white/10"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.svg,.pdf"
        onChange={handleChange}
        className="hidden"
      />

      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl transition-transform ${
          isDraggingOver ? "scale-110" : ""
        }`}
        style={{ background: "rgba(255,215,0,0.15)" }}
      >
        {isDraggingOver ? "📂" : "⬆️"}
      </div>

      <div>
        <p className="text-white font-semibold text-lg mb-1">
          {isDraggingOver ? "Slip filen her" : "Upload dit design"}
        </p>
        <p className="text-white/50 text-sm">
          Træk og slip eller klik for at vælge fil
        </p>
      </div>

      <button
        type="button"
        className="mt-2 bg-[#FFD700] hover:bg-[#FFC200] text-black font-bold px-8 py-3 rounded-xl text-base transition-colors shadow-lg shadow-[#FFD700]/20"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        Vælg fil
      </button>
    </div>
  );
}
