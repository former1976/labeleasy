"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LabelEditor from "@/components/LabelEditor";

export default function EditorPage() {
  const router = useRouter();
  const [fileData, setFileData] = useState<{
    name: string;
    type: string;
    preview: string;
  } | null>(null);

  useEffect(() => {
    const name = sessionStorage.getItem("labelFile_name");
    const type = sessionStorage.getItem("labelFile_type");
    const preview = sessionStorage.getItem("labelFile_preview");

    if (!name || !type || !preview) {
      router.push("/");
      return;
    }

    setFileData({ name, type, preview });
  }, [router]);

  if (!fileData) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <div className="text-white/50 text-sm">Indlæser editor...</div>
      </div>
    );
  }

  return <LabelEditor fileData={fileData} />;
}
