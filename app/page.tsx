"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";

export default function HomePage() {
  const router = useRouter();
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFileAccepted = useCallback(
    (file: File, previewUrl: string) => {
      // Store file data in sessionStorage for the editor
      sessionStorage.setItem("labelFile_name", file.name);
      sessionStorage.setItem("labelFile_type", file.type);
      sessionStorage.setItem("labelFile_preview", previewUrl);
      router.push("/editor");
    },
    [router]
  );

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#FFD700] flex items-center justify-center">
              <span className="text-black font-bold text-sm">L</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">
              Label<span className="text-[#FFD700]">Easy</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-white/60">
            <a href="#" className="hover:text-white transition-colors">Produkter</a>
            <a href="#" className="hover:text-white transition-colors">Materialer</a>
            <a href="#" className="hover:text-white transition-colors">Priser</a>
            <a href="#" className="hover:text-white transition-colors">Om os</a>
          </nav>
          <button className="hidden md:block text-sm bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors">
            Log ind
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col">
        <section className="relative overflow-hidden px-6 py-20 md:py-32">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700] text-sm px-4 py-2 rounded-full mb-6">
              <span className="w-2 h-2 rounded-full bg-[#FFD700] animate-pulse" />
              Hurtig levering – 3-5 hverdage
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
              Professionelle labels{" "}
              <span className="text-[#FFD700]">der skiller sig ud</span>
            </h1>

            <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-12">
              Upload dit design og få det trykt på premium vinyl, holografisk
              folie, gennemsigtig materiale eller glitter. Ingen minimumbestilling.
            </p>

            {/* Upload area */}
            <div className="max-w-2xl mx-auto">
              <FileUpload
                onFileAccepted={handleFileAccepted}
                isDraggingOver={isDraggingOver}
                setIsDraggingOver={setIsDraggingOver}
              />
            </div>

            <p className="mt-4 text-sm text-white/40">
              Understøtter PNG, JPG, SVG og PDF • Maks 50 MB
            </p>
          </div>
        </section>

        {/* Materials showcase */}
        <section className="px-6 py-16 border-t border-white/10">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-12">
              Vælg dit materiale
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { name: "Vinyl", desc: "Holdbar og vandtæt", bgClass: "bg-gradient-to-br from-gray-200 to-white", emoji: "🏷️" },
                { name: "Holografisk", desc: "Regnbueeffekt", bgClass: "bg-gradient-to-br from-pink-400 via-yellow-300 to-cyan-400", emoji: "✨" },
                { name: "Gennemsigtig", desc: "Klar folie", bgClass: "bg-gradient-to-br from-white/20 to-white/5 border border-white/20", emoji: "💎" },
                { name: "Glitter", desc: "Glimrende effekt", bgClass: "bg-gradient-to-br from-yellow-300 to-amber-400", emoji: "⭐" },
              ].map((mat) => (
                <div
                  key={mat.name}
                  className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 hover:border-[#FFD700]/40 transition-all cursor-pointer group"
                >
                  <div className={`w-16 h-16 rounded-xl ${mat.bgClass} mx-auto mb-4 flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform`}>
                    {mat.emoji}
                  </div>
                  <h3 className="text-white font-semibold mb-1">{mat.name}</h3>
                  <p className="text-white/50 text-sm">{mat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-16 border-t border-white/10">
          <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-8">
            {[
              { icon: "🚀", title: "Hurtig produktion", desc: "Fra ordre til levering på 3-5 hverdage. Express tilgængeligt." },
              { icon: "💎", title: "Premium kvalitet", desc: "UV-bestandig og vandtæt vinyl med skarp farvegengivelse." },
              { icon: "🎨", title: "Dit design", desc: "Upload dit eget design og tilpas størrelse, antal og materiale." },
            ].map((feature) => (
              <div key={feature.title} className="text-center">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-white font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-8 text-center text-white/30 text-sm">
        © 2024 LabelEasy. Alle rettigheder forbeholdes.
      </footer>
    </div>
  );
}
